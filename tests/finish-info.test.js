process.env.TZ = "America/Sao_Paulo"
const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// ---- Slice 006: finish time, remaining time in the tooltip, layer

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// A status as the widget holds it after reading the given fixture.
function status(fixture, prev) {
  return M.applyReading(prev || M.initialStatus("k#0"), reading(fixture), 1000)
}

// Local wall-clock time (the fixed TZ above) as epoch milliseconds.
function at(y, mo, d, h, mi, s) {
  return new Date(y, mo - 1, d, h, mi, s || 0).getTime()
}

// ---- US1: finish time

test("formatFinish: 24 h, rounded to the minute, with the day when it is not today", () => {
  const now = at(2026, 9, 30, 16, 15) // Wednesday
  assert.equal(M.formatFinish(at(2026, 9, 30, 16, 52, 10), now), "16:52")
  assert.equal(M.formatFinish(at(2026, 9, 30, 16, 52, 40), now), "16:53", "rounds to the nearest minute")
  assert.equal(M.formatFinish(at(2026, 10, 1, 2, 10), now), "tomorrow 02:10")
  assert.equal(M.formatFinish(at(2026, 10, 1, 9, 5), now), "tomorrow 09:05", "leading zeros")
  assert.equal(M.formatFinish(at(2026, 9, 30, 23, 59, 40), now), "tomorrow 00:00", "rounding crosses midnight")
  assert.equal(M.formatFinish(at(2026, 10, 3, 8, 0), now), "Sat 08:00")
  assert.equal(M.formatFinish(at(2026, 10, 6, 8, 0), now), "Tue 08:00", "six days ahead")
  assert.equal(M.formatFinish(at(2026, 10, 7, 8, 0), now), "7 Oct 08:00", "a week or more")
  for (const v of [null, undefined, NaN, "x"]) {
    assert.equal(M.formatFinish(v, now), "")
    assert.equal(M.formatFinish(now, v), "")
  }
})

test("formatFinish follows the local clock across a daylight-saving change", () => {
  // The TZ of this process is already fixed; run a child with New York's.
  const { execFileSync } = require("node:child_process")
  const code = `
    const M = require(${JSON.stringify(require.resolve("../Model.js"))})
    const now = new Date(2026, 10, 1, 0, 30).getTime()   // 1 Nov 2026 00:30 EDT
    const end = now + 3 * 3600 * 1000                     // three hours later: 02:30 EST
    process.stdout.write(M.formatFinish(end, now))`
  const out = execFileSync(process.execPath, ["-e", code], { env: Object.assign({}, process.env, { TZ: "America/New_York" }), encoding: "utf8" })
  assert.equal(out, "02:30")
})

const voron = () => M.normalizePrinters([{ name: "Voron", address: "voron.local" }])[0]
const withEstimate = (s, seconds) => Object.assign({}, s, { estimate: { filename: s.filename, seconds, pending: false, seq: 1 } })

test("detailFor.finishText is now + the panel's remaining time, and only with one", () => {
  const p = voron()
  const now = at(2026, 9, 30, 16, 15)
  const s = withEstimate(status("printing.synthetic"), 1343)
  const R = M.blendRemaining(s.remainingSec, 1343, s.printDuration, s.progress)
  assert.equal(M.detailFor(p, s, now).finishText, M.formatFinish(now + R * 1000, now))
  assert.equal(M.detailFor(p, s, now).finishText, "16:28")
  assert.equal(M.detailFor(p, status("printing"), now).finishText, "", "heat-soak without an estimate: no time known")
  assert.equal(M.detailFor(p, status("standby.synthetic"), now).finishText, "")
  const paused = withEstimate(status("paused.synthetic"), 1343)
  assert.notEqual(M.detailFor(p, paused, now).finishText, M.detailFor(p, paused, now + 10 * 60000).finishText, "later while paused")
})

// ---- US2: remaining time in the icon's tooltip

test("tooltipLine adds the remaining time while there is a print and it is known", () => {
  const p = voron()
  const printing = withEstimate(status("printing.synthetic"), 1343)
  assert.equal(M.tooltipLine(p, printing), "Voron — printing 42% · 12m left")
  const paused = withEstimate(status("paused.synthetic"), 1343)
  assert.match(M.tooltipLine(p, paused), /^Voron — paused \d+% · .+ left$/)
  assert.equal(M.tooltipLine(p, status("printing")), "Voron — printing 0% · warming up", "heat-soak: nothing printed yet")
  for (const f of ["standby.synthetic", "shutdown.synthetic", "refused"]) {
    assert.equal(M.tooltipLine(p, status(f)).indexOf("left"), -1, f)
  }
  for (const v of [null, undefined, "x"]) assert.doesNotThrow(() => M.tooltipLine(v, v))
})

test("the icon's tooltip carries it; the Printer menu does not (FR-007)", () => {
  const printers = M.normalizePrinters([{ name: "Voron", address: "voron.local" }, { name: "Biqu B1", address: "biqu.local" }])
  const statuses = {
    [printers[0].key]: withEstimate(status("printing.synthetic"), 1343),
    [printers[1].key]: status("standby.synthetic"),
  }
  assert.equal(M.buildIconState(printers, statuses, "").tooltip, "Voron — printing 42% · 12m left")
  const model = M.buildPanelModel(printers, statuses, "", 1000)
  assert.deepEqual(model.rows.map(r => r.optionLabel), ["Voron — printing 42%", "Biqu B1 — idle"])
})

// ---- US3: layer, only when the printer reports it

test("parseMetadataLayers: the file's layer_count or null", () => {
  const ok = loadFixture("metadata-ok")
  assert.equal(M.parseMetadataLayers(ok.stdout, ok.exitCode), 13)
  for (const name of ["metadata-missing", "refused"]) {
    const f = loadFixture(name)
    assert.equal(M.parseMetadataLayers(f.stdout, f.exitCode), null, name)
  }
  for (const v of [0, -1, "13", null]) assert.equal(M.parseMetadataLayers(JSON.stringify({ result: { layer_count: v } }) + "\n200", 0), null, String(v))
  for (const v of [null, undefined, 5]) assert.doesNotThrow(() => M.parseMetadataLayers(v, v))
})

test("acceptEstimate keeps the file's layer count", () => {
  const printers = [voron()]
  const key = printers[0].key
  const statuses = { [key]: status("printing.synthetic") }
  const asked = M.planEstimate(statuses, printers, 3000).statuses
  assert.equal(asked[key].estimate.layerCount, null)
  assert.equal(M.acceptEstimate(asked, key, 1, "hook.gcode", 1343, 13)[key].estimate.layerCount, 13)
  assert.equal(M.acceptEstimate(asked, key, 1, "hook.gcode", 1343)[key].estimate.layerCount, null)
  assert.equal(M.acceptEstimate(asked, key, 1, "hook.gcode", 1343, "x")[key].estimate.layerCount, null)
})

test("detailFor.layerText: printer's layer over the printer's or the file's total", () => {
  const p = voron()
  assert.equal(M.detailFor(p, status("printing-layers.synthetic"), 1000).layerText, "12/62")
  const noTotal = status("printing-layer-no-total.synthetic")
  assert.equal(M.detailFor(p, noTotal, 1000).layerText, "", "no total anywhere")
  const withFile = Object.assign({}, noTotal, { estimate: { filename: noTotal.filename, seconds: 1343, layerCount: 13, pending: false, seq: 1 } })
  assert.equal(M.detailFor(p, withFile, 1000).layerText, "5/13")
  assert.equal(M.detailFor(p, status("printing"), 1000).layerText, "", "the Voron reports no layer")
  const over = Object.assign({}, status("printing-layers.synthetic"), { currentLayer: 70 })
  assert.equal(M.detailFor(p, over, 1000).layerText, "62/62", "never past the total (FR-010)")
  const idle = Object.assign({}, status("standby.synthetic"), { currentLayer: 3, totalLayer: 62 })
  assert.equal(M.detailFor(p, idle, 1000).layerText, "", "no print, no layer")
})

// ---- Warm-up: a print that has not extruded anything yet (reported on the Voron, 2026-09-30)

test("while warming up there is no finish time and the remaining time says so", () => {
  const p = voron()
  const now = at(2026, 9, 30, 17, 0, 50)
  const soak = withEstimate(status("printing"), 379) // real Voron heat-soak: print_duration 0
  assert.equal(soak.printDuration, 0)
  const d = M.detailFor(p, soak, now)
  assert.equal(d.remainingText, "6m + warm-up")
  assert.equal(d.finishText, "", "no clock time: the warm-up length is unknown")
  assert.equal(M.tooltipLine(p, soak), "Voron — printing 0% · warming up")
  const noEstimate = M.detailFor(p, status("printing"), now)
  assert.deepEqual([noEstimate.remainingText, noEstimate.finishText], ["—", ""])
})

test("once something is printed, the finish time and the time left come back", () => {
  const p = voron()
  const now = at(2026, 9, 30, 17, 30)
  const started = withEstimate(Object.assign({}, status("printing"), { printDuration: 12, progress: 0.06 }), 379)
  const d = M.detailFor(p, started, now)
  assert.equal(d.remainingText.indexOf("warm-up"), -1)
  assert.notEqual(d.finishText, "")
  assert.match(M.tooltipLine(p, started), / left$/)
  const paused = withEstimate(status("paused.synthetic"), 1343)
  assert.equal(M.detailFor(p, paused, now).remainingText.indexOf("warm-up"), -1, "paused mid-print is not warm-up")
})
