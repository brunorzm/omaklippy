const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// ---- Slice 005: printer message, slicer estimate, pause marker

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// A status as the widget holds it after reading the given fixture.
function status(fixture, prev) {
  return M.applyReading(prev || M.initialStatus("k#0"), reading(fixture), 1000)
}

// ---- US1: the printer's message, only while there is a print

const voron = () => M.normalizePrinters([{ name: "Voron", address: "voron.local" }])[0]

test("detailFor shows the printer's message while printing or paused", () => {
  const p = voron()
  assert.equal(M.detailFor(p, status("printing"), 1000).messageText, "Aquecendo a Camara")
  assert.equal(M.detailFor(p, status("printing-message.synthetic"), 1000).messageText, "Nivelando a mesa")
  const paused = Object.assign(status("paused.synthetic"), { message: "Troque o filamento" })
  assert.equal(M.detailFor(p, paused, 1000).messageText, "Troque o filamento")
})

test("no message line without a message or without a print (FR-002, FR-004)", () => {
  const p = voron()
  assert.equal(M.detailFor(p, status("printing.synthetic"), 1000).messageText, "")
  assert.equal(M.detailFor(p, status("standby-stale-message.synthetic"), 1000).messageText, "")
  assert.equal(M.detailFor(p, status("shutdown.synthetic"), 1000).messageText, "")
  assert.equal(M.detailFor(p, status("refused", status("printing")), 1000).messageText, "")
})

test("the panel model carries the selected printer's message", () => {
  const printers = [voron()]
  const statuses = { [printers[0].key]: status("printing") }
  assert.equal(M.buildPanelModel(printers, statuses, "", 1000).selected.messageText, "Aquecendo a Camara")
})

// ---- US2: slicer estimate

function fixtureOut(name) {
  return loadFixture(name)
}

test("buildMetadataArgs encodes the whole file name", () => {
  assert.deepEqual(M.buildMetadataArgs("http://v", "a b/c.gcode", 3),
    M.buildCurlArgs("http://v/server/files/metadata?filename=a%20b%2Fc.gcode", 3))
  for (const [u, f] of [["", "x.gcode"], ["http://v", ""], [null, "x"], ["http://v", null]]) assert.deepEqual(M.buildMetadataArgs(u, f, 3), [])
})

test("parseMetadataResponse: the slicer's estimated_time or null", () => {
  const ok = fixtureOut("metadata-ok")
  assert.equal(M.parseMetadataResponse(ok.stdout, ok.exitCode), 1343)
  const missing = fixtureOut("metadata-missing")
  assert.equal(M.parseMetadataResponse(missing.stdout, missing.exitCode), null)
  for (const name of ["refused", "timeout", "dns", "garbage.synthetic"]) {
    const f = fixtureOut(name)
    assert.equal(M.parseMetadataResponse(f.stdout, f.exitCode), null, name)
  }
  for (const v of [0, -5, "12", null]) {
    assert.equal(M.parseMetadataResponse(JSON.stringify({ result: { estimated_time: v } }) + "\n200", 0), null, String(v))
  }
  assert.equal(M.parseMetadataResponse('{"x":1}\n200', 0), null)
  for (const v of [null, undefined, 5, {}]) assert.doesNotThrow(() => M.parseMetadataResponse(v, v))
})

function fleet(fixture) {
  const printers = M.normalizePrinters([{ name: "Voron", address: "voron.local" }, { name: "Bad", address: "a b" }])
  const statuses = M.reconcileStatuses({}, printers)
  if (fixture) statuses[printers[0].key] = M.applyReading(statuses[printers[0].key], reading(fixture), 1000)
  return { printers, statuses, key: printers[0].key }
}

test("planEstimate asks once per file for a printer with a print", () => {
  const { printers, statuses, key } = fleet("printing.synthetic")
  const first = M.planEstimate(statuses, printers, 3000)
  assert.equal(first.requests.length, 1)
  assert.deepEqual(first.requests[0], { key, seq: 1, filename: "hook.gcode", args: M.buildMetadataArgs("http://voron.local", "hook.gcode", 3) })
  assert.deepEqual(first.statuses[key].estimate, { filename: "hook.gcode", seconds: null, pending: true, seq: 1 })
  const again = M.planEstimate(first.statuses, printers, 3000)
  assert.equal(again.statuses, first.statuses, "pending: nothing new")
  assert.deepEqual(again.requests, [])
  const done = M.acceptEstimate(first.statuses, key, 1, "hook.gcode", 1343)
  assert.deepEqual(done[key].estimate, { filename: "hook.gcode", seconds: 1343, pending: false, seq: 1 })
  assert.deepEqual(M.planEstimate(done, printers, 3000).requests, [], "ready: not asked again")
  const failed = M.acceptEstimate(first.statuses, key, 1, "hook.gcode", null)
  assert.deepEqual(M.planEstimate(failed, printers, 3000).requests, [], "a failure counts as this print's fetch")
})

test("planEstimate skips idle, offline, nameless and invalid printers", () => {
  for (const f of ["standby.synthetic", "refused", "shutdown.synthetic"]) {
    const { printers, statuses } = fleet(f)
    const r = M.planEstimate(statuses, printers, 3000)
    assert.equal(r.statuses, statuses, f)
    assert.deepEqual(r.requests, [], f)
  }
  const { printers, statuses, key } = fleet("printing.synthetic")
  const nameless = Object.assign({}, statuses, { [key]: Object.assign({}, statuses[key], { filename: "" }) })
  assert.deepEqual(M.planEstimate(nameless, printers, 3000).requests, [])
  for (const v of [null, undefined, "x"]) assert.doesNotThrow(() => M.planEstimate(v, v, v))
})

test("acceptEstimate ignores stale or foreign answers", () => {
  const { printers, statuses, key } = fleet("printing.synthetic")
  const asked = M.planEstimate(statuses, printers, 3000).statuses
  assert.equal(M.acceptEstimate(asked, key, 2, "hook.gcode", 10), asked, "wrong seq")
  assert.equal(M.acceptEstimate(asked, key, 1, "other.gcode", 10), asked, "other file")
  assert.equal(M.acceptEstimate(asked, "gone#9", 1, "hook.gcode", 10), asked)
  assert.equal(M.acceptEstimate(statuses, key, 1, "hook.gcode", 10), statuses, "never asked")
  for (const v of [null, undefined, "x"]) assert.doesNotThrow(() => M.acceptEstimate(v, v, v, v, v))
})

test("the estimate lives as long as the print (FR-009)", () => {
  const { printers, statuses, key } = fleet("printing.synthetic")
  const done = M.acceptEstimate(M.planEstimate(statuses, printers, 3000).statuses, key, 1, "hook.gcode", 1343)
  const est = done[key].estimate
  assert.deepEqual(M.applyReading(done[key], reading("paused.synthetic"), 2000).estimate, est, "same print")
  for (const f of ["standby.synthetic", "refused", "complete.synthetic"]) {
    assert.equal(M.applyReading(done[key], reading(f), 2000).estimate, null, f)
  }
  const other = reading("printing.synthetic"); other.filename = "other.gcode"
  assert.equal(M.applyReading(done[key], other, 2000).estimate, null, "another file")
  // Idle, then the same file again: a new print, a new fetch.
  const idle = Object.assign({}, done, { [key]: M.applyReading(done[key], reading("standby.synthetic"), 3000) })
  const back = Object.assign({}, idle, { [key]: M.applyReading(idle[key], reading("printing.synthetic"), 4000) })
  assert.equal(M.planEstimate(back, printers, 3000).requests.length, 1)
})

// ---- US2: blending the two estimates

test("blendRemaining table (data-model)", () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.5, a + " ≈ " + b)
  assert.equal(M.blendRemaining(null, 1343, 0, 0), 1343, "heat-soak")
  assert.equal(M.blendRemaining(null, 1343, 10, 0.005), 1333)
  near(M.blendRemaining(1980, 1343, 20, 0.01), 0.99 * 1323 + 0.01 * 1980)
  near(M.blendRemaining(700, 1343, 700, 0.5), 671.5)
  near(M.blendRemaining(14.14, 1343, 1400, 0.99), 14.14)
  assert.equal(M.blendRemaining(null, 1343, 1400, 0.99), null, "slicer overrun and no progress estimate")
  assert.equal(M.blendRemaining(900, null, 300, 0.25), 900, "no slicer estimate: as before")
  assert.equal(M.blendRemaining(null, null, 0, 0), null)
  assert.equal(M.blendRemaining(0, null, 300, 0.99), null, "never zero")
  for (const v of [null, undefined, "x", NaN]) assert.doesNotThrow(() => M.blendRemaining(v, v, v, v))
})

// Remaining time along a synthetic print, as the panel would show it each step.
function timeline(E, T, step, wrongAt) {
  const out = []
  for (let p = 0; p <= 0.99 + 1e-9; p += step) {
    const d = p * T
    let P = M.estimateRemaining("printing", p, d)
    if (wrongAt !== undefined && Math.abs(p - wrongAt) < step / 2 && P !== null) P *= 3
    out.push({ p, d, S: E - d, P, R: M.blendRemaining(P, E, d, p) })
  }
  return out
}

test("along a print the remaining time is never zero or negative, never jumps, and starts on the slicer", () => {
  for (const [E, T, wrongAt] of [[1343, 1500], [1343, 1500, 0.02], [1343, 1100], [1343, 2600]]) {
    const line = timeline(E, T, 0.01, wrongAt)
    for (const s of line) assert.ok(s.R === null || s.R > 0, "SC-004 at " + s.p)
    for (const s of line.filter(s => s.p <= 0.1 && s.P !== null && s.S > 0)) {
      assert.ok(Math.abs(s.R - s.S) <= 0.1 * Math.abs(s.P - s.S) + 1e-9, "SC-003 at " + s.p)
    }
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i]
      if (a.p < 0.02 || a.R === null || b.R === null) continue
      if (a.S > 0 && b.S <= 0) continue // the slicer's estimate runs out: the one recorded jump
      if (wrongAt !== undefined && (Math.abs(a.p - wrongAt) < 0.005 || Math.abs(b.p - wrongAt) < 0.005)) continue
      assert.ok(Math.abs(b.R - (a.R - (b.d - a.d))) <= 0.1 * a.R + 1e-9, "SC-007 " + E + "/" + T + " at " + b.p.toFixed(2))
    }
  }
})

test("detailFor shows the blended remaining time, or today's without an estimate", () => {
  const p = voron()
  const soak = status("printing")
  assert.equal(M.detailFor(p, soak, 1000).remainingText, "—", "no estimate yet: as before")
  const withEstimate = Object.assign({}, soak, { estimate: { filename: soak.filename, seconds: 1343, pending: false, seq: 1 } })
  assert.equal(M.detailFor(p, withEstimate, 1000).remainingText, "22m")
  assert.equal(M.detailFor(p, status("standby.synthetic"), 1000).remainingText, "")
})

// ---- US3: what the pause marker keys on

test("buildIconState reports paused, printing and error for the printer the icon stands for", () => {
  const printers = [voron()]
  const icon = f => M.buildIconState(printers, { [printers[0].key]: status(f) }, "").mode
  assert.equal(icon("paused.synthetic"), "paused")
  assert.equal(icon("printing.synthetic"), "printing")
  assert.equal(icon("shutdown.synthetic"), "error")
})
