const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("./helpers").loadModel()

// ---- Slice 003: opening the printer's web UI

function printer(overrides) {
  return M.normalizePrinters([Object.assign({ name: "Voron", address: "voron.local" }, overrides || {})])[0]
}

function status(p, state) {
  return Object.assign(M.initialStatus(p.key), { state })
}

test("deriveWebUrl drops only Moonraker's default port", () => {
  assert.equal(M.deriveWebUrl("http://voron.local"), "http://voron.local")
  assert.equal(M.deriveWebUrl("http://192.168.1.51:7125"), "http://192.168.1.51")
  assert.equal(M.deriveWebUrl("https://p.lan:7125/x"), "https://p.lan/x")
  assert.equal(M.deriveWebUrl("http://p.lan:8080"), "http://p.lan:8080")
  assert.equal(M.deriveWebUrl("http://h/mainsail"), "http://h/mainsail")
  assert.equal(M.deriveWebUrl("http://h:17125"), "http://h:17125", "only the exact port 7125")
  assert.equal(M.deriveWebUrl("http://h:71250"), "http://h:71250")
  for (const v of ["", null, undefined, 5, {}]) assert.equal(M.deriveWebUrl(v), "")
})

test("buildWebLaunchArgs runs the Omarchy launcher without a shell", () => {
  assert.deepEqual(M.buildWebLaunchArgs("http://x"), ["omarchy-launch-browser", "http://x"])
  for (const v of ["", null, undefined, 5]) assert.deepEqual(M.buildWebLaunchArgs(v), [])
})

test("parseWebLaunchResult", () => {
  assert.deepEqual(M.parseWebLaunchResult(0, true), { ok: true, message: "" })
  assert.deepEqual(M.parseWebLaunchResult(-1, false), { ok: false, message: "omarchy-launch-browser not found" })
  assert.deepEqual(M.parseWebLaunchResult(1, true), { ok: false, message: "browser launcher exited with code 1" })
  assert.deepEqual(M.parseWebLaunchResult(-2, true), { ok: false, message: "no answer from the browser launcher" })
  assert.equal(M.WEB_LAUNCH_TIMEOUT_SEC, 10)
  for (const v of [null, undefined, "x", {}]) assert.doesNotThrow(() => M.parseWebLaunchResult(v, v))
})

test("planOpenWeb takes the web slot", () => {
  const p = printer()
  const r = M.planOpenWeb({}, p, 42)
  assert.deepEqual(r.request, { key: p.key, seq: 1, args: ["omarchy-launch-browser", "http://voron.local"], guardMs: 10000 })
  assert.deepEqual(r.commands[p.key].web, { action: "openWebUi", seq: 1, startedAt: 42 })
  assert.equal(r.commands[p.key].failure, null)
  assert.equal(r.commands[p.key].busy, null)
})

test("planOpenWeb refuses without a web address, a printer, or with an opening running", () => {
  const p = printer()
  const commands = {}
  for (const bad of [null, undefined, "x", printer({ address: "a b" })]) {
    const r = M.planOpenWeb(commands, bad, 0)
    assert.equal(r.commands, commands)
    assert.equal(r.request, null)
  }
  const running = M.planOpenWeb({}, p, 0).commands
  const again = M.planOpenWeb(running, p, 1)
  assert.equal(again.commands, running)
  assert.equal(again.request, null)
})

test("planOpenWeb ignores printer commands and shares their seq (FR-014)", () => {
  const p = printer()
  const paused = M.planCommand({}, p, status(p, "printing"), "pause", 3000, 0)
  const r = M.planOpenWeb(paused.commands, p, 1)
  assert.notEqual(r.request, null)
  assert.equal(r.request.seq, 2)
  const stopping = M.planCommand({}, p, status(p, "printing"), "emergencyStop", 3000, 0).commands
  assert.notEqual(M.planOpenWeb(stopping, p, 1).request, null)
})

test("a failed opening shows in the panel and clears like a command failure", () => {
  const p = printer()
  const r = M.planOpenWeb({}, p, 0)
  const failed = M.acceptCommandResult(r.commands, p.key, 1, M.parseWebLaunchResult(-1, false))
  for (const state of ["printing", "offline", "error"]) {
    const m = M.buildActionsModel(p, status(p, state), failed[p.key])
    assert.equal(m.failureText, "Open web UI failed: omarchy-launch-browser not found", state)
  }
  assert.equal(M.clearFailures(failed)[p.key].failure, null)
  assert.equal(M.planOpenWeb(failed, p, 1).commands[p.key].failure, null, "the next opening clears it")
  assert.equal(M.planCommand(failed, p, status(p, "printing"), "pause", 3000, 1).commands[p.key].failure, null, "so does a command")
  const pause = M.planCommand({}, p, status(p, "printing"), "pause", 3000, 0)
  const pauseFailed = M.acceptCommandResult(pause.commands, p.key, 1, { ok: false, message: "x" })
  assert.equal(M.planOpenWeb(pauseFailed, p, 1).commands[p.key].failure, null, "and an opening clears a command failure")
})
