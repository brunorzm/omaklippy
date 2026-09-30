const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

const printers = () => M.normalizePrinters([
  { name: "Voron", address: "192.168.1.50" },
  { name: "Bad", address: "a b" },
])

function status(state, extra) {
  return Object.assign(M.initialStatus(printers()[0].key), { state }, extra || {})
}

function action(name) {
  const f = loadFixture(name)
  return M.parseActionResponse(f.stdout, f.exitCode)
}

// ---- Availability and request

test("availableActions follows the printer state", () => {
  assert.deepEqual(M.availableActions("printing"), ["pause", "cancel", "emergencyStop"])
  assert.deepEqual(M.availableActions("paused"), ["resume", "cancel", "emergencyStop"])
  assert.deepEqual(M.availableActions("idle"), ["emergencyStop"])
  for (const s of ["error", "offline", "", null, undefined, 42, {}]) assert.deepEqual(M.availableActions(s), [])
})

test("ACTIONS table: paths, confirmation and slots", () => {
  assert.equal(M.ACTIONS.pause.path, "/printer/print/pause")
  assert.equal(M.ACTIONS.resume.path, "/printer/print/resume")
  assert.equal(M.ACTIONS.cancel.path, "/printer/print/cancel")
  assert.equal(M.ACTIONS.emergencyStop.path, "/printer/emergency_stop")
  assert.deepEqual(Object.keys(M.ACTIONS).filter(k => M.ACTIONS[k].confirm).sort(), ["cancel", "emergencyStop", "firmwareRestart"])
  assert.deepEqual(Object.keys(M.ACTIONS).filter(k => M.ACTIONS[k].slot === "estop"), ["emergencyStop"])
  assert.equal(M.COMMAND_TIMEOUT_SEC, 60)
})

test("buildActionArgs is a POST with a short connect and a long total timeout", () => {
  assert.deepEqual(M.buildActionArgs("http://voron.local", "pause", 3), [
    "curl", "-sS", "-X", "POST", "--connect-timeout", "3", "--max-time", "60",
    "-H", "Accept: application/json", "-w", "\n%{http_code}", "http://voron.local/printer/print/pause"])
  assert.equal(M.buildActionArgs("http://v", "emergencyStop", 5).slice(-1)[0], "http://v/printer/emergency_stop")
  assert.deepEqual(M.buildActionArgs("http://v", "explode", 3), [])
  assert.deepEqual(M.buildActionArgs("", "pause", 3), [])
  assert.deepEqual(M.buildActionArgs(null, null, null), [])
})

// ---- Response

test("parseActionResponse: success on any 2xx", () => {
  assert.deepEqual(action("action-ok.synthetic"), { ok: true, message: "" })
  assert.deepEqual(M.parseActionResponse("\n204", 0), { ok: true, message: "" })
  assert.deepEqual(M.parseActionResponse("not json\n200", 0), { ok: true, message: "" })
})

test("parseActionResponse: refusals carry the printer's message, tidied", () => {
  assert.deepEqual(action("action-refused.synthetic"), { ok: false, message: "Macro CANCEL_PRINT failed: heater not ready" })
  assert.deepEqual(action("action-klippy-disconnected.synthetic"), { ok: false, message: "Klippy Host not connected" })
  assert.deepEqual(action("unauthorized"), { ok: false, message: M.TEXT.unauthorized })
  assert.deepEqual(M.parseActionResponse("\n500", 0), { ok: false, message: "HTTP 500" })
  assert.deepEqual(M.parseActionResponse("\n302", 0), { ok: false, message: "HTTP 302" })
  assert.deepEqual(M.parseActionResponse("\n000", 0), { ok: false, message: "HTTP 0" })
})

test("parseActionResponse: network failures reuse the query texts, timeout has its own", () => {
  assert.deepEqual(action("refused"), { ok: false, message: "connection refused" })
  assert.deepEqual(action("dns"), { ok: false, message: "host not found" })
  assert.deepEqual(action("timeout"), { ok: false, message: M.TEXT.commandTimeout })
  assert.deepEqual(M.parseActionResponse("", -1), { ok: false, message: "curl not found" })
  assert.deepEqual(M.parseActionResponse("", 127), { ok: false, message: "curl not found" })
})

test("parseActionResponse never throws", () => {
  for (const v of [null, undefined, {}, "lixo"]) {
    const r = M.parseActionResponse(v, v)
    assert.equal(typeof r.ok, "boolean")
    assert.equal(typeof r.message, "string")
  }
})

// ---- Command state

const NOW = 1000

function plan(commands, st, act, printer) {
  const p = printer || printers()[0]
  return M.planCommand(commands, p, st, act, 3000, NOW)
}

test("emptyCommands", () => {
  assert.deepEqual(M.emptyCommands(), { busy: null, estop: null, web: null, failure: null, seq: 0 })
})

test("planCommand accepts an available action and fills the busy slot", () => {
  const p = printers()[0]
  const input = {}
  const r = plan(input, status("printing"), "pause")
  assert.deepEqual(input, {})
  assert.deepEqual(r.commands[p.key], { busy: { action: "pause", seq: 1, startedAt: NOW }, estop: null, web: null, failure: null, seq: 1 })
  assert.deepEqual(r.request, {
    key: p.key, seq: 1, action: "pause",
    args: M.buildActionArgs(p.baseUrl, "pause", 3), guardMs: 61000 })
})

test("planCommand blocks a second command while one is running (double click)", () => {
  const first = plan({}, status("printing"), "pause")
  const again = plan(first.commands, status("printing"), "pause")
  assert.equal(again.request, null)
  assert.equal(again.commands, first.commands)
  assert.equal(plan(first.commands, status("printing"), "cancel").request, null)
})

test("planCommand refuses actions the state does not offer and invalid printers", () => {
  const c = {}
  for (const [state, act] of [["idle", "cancel"], ["idle", "pause"], ["printing", "resume"], ["paused", "pause"], ["error", "emergencyStop"], ["offline", "emergencyStop"]]) {
    const r = plan(c, status(state), act)
    assert.equal(r.request, null, state + "/" + act)
    assert.equal(r.commands, c)
  }
  const bad = printers()[1]
  assert.equal(plan(c, status("printing"), "pause", bad).request, null)
  assert.equal(plan(c, status("printing"), "explode").request, null)
})

test("emergency stop stays available while pause/resume/cancel is running, and blocks everything else", () => {
  const key = printers()[0].key
  const busy = plan({}, status("printing"), "pause")
  const stop = plan(busy.commands, status("printing"), "emergencyStop")
  assert.notEqual(stop.request, null)
  assert.equal(stop.request.seq, 2)
  assert.deepEqual(stop.commands[key].estop, { action: "emergencyStop", seq: 2, startedAt: NOW })
  assert.equal(stop.commands[key].busy.action, "pause")
  assert.equal(plan(stop.commands, status("printing"), "emergencyStop").request, null)
  const onlyStop = plan({}, status("printing"), "emergencyStop")
  assert.equal(plan(onlyStop.commands, status("printing"), "pause").request, null)
})

test("acceptCommandResult frees the matching slot and records failures", () => {
  const key = printers()[0].key
  const a = plan({}, status("printing"), "pause")
  const b = plan(a.commands, status("printing"), "emergencyStop")
  const okStop = M.acceptCommandResult(b.commands, key, 2, { ok: true, message: "" })
  assert.equal(okStop[key].estop, null)
  assert.equal(okStop[key].busy.action, "pause")
  const failed = M.acceptCommandResult(okStop, key, 1, { ok: false, message: "connection refused" })
  assert.equal(failed[key].busy, null)
  assert.deepEqual(failed[key].failure, { action: "pause", message: "Pause failed: connection refused" })
  // Same seq twice (guard + onExited), unknown seq, unknown printer: unchanged.
  assert.equal(M.acceptCommandResult(failed, key, 1, { ok: true, message: "" }), failed)
  assert.equal(M.acceptCommandResult(failed, key, 9, { ok: true, message: "" }), failed)
  assert.equal(M.acceptCommandResult(failed, "gone#9", 1, { ok: true, message: "" }), failed)
})

test("planCommand ignores the web slot (FR-014)", () => {
  const p = printers()[0]
  const opening = M.planOpenWeb({}, p, NOW).commands
  for (const act of ["pause", "cancel", "emergencyStop"]) assert.notEqual(plan(opening, status("printing"), act).request, null, act)
})

test("acceptCommandResult frees the web slot and labels its failure", () => {
  const key = printers()[0].key
  const opening = M.planOpenWeb({}, printers()[0], NOW).commands
  const ok = M.acceptCommandResult(opening, key, 1, { ok: true, message: "" })
  assert.equal(ok[key].web, null)
  assert.equal(ok[key].failure, null)
  const failed = M.acceptCommandResult(opening, key, 1, { ok: false, message: "x" })
  assert.equal(failed[key].web, null)
  assert.deepEqual(failed[key].failure, { action: "openWebUi", message: "Open web UI failed: x" })
  assert.equal(M.acceptCommandResult(opening, key, 7, { ok: true, message: "" }), opening, "wrong seq")
})

test("a new command clears the previous failure", () => {
  const key = printers()[0].key
  const a = plan({}, status("printing"), "pause")
  const failed = M.acceptCommandResult(a.commands, key, 1, { ok: false, message: "x" })
  const next = plan(failed, status("printing"), "pause")
  assert.equal(next.commands[key].failure, null)
})

test("reconcileCommands drops printers that left the config", () => {
  const ps = printers()
  const a = plan({}, status("printing"), "pause")
  assert.equal(M.reconcileCommands(a.commands, ps), a.commands)
  assert.deepEqual(M.reconcileCommands(a.commands, [ps[1]]), {})
})

test("command state functions never throw", () => {
  for (const v of [null, undefined, {}, "lixo"]) {
    assert.doesNotThrow(() => M.planCommand(v, v, v, v, v, v))
    assert.equal(M.planCommand(v, v, v, "pause", 3000, 0).request, null)
    assert.doesNotThrow(() => M.acceptCommandResult(v, v, v, v))
    assert.doesNotThrow(() => M.reconcileCommands(v, v))
  }
})

// ---- Panel actions model

function model(state, commands) {
  const p = printers()[0]
  return M.buildActionsModel(p, status(state, { filename: "hook.gcode" }), commands ? commands[p.key] : undefined)
}

test("buildActionsModel: buttons per state", () => {
  const printing = model("printing")
  assert.deepEqual(printing.primary.map(b => [b.id, b.enabled]), [["pause", true], ["cancel", true]])
  assert.equal(printing.emergency.id, "emergencyStop")
  assert.equal(printing.emergency.enabled, true)
  assert.deepEqual(printing.buttons.map(b => b.id), ["pause", "cancel", "emergencyStop", "openWebUi"])
  assert.equal(printing.filename, "hook.gcode")
  assert.deepEqual(model("paused").primary.map(b => b.id), ["resume", "cancel"])
  const idle = model("idle")
  assert.deepEqual(idle.primary, [])
  assert.equal(idle.emergency.id, "emergencyStop")
  for (const s of ["error", "offline"]) {
    const m = model(s)
    assert.deepEqual(m.buttons.map(b => b.id), ["openWebUi"], "only the web UI (slice 003)")
    assert.deepEqual(m.primary, [])
    assert.equal(m.emergency, null)
  }
})

test("buildActionsModel: each button's fields", () => {
  const [pause, cancel, stop] = model("printing").buttons
  assert.deepEqual(pause, { id: "pause", label: "Pause", glyph: M.ACTION_GLYPHS.pause, confirm: false, urgent: false, busy: false, enabled: true })
  assert.equal(cancel.confirm, true)
  assert.equal(cancel.urgent, false)
  assert.deepEqual(stop, { id: "emergencyStop", label: "Emergency stop", glyph: M.ACTION_GLYPHS.emergencyStop, confirm: true, urgent: true, busy: false, enabled: true })
})

test("buildActionsModel: running commands", () => {
  const busy = plan({}, status("printing"), "pause").commands
  const m = model("printing", busy)
  assert.deepEqual(m.primary.map(b => [b.id, b.busy, b.enabled]), [["pause", true, false], ["cancel", false, false]])
  assert.deepEqual([m.emergency.busy, m.emergency.enabled], [false, true], "e-stop stays available")
  const stopping = plan({}, status("printing"), "emergencyStop").commands
  const s = model("printing", stopping)
  assert.deepEqual(s.primary.map(b => b.enabled), [false, false])
  assert.deepEqual([s.emergency.busy, s.emergency.enabled], [true, false])
})

test("buildActionsModel: enabled matches planCommand everywhere", () => {
  const p = printers()[0]
  const variants = [undefined, plan({}, status("printing"), "pause").commands, plan({}, status("printing"), "emergencyStop").commands]
  for (const state of ["printing", "paused", "idle", "error", "offline"]) {
    for (const c of variants) {
      const st = status(state)
      for (const b of M.buildActionsModel(p, st, c ? c[p.key] : undefined).buttons) {
        const accepted = b.id === "openWebUi"
          ? M.planOpenWeb(c || {}, p, 0).request !== null
          : M.planCommand(c || {}, p, st, b.id, 3000, 0).request !== null
        assert.equal(b.enabled, accepted, state + "/" + b.id)
      }
    }
  }
})

test("buildActionsModel never throws", () => {
  for (const v of [null, undefined, {}, "lixo"]) {
    const m = M.buildActionsModel(v, v, v)
    assert.deepEqual(m.buttons, [])
    assert.ok("web" in m)
    assert.equal(m.web, null)
    assert.equal(m.failureText, "")
  }
})

// ---- Confirmation texts

test("confirmMessage and confirmLabel for cancel", () => {
  // File names get a zero-width space after "_", "-" and "." so the dialog can wrap them.
  const ZW = "\u200B"
  assert.equal(M.confirmMessage("cancel", "Voron", "hook.gcode"), 'Cancel the print "hook.' + ZW + 'gcode" on Voron?')
  assert.equal(M.confirmMessage("cancel", "Voron", ""), "Cancel the current print on Voron?")
  assert.equal(M.confirmMessage("cancel", "Voron", "a%2.gcode"), 'Cancel the print "a%2.' + ZW + 'gcode" on Voron?')
  for (const a of ["pause", "resume", "explode", null]) assert.equal(M.confirmMessage(a, "Voron", "x"), "")
  assert.equal(M.confirmLabel("cancel"), "Cancel print")
  for (const a of ["pause", "resume", "explode", null]) assert.equal(M.confirmLabel(a), "")
})

test("confirmation texts never throw", () => {
  for (const v of [null, undefined, {}, "lixo"]) {
    assert.equal(typeof M.confirmMessage(v, v, v), "string")
    assert.equal(typeof M.confirmLabel(v), "string")
  }
})

test("confirmMessage and confirmLabel for the emergency stop", () => {
  assert.equal(M.confirmMessage("emergencyStop", "Voron", ""), "Emergency stop Voron? Klipper will shut down until a firmware restart.")
  assert.equal(M.confirmMessage("emergencyStop", "Voron", "hook.gcode"), "Emergency stop Voron? Klipper will shut down until a firmware restart.")
  assert.equal(M.confirmLabel("emergencyStop"), "Stop")
})

// ---- US4: failures

test("clearFailures drops every failure and keeps running commands", () => {
  const ps = printers()
  const key = ps[0].key
  const a = plan({}, status("printing"), "pause")
  const failed = M.acceptCommandResult(a.commands, key, 1, { ok: false, message: "x" })
  const running = plan(failed, status("printing"), "emergencyStop").commands
  const withFailure = Object.assign({}, running, { [key]: Object.assign({}, running[key], { failure: { action: "pause", message: "m" } }) })
  const cleared = M.clearFailures(withFailure)
  assert.equal(cleared[key].failure, null)
  assert.equal(cleared[key].estop.action, "emergencyStop")
  assert.equal(M.clearFailures(cleared), cleared, "nothing to clear")
  for (const v of [null, undefined, {}, "lixo"]) assert.doesNotThrow(() => M.clearFailures(v))
})

test("buildActionsModel shows a failure even when no button is left (printer went offline)", () => {
  const key = printers()[0].key
  const a = plan({}, status("printing"), "pause")
  const failed = M.acceptCommandResult(a.commands, key, 1, { ok: false, message: "connection refused" })
  const m = model("offline", failed)
  assert.deepEqual(m.buttons.map(b => b.id), ["openWebUi"])
  assert.equal(m.failureText, "Pause failed: connection refused")
})

test("confirmMessage lets a long file name without spaces wrap (seen on the Voron)", () => {
  const name = "CleanWalk_Duo_2025_12_31_assembly_brimmed_ABS_22m23s.gcode"
  const msg = M.confirmMessage("cancel", "Voron", name)
  assert.equal(msg.replace(/\u200B/g, ""), 'Cancel the print "' + name + '" on Voron?', "text unchanged apart from the break points")
  assert.equal((msg.match(/\u200B/g) || []).length, 9)
  assert.ok(msg.includes("CleanWalk_\u200BDuo_\u200B"))
})

test("real Voron capture of a pause POST (Moonraker v0.11) is a success", () => {
  assert.deepEqual(action("action-ok"), { ok: true, message: "" })
})

// ---- Slice 003: Open web UI button

test("buildActionsModel: Open web UI in every state", () => {
  const expected = { id: "openWebUi", label: "Open web UI", glyph: M.ACTION_GLYPHS.openWebUi, confirm: false, urgent: false, busy: false, enabled: true }
  for (const s of ["printing", "paused", "idle", "error", "offline"]) {
    const m = model(s)
    assert.deepEqual(m.web, expected, s)
    assert.deepEqual(m.buttons[m.buttons.length - 1], expected, s + ": last button")
    assert.ok(m.primary.every(b => b.id !== "openWebUi"))
  }
})

test("buildActionsModel: no Open web UI without a web address", () => {
  const bad = printers()[1]
  const m = M.buildActionsModel(bad, Object.assign(M.initialStatus(bad.key), { state: "offline" }), undefined)
  assert.equal(m.web, null)
  assert.deepEqual(m.buttons, [])
})

test("buildActionsModel: Open web UI while opening and while a command runs", () => {
  const p = printers()[0]
  const opening = M.planOpenWeb({}, p, NOW).commands
  const m = model("printing", opening)
  assert.deepEqual([m.web.busy, m.web.enabled], [true, false])
  assert.deepEqual(m.primary.map(b => b.enabled), [true, true], "commands stay available (FR-014)")
  for (const act of ["pause", "emergencyStop"]) {
    const running = plan({}, status("printing"), act).commands
    assert.deepEqual([model("printing", running).web.busy, model("printing", running).web.enabled], [false, true], act)
  }
})
