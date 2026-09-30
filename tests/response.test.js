const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

function parse(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

test("parseResponse reads a printing snapshot", () => {
  const r = parse("printing.synthetic")
  assert.equal(r.reachable, true)
  assert.equal(r.httpStatus, 200)
  assert.equal(r.errorMessage, "")
  assert.equal(r.klippyState, "ready")
  assert.equal(r.printState, "printing")
  assert.equal(r.progress, 0.427)
  assert.equal(r.printDuration, 1200.1)
  assert.equal(r.filename, "hook.gcode")
  assert.deepEqual(r.nozzle, { current: 214.8, target: 215 })
  assert.deepEqual(r.bed, { current: 60.1, target: 60 })
})

test("parseResponse turns missing objects into null/empty", () => {
  const r = parse("no-heater-bed.synthetic")
  assert.equal(r.bed, null)
  assert.equal(r.filename, "")
  assert.equal(r.errorMessage, "")
})

test("parseResponse falls back to display_status.progress", () => {
  const body = { result: { status: { webhooks: { state: "ready" }, print_stats: { state: "printing" }, display_status: { progress: 0.5 } } } }
  const r = M.parseResponse(JSON.stringify(body) + "\n200", 0)
  assert.equal(r.progress, 0.5)
})

test("parseResponse turns non-finite numbers into null", () => {
  const body = { result: { status: { webhooks: { state: "ready" }, print_stats: { state: "printing", print_duration: "x" }, virtual_sdcard: { progress: "nope" }, extruder: { temperature: null, target: 0 } } } }
  const r = M.parseResponse(JSON.stringify(body) + "\n200", 0)
  assert.equal(r.progress, null)
  assert.equal(r.printDuration, null)
  assert.equal(r.nozzle, null)
})

const stateCases = [
  ["printing.synthetic", "printing"],
  ["paused.synthetic", "paused"],
  ["standby.synthetic", "idle"],
  ["complete.synthetic", "idle"],
  ["cancelled.synthetic", "idle"],
]
for (const [fixture, expected] of stateCases) {
  test(`deriveState(${fixture}) → ${expected}`, () => {
    assert.equal(M.deriveState(parse(fixture)).state, expected)
  })
}

test("deriveState treats an empty print state as idle", () => {
  const r = M.parseResponse(JSON.stringify({ result: { status: { webhooks: { state: "ready" } } } }) + "\n200", 0)
  assert.equal(M.deriveState(r).state, "idle")
})

test("computePercent floors and caps at 99 while printing/paused", () => {
  assert.equal(M.computePercent("printing", 0.427), 42)
  assert.equal(M.computePercent("printing", 0.999), 99)
  assert.equal(M.computePercent("paused", 1), 99)
  assert.equal(M.computePercent("printing", -0.1), 0)
  assert.equal(M.computePercent("idle", 0.5), null)
  assert.equal(M.computePercent("printing", null), null)
})

test("estimateRemaining uses print_duration / progress", () => {
  assert.equal(M.estimateRemaining("printing", 0.5, 600), 600)
  assert.equal(M.estimateRemaining("paused", 0.25, 300), 900)
  assert.equal(M.estimateRemaining("printing", 0.005, 600), null)
  assert.equal(M.estimateRemaining("printing", 0.5, 0), null)
  assert.equal(M.estimateRemaining("idle", 0.5, 600), null)
  assert.equal(M.estimateRemaining("printing", null, 600), null)
})

test("stateLabel maps the five states", () => {
  assert.equal(M.stateLabel("printing"), "printing")
  assert.equal(M.stateLabel("paused"), "paused")
  assert.equal(M.stateLabel("idle"), "idle")
  assert.equal(M.stateLabel("error"), "error")
  assert.equal(M.stateLabel("offline"), "offline")
})

test("initialStatus is offline, waiting for the first answer", () => {
  assert.deepEqual(M.initialStatus("k#0"), {
    key: "k#0",
    state: "offline",
    reason: "waiting for first response",
    percent: null,
    remainingSec: null,
    filename: "",
    nozzle: null,
    bed: null,
    lastSeenAt: null,
    offlineSince: null,
    pending: false,
    seq: 0,
    followUp: false, // slice 002: fresh query after a printer command
    printState: "", // slice 004: raw print_stats.state, for notifications
    requestedAt: null,
    klippyState: "",
    message: "", // slice 005: what the printer shows, progress and printing time for the estimate
    progress: null,
    printDuration: null,
    estimate: null,
  })
})

test("applyReading on a reachable printer fills the status", () => {
  const s = M.applyReading(M.initialStatus("k"), parse("printing.synthetic"), 1000)
  assert.equal(s.state, "printing")
  assert.equal(s.percent, 42)
  assert.equal(s.filename, "hook.gcode")
  assert.deepEqual(s.nozzle, { current: 214.8, target: 215 })
  assert.equal(s.offlineSince, null)
  assert.equal(s.lastSeenAt, 1000)
  assert.ok(s.remainingSec > 1600 && s.remainingSec < 1611)
})

test("real Voron standby capture (Klipper v0.13, Moonraker v0.11) parses as idle", () => {
  const r = parse("standby")
  assert.equal(r.reachable, true)
  assert.equal(r.klippyState, "ready")
  assert.equal(r.printState, "standby")
  assert.ok(r.nozzle && r.nozzle.target === 0)
  assert.deepEqual(M.deriveState(r), { state: "idle", reason: "" })
})

test("real Voron capture while heat-soaking: printing, 0%, remaining unknown", () => {
  const r = parse("printing")
  assert.equal(M.deriveState(r).state, "printing")
  assert.equal(r.filename, "CONE1 60_ABS_11h57m.gcode")
  assert.equal(M.computePercent("printing", r.progress), 0)
  assert.equal(M.estimateRemaining("printing", r.progress, r.printDuration), null, "print_duration is still 0")
  assert.deepEqual(r.bed, { current: 96.87, target: 118 })
})

test("real BIQU capture in MCU shutdown: error with Klipper's message", () => {
  const r = parse("shutdown")
  const d = M.deriveState(r)
  assert.equal(d.state, "error")
  assert.match(d.reason, /^MCU 'mcu' shutdown: ADC out of range/)
  assert.equal(r.nozzle.current, -87.76, "keeps the faulty reading, which is the point")
})

test("real Voron capture right after the print finished (complete) → idle", () => {
  const r = parse("complete")
  assert.equal(r.printState, "complete")
  assert.deepEqual(M.deriveState(r), { state: "idle", reason: "" })
  assert.equal(M.computePercent("idle", r.progress), null)
})

test("real Voron capture while paused → paused, remaining frozen but known", () => {
  const r = parse("paused")
  assert.equal(r.printState, "paused")
  assert.equal(M.deriveState(r).state, "paused")
  assert.equal(M.computePercent("paused", r.progress), 2)
  assert.ok(M.estimateRemaining("paused", r.progress, r.printDuration) > 0)
})

test("real Biqu B1 capture after the thermistor fix → idle", () => {
  const r = parse("biqu-standby")
  assert.equal(r.klippyState, "ready")
  assert.deepEqual(M.deriveState(r), { state: "idle", reason: "" })
})

// ---- Slice 005: the printer's message and the raw numbers behind the remaining time

test("parseResponse reads the printer's display message, trimmed", () => {
  assert.equal(parse("printing").displayMessage, "Aquecendo a Camara")
  assert.equal(parse("printing-message.synthetic").displayMessage, "Nivelando a mesa")
  assert.equal(parse("printing.synthetic").displayMessage, "")
  assert.equal(parse("refused").displayMessage, "")
})

test("applyReading keeps the message, raw progress and printing time", () => {
  const base = M.initialStatus("k#0")
  const printing = M.applyReading(base, parse("printing.synthetic"), 1000)
  assert.deepEqual([printing.message, printing.progress, printing.printDuration], ["", 0.427, 1200.1])
  const soak = M.applyReading(base, parse("printing"), 1000)
  assert.deepEqual([soak.message, soak.printDuration], ["Aquecendo a Camara", 0])
  assert.equal(M.applyReading(base, parse("standby.synthetic"), 1000).progress, null, "no print, no progress")
  const off = M.applyReading(soak, parse("refused"), 2000)
  assert.deepEqual([off.message, off.progress, off.printDuration], ["", null, null])
})
