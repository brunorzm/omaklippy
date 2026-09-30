const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// ---- Slice 007: restart the firmware from the panel

const printers = () => M.normalizePrinters([{ name: "Voron", address: "192.168.1.50" }])
const printer = () => printers()[0]

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// A status as the widget holds it after reading the given fixture.
function from(fixture, prev) {
  return M.applyReading(prev || M.initialStatus(printer().key), reading(fixture), 1000)
}

function action(name) {
  const f = loadFixture(name)
  return M.parseActionResponse(f.stdout, f.exitCode)
}

// ---- Availability (US1, FR-001, FR-002)

const RESTARTABLE = ["shutdown", "shutdown.synthetic", "klippy-error.synthetic"]
const NOT_RESTARTABLE = ["startup", "klippy-restarting", "klippy-disconnected", "print-error.synthetic",
  "unauthorized", "timeout", "standby.synthetic", "printing.synthetic", "paused.synthetic"]

test("canRestartFirmware: only an error with Klipper in shutdown or error", () => {
  for (const f of RESTARTABLE) assert.equal(M.canRestartFirmware(from(f)), true, f)
  for (const f of NOT_RESTARTABLE) assert.equal(M.canRestartFirmware(from(f)), false, f)
  assert.equal(from("timeout").state, "offline")
  for (const bad of [null, undefined, {}, "lixo", 42]) assert.equal(M.canRestartFirmware(bad), false)
})

test("actionsFor adds firmwareRestart to the per-state table, nothing else changes", () => {
  for (const f of RESTARTABLE) assert.deepEqual(M.actionsFor(from(f)), ["firmwareRestart"], f)
  for (const f of ["startup", "klippy-restarting", "klippy-disconnected", "print-error.synthetic", "unauthorized", "timeout"])
    assert.deepEqual(M.actionsFor(from(f)), [], f)
  for (const f of ["standby.synthetic", "printing.synthetic", "paused.synthetic"]) {
    const s = from(f)
    assert.deepEqual(M.actionsFor(s), M.availableActions(s.state), f)
  }
  for (const bad of [null, undefined, {}, "lixo"]) assert.deepEqual(M.actionsFor(bad), [])
  const s = from("shutdown")
  assert.notEqual(M.actionsFor(s), M.actionsFor(s), "a new list each time")
  assert.deepEqual(M.availableActions("error"), [], "the slice 002 table is unchanged")
})

test("the button goes away as soon as Klipper starts restarting (503 clears klippyState)", () => {
  const restarting = from("klippy-restarting", from("shutdown"))
  assert.equal(restarting.klippyState, "")
  assert.equal(M.canRestartFirmware(restarting), false)
})

// ---- Sending and the panel (US1, FR-003 to FR-005, FR-009)

const wrap = pc => { const c = {}; c[printer().key] = pc; return c }

test("planCommand sends firmwareRestart to /printer/firmware_restart in the busy slot", () => {
  const p = printer()
  const plan = M.planCommand({}, p, from("shutdown"), "firmwareRestart", 3000, 5)
  assert.ok(plan.request)
  const entry = plan.commands[p.key]
  assert.deepEqual(entry.busy, { action: "firmwareRestart", seq: 1, startedAt: 5 })
  const args = plan.request.args
  assert.equal(args[args.length - 1], p.baseUrl + "/printer/firmware_restart")
  assert.equal(args[args.indexOf("-X") + 1], "POST")
  assert.equal(args[args.indexOf("--max-time") + 1], "60")
  assert.equal(plan.request.guardMs, 61000)

  const again = M.planCommand(plan.commands, p, from("shutdown"), "firmwareRestart", 3000, 6)
  assert.equal(again.request, null, "double click")
  assert.equal(again.commands, plan.commands)

  const stopping = wrap(Object.assign(M.emptyCommands(), { estop: { action: "emergencyStop", seq: 1, startedAt: 0 }, seq: 1 }))
  assert.equal(M.planCommand(stopping, p, from("shutdown"), "firmwareRestart", 3000, 6).request, null, "estop pending")

  for (const f of ["startup", "klippy-restarting", "print-error.synthetic", "standby.synthetic"])
    assert.equal(M.planCommand({}, p, from(f), "firmwareRestart", 3000, 6).request, null, f)
})

test("buildActionsModel in shutdown: one plain button on the primary row, no emergency stop", () => {
  const p = printer()
  const m = M.buildActionsModel(p, from("shutdown"), M.emptyCommands())
  assert.deepEqual(m.primary, [{
    id: "firmwareRestart", label: "Restart firmware", glyph: "\u{f0709}", confirm: true, urgent: false, busy: false, enabled: true
  }])
  assert.equal(m.emergency, null)
  assert.equal(m.web !== null, p.webUrl !== "")
  assert.deepEqual(M.cursorStops({ options: [], actions: m }), p.webUrl ? ["firmwareRestart", "openWebUi"] : ["firmwareRestart"])

  const running = M.planCommand({}, p, from("shutdown"), "firmwareRestart", 3000, 5).commands[p.key]
  const busy = M.buildActionsModel(p, from("shutdown"), running)
  assert.equal(busy.primary[0].busy, true)
  assert.equal(busy.primary[0].enabled, false)
  assert.equal(M.cursorStops({ options: [], actions: busy }).indexOf("firmwareRestart"), -1)
})

test("confirmation texts for firmwareRestart", () => {
  assert.equal(M.confirmMessage("firmwareRestart", "Voron"), "Restart the firmware on Voron? Klipper and the printer's boards will restart.")
  assert.equal(M.confirmLabel("firmwareRestart"), "Restart")
})

test("a successful restart frees the slot without a failure", () => {
  const p = printer()
  const plan = M.planCommand({}, p, from("shutdown"), "firmwareRestart", 3000, 5)
  const done = M.acceptCommandResult(plan.commands, p.key, plan.request.seq, action("action-ok.synthetic"))
  assert.equal(done[p.key].busy, null)
  assert.equal(done[p.key].failure, null)
})

// ---- Notifications (FR-010)

test("the restart sequence raises no notification, protected or not", () => {
  const seq = ["shutdown", "klippy-restarting", "startup", "standby.synthetic"]
  for (const prot of [true, false]) {
    let w = M.emptyWatch()
    let prev = null
    const events = []
    for (const f of seq) {
      prev = from(f, prev)
      const r = M.observe(w, prev, prot)
      w = r.watch
      events.push(...r.events)
    }
    assert.deepEqual(events, [], "protected " + prot)
  }
})

// ---- Failures (US2, FR-008)

function failWith(fixture) {
  const p = printer()
  const plan = M.planCommand({}, p, from("shutdown"), "firmwareRestart", 3000, 5)
  return M.acceptCommandResult(plan.commands, p.key, plan.request.seq, action(fixture))
}

test("a failed restart shows its reason under the restart label", () => {
  const key = printer().key
  const cases = [
    ["action-klippy-disconnected.synthetic", "Restart firmware failed: Klippy Host not connected"],
    ["action-refused.synthetic", "Restart firmware failed: Macro CANCEL_PRINT failed: heater not ready"],
    ["timeout", "Restart firmware failed: no response (timeout) — check the printer before trying again"],
    ["refused", "Restart firmware failed: connection refused"],
  ]
  for (const [fixture, text] of cases) {
    const c = failWith(fixture)
    assert.equal(c[key].busy, null, fixture)
    assert.deepEqual(c[key].failure, { action: "firmwareRestart", message: text }, fixture)
  }
})

test("after a failure the button is back, the reason shows and clearFailures drops it", () => {
  const p = printer()
  const c = failWith("action-klippy-disconnected.synthetic")
  const m = M.buildActionsModel(p, from("shutdown"), c[p.key])
  assert.equal(m.failureText, "Restart firmware failed: Klippy Host not connected")
  assert.equal(m.primary[0].enabled, true)
  assert.equal(M.clearFailures(c)[p.key].failure, null)
})

test("a fault that persists brings the button back after the restart (US2.2)", () => {
  const restarting = from("klippy-restarting", from("shutdown"))
  const starting = from("startup", restarting)
  const again = from("shutdown", starting)
  assert.deepEqual([restarting, starting, again].map(M.canRestartFirmware), [false, false, true])
})
