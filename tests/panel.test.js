const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// One printer named Voron whose status came from the given fixture at `at`.
function single(fixture, at, prev) {
  const printers = M.normalizePrinters([{ name: "Voron", address: "192.168.1.50" }])
  const key = printers[0].key
  const base = prev || M.initialStatus(key)
  const status = fixture ? M.applyReading(base, reading(fixture), at) : base
  return { printers, key, statuses: { [key]: status } }
}

test("formatTemp", () => {
  assert.equal(M.formatTemp({ current: 214.8, target: 215 }), "215/215 °C")
  assert.equal(M.formatTemp({ current: 25.3, target: 0 }), "25 °C")
  assert.equal(M.formatTemp(null), "—")
})

test("formatDuration", () => {
  assert.equal(M.formatDuration(3725), "1h 02m")
  assert.equal(M.formatDuration(2700), "45m")
  assert.equal(M.formatDuration(59), "<1m")
  assert.equal(M.formatDuration(null), "—")
})

test("formatElapsed", () => {
  assert.equal(M.formatElapsed(95000), "1 min")
  assert.equal(M.formatElapsed(30000), "<1 min")
  assert.equal(M.formatElapsed(2 * 3600 * 1000 + 5000), "2 h")
})

test("resolveSelection without a manual choice follows pickHighlighted", () => {
  const printers = M.normalizePrinters([{ name: "A", address: "10.0.0.1" }, { name: "B", address: "10.0.0.2" }])
  const statuses = M.reconcileStatuses({}, printers)
  statuses[printers[0].key] = Object.assign({}, statuses[printers[0].key], { state: "idle" })
  statuses[printers[1].key] = Object.assign({}, statuses[printers[1].key], { state: "printing" })
  assert.equal(M.resolveSelection("", printers, statuses), printers[1].key)
  assert.equal(M.resolveSelection("", [], {}), "")
})

test("buildPanelModel while printing", () => {
  const { printers, key, statuses } = single("printing.synthetic", 1000)
  const m = M.buildPanelModel(printers, statuses, "", 20000)
  assert.equal(m.empty, false)
  assert.equal(m.showJob, true)
  assert.deepEqual(m.rows, [], "single printer → no list")
  const s = m.selected
  assert.equal(s.key, key)
  assert.equal(s.displayName, "Voron")
  assert.equal(s.state, "printing")
  assert.equal(s.stateLabel, "printing")
  assert.equal(s.metaText, "printing · 42%")
  assert.equal(s.percent, 42)
  assert.equal(s.filename, "hook.gcode")
  assert.equal(s.remainingText, "26m")
  assert.equal(s.nozzleText, "215/215 °C")
  assert.equal(s.bedText, "60/60 °C")
  assert.equal(s.showTemps, true)
  assert.equal(s.freshnessText, "updated <1 min ago")
  assert.equal(s.reason, "")
})

test("buildPanelModel while paused keeps the job block", () => {
  const { printers, statuses } = single("paused.synthetic", 1000)
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.equal(m.showJob, true)
  assert.equal(m.selected.metaText, "paused · 42%")
})

test("buildPanelModel shows '—' when the remaining time is unknown", () => {
  const { printers, key, statuses } = single("printing.synthetic", 1000)
  statuses[key] = Object.assign({}, statuses[key], { remainingSec: null })
  assert.equal(M.buildPanelModel(printers, statuses, "", 1000).selected.remainingText, "—")
})

test("buildPanelModel when idle hides the job block but keeps temperatures", () => {
  const { printers, statuses } = single("standby", 1000)
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.equal(m.showJob, false)
  assert.equal(m.selected.metaText, "idle")
  assert.equal(m.selected.showTemps, true)
})

test("buildPanelModel on error shows the reason", () => {
  const { printers, statuses } = single("klippy-disconnected.synthetic", 1000)
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.equal(m.showJob, false)
  assert.equal(m.selected.metaText, "error")
  assert.equal(m.selected.reason, "Klippy Host not connected")
  assert.equal(m.selected.showTemps, false)
})

test("buildPanelModel offline: reason, no data, 'no response for'", () => {
  const { printers, statuses } = single("timeout", 1000, M.applyReading(M.initialStatus("x"), reading("printing.synthetic"), 500))
  const m = M.buildPanelModel(printers, statuses, "", 1000 + 180000)
  assert.equal(m.showJob, false)
  assert.equal(m.selected.metaText, "offline")
  assert.equal(m.selected.reason, "no response (timeout)")
  assert.equal(m.selected.showTemps, false)
  assert.equal(m.selected.freshnessText, "no response for 3 min")
})

test("buildPanelModel before the first answer", () => {
  const { printers, statuses } = single(null, 0)
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.equal(m.selected.metaText, "offline")
  assert.equal(m.selected.reason, "waiting for first response")
  assert.equal(m.selected.freshnessText, "")
})

function fleet() {
  const printers = M.normalizePrinters([
    { name: "Voron", address: "10.0.0.1" },
    { name: "Ender", address: "10.0.0.2" },
    { name: "Prusa", address: "10.0.0.3" },
  ])
  let statuses = M.reconcileStatuses({}, printers)
  statuses[printers[0].key] = M.applyReading(statuses[printers[0].key], reading("standby"), 1000)
  statuses[printers[1].key] = M.applyReading(statuses[printers[1].key], reading("printing.synthetic"), 1000)
  statuses[printers[2].key] = M.applyReading(statuses[printers[2].key], reading("refused"), 1000)
  return { printers, statuses }
}

test("resolveSelection keeps a manual choice that still exists", () => {
  const { printers, statuses } = fleet()
  assert.equal(M.resolveSelection(printers[0].key, printers, statuses), printers[0].key)
})

test("resolveSelection falls back to the most relevant when the choice was removed", () => {
  const { printers, statuses } = fleet()
  assert.equal(M.resolveSelection("gone#7", printers, statuses), printers[1].key)
})

test("buildPanelModel lists every printer in registration order", () => {
  const { printers, statuses } = fleet()
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.deepEqual(m.rows.map(r => r.displayName), ["Voron", "Ender", "Prusa"])
  assert.deepEqual(m.rows.map(r => r.stateLabel), ["idle", "printing", "offline"])
  assert.deepEqual(m.rows.map(r => r.percentText), ["", "42%", ""])
  assert.deepEqual(m.rows.map(r => r.optionLabel), ["Voron — idle", "Ender — printing 42%", "Prusa — offline"])
  assert.deepEqual(m.options, m.rows.map(r => ({ value: r.key, label: r.optionLabel })), "dropdown options")
  assert.deepEqual(m.rows.map(r => r.selected), [false, true, false], "defaults to the highlighted printer")
  assert.equal(m.rows[0].key, printers[0].key)
  assert.equal(m.selected.displayName, "Ender")
})

test("buildPanelModel follows a manual selection", () => {
  const { printers, statuses } = fleet()
  const m = M.buildPanelModel(printers, statuses, printers[2].key, 1000)
  assert.equal(m.selected.displayName, "Prusa")
  assert.deepEqual(m.rows.map(r => r.selected), [false, false, true])
})

test("buildPanelModel without printers is the empty state", () => {
  // Slice 002 adds the (empty) actions block to every panel model; 003 its web: null; 004 notifyWarning.
  assert.deepEqual(M.buildPanelModel([], {}, "", 0), { empty: true, selected: null, showJob: false, rows: [], options: [],
    actions: { buttons: [], primary: [], emergency: null, web: null, failureText: "", filename: "" }, notifyWarning: "" })
})

test("setupCommand is the exact command shown in the empty panel", () => {
  assert.equal(
    M.setupCommand(),
    `omarchy bar set io.github.brunorzm.omaklippy printers '[{"name":"My printer","address":"192.168.1.50"}]'`
  )
})

test("tidyMessage joins hard-wrapped lines inside each paragraph", () => {
  assert.equal(M.tidyMessage("a\nb  c\n\n\nd\n e\n"), "a b c\n\nd e")
  assert.equal(M.tidyMessage("   "), "")
  assert.equal(M.tidyMessage(null), "")
})

test("buildPanelModel tidies the real BIQU shutdown message", () => {
  const { printers, statuses } = single("shutdown", 1000)
  const reason = M.buildPanelModel(printers, statuses, "", 1000).selected.reason
  assert.deepEqual(reason.split("\n\n"), [
    "MCU 'mcu' shutdown: ADC out of range",
    "Sensor 'extruder' temperature -93.855 not in range 0.000:280.000",
    "This generally occurs when a heater temperature exceeds its configured min_temp or max_temp. " +
      "Once the underlying issue is corrected, use the \"FIRMWARE_RESTART\" command to reset the firmware, " +
      "reload the config, and restart the host software. Printer is shutdown",
  ])
})

// ---- Slice 002: actions in the panel model and the keyboard cursor

test("buildPanelModel without commands still carries the selected printer's actions", () => {
  const { printers, statuses } = fleet()
  const m = M.buildPanelModel(printers, statuses, "", 1000)
  assert.equal(m.selected.displayName, "Ender")
  assert.deepEqual(m.actions.buttons.map(b => b.id), ["pause", "cancel", "emergencyStop", "openWebUi"])
  assert.equal(m.actions.failureText, "")
})

test("buildPanelModel uses the commands of the selected printer only", () => {
  const { printers, statuses } = fleet()
  const ender = printers[1]
  const running = M.planCommand({}, ender, statuses[ender.key], "pause", 3000, 1).commands
  const m = M.buildPanelModel(printers, statuses, ender.key, 1000, running)
  assert.deepEqual(m.actions, M.buildActionsModel(ender, statuses[ender.key], running[ender.key]))
  assert.equal(m.actions.primary[0].busy, true)
  const other = M.buildPanelModel(printers, statuses, printers[0].key, 1000, running)
  assert.deepEqual(other.actions.buttons.map(b => [b.id, b.busy]), [["emergencyStop", false], ["openWebUi", false]])
})

test("cursorStops lists the dropdown and the enabled buttons in reading order", () => {
  const { printers, statuses } = fleet()
  const m = M.buildPanelModel(printers, statuses, printers[1].key, 1000)
  assert.deepEqual(M.cursorStops(m), ["printer", "pause", "cancel", "emergencyStop", "openWebUi"])
  const one = single("printing.synthetic", 1000)
  assert.deepEqual(M.cursorStops(M.buildPanelModel(one.printers, one.statuses, "", 1000)), ["pause", "cancel", "emergencyStop", "openWebUi"])
  const running = M.planCommand({}, printers[1], statuses[printers[1].key], "pause", 3000, 1).commands
  const busy = M.buildPanelModel(printers, statuses, printers[1].key, 1000, running)
  assert.deepEqual(M.cursorStops(busy), ["printer", "emergencyStop", "openWebUi"], "disabled buttons are skipped")
  assert.deepEqual(M.cursorStops(M.buildPanelModel([], {}, "", 0)), [])
})

test("stepCursor moves without wrapping and recovers from a stop that left", () => {
  const stops = ["printer", "pause", "cancel", "emergencyStop"]
  assert.equal(M.stepCursor(stops, "", 1), "printer")
  assert.equal(M.stepCursor(stops, "", -1), "printer")
  assert.equal(M.stepCursor(stops, "printer", 1), "pause")
  assert.equal(M.stepCursor(stops, "cancel", -1), "pause")
  assert.equal(M.stepCursor(stops, "emergencyStop", 1), "emergencyStop")
  assert.equal(M.stepCursor(stops, "printer", -1), "printer")
  assert.equal(M.stepCursor(stops, "resume", 1), "printer", "a button that went away")
  assert.equal(M.stepCursor([], "pause", 1), "")
})

test("panel cursor functions never throw", () => {
  for (const v of [null, undefined, {}, "lixo"]) {
    assert.deepEqual(M.cursorStops(v), [])
    assert.equal(typeof M.stepCursor(v, v, v), "string")
  }
})

// ---- Slice 003: Open web UI in the panel model and the cursor

test("Open web UI is the last cursor stop in every state, and absent without a web address", () => {
  const { printers, statuses } = fleet()
  // Prusa answered "refused": offline, so only the web UI is left.
  const offline = M.buildPanelModel(printers, statuses, printers[2].key, 1000)
  assert.equal(offline.selected.state, "offline")
  assert.deepEqual(M.cursorStops(offline), ["printer", "openWebUi"])
  const bad = M.normalizePrinters([{ name: "Bad", address: "a b" }])
  const badModel = M.buildPanelModel(bad, M.reconcileStatuses({}, bad), "", 1000)
  assert.deepEqual(badModel.actions.buttons, [])
  assert.deepEqual(M.cursorStops(badModel), [])
  assert.equal(M.buildPanelModel([], {}, "", 0).actions.web, null)
})

test("an opening in flight takes Open web UI out of the cursor", () => {
  const { printers, statuses } = fleet()
  const ender = printers[1]
  const opening = M.planOpenWeb({}, ender, 1).commands
  const m = M.buildPanelModel(printers, statuses, ender.key, 1000, opening)
  assert.deepEqual(M.cursorStops(m), ["printer", "pause", "cancel", "emergencyStop"])
})

// ---- Slice 004: notifications unavailable

test("buildPanelModel carries the notifications warning, empty or not", () => {
  const { printers, statuses } = fleet()
  const w = "Notifications unavailable: notify-send not found"
  assert.equal(M.buildPanelModel(printers, statuses, "", 1000).notifyWarning, "")
  assert.equal(M.buildPanelModel(printers, statuses, "", 1000, {}, w).notifyWarning, w)
  assert.equal(M.buildPanelModel([], {}, "", 0, {}, w).notifyWarning, w)
  assert.equal(M.buildPanelModel([], {}, "", 0, {}, 5).notifyWarning, "")
})
