const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// ---- Slice 008: restart the Klipper service from the panel

const printers = () => M.normalizePrinters([{ name: "Voron", address: "192.168.1.50" }])
const printer = () => printers()[0]

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// A status as the widget holds it after reading the given fixture at now.
function from(fixture, prev, now) {
  return M.applyReading(prev || M.initialStatus(printer().key), reading(fixture), now === undefined ? 1000 : now)
}

function action(name) {
  const f = loadFixture(name)
  return M.parseActionResponse(f.stdout, f.exitCode)
}

// ---- Disconnection clock (FR-001, FR-003)

test("klippyDownSince starts at the first 503 and holds while it lasts", () => {
  const s0 = M.initialStatus(printer().key)
  assert.equal(s0.klippyDownSince, null)
  assert.equal(s0.klipperService, null)
  const first = from("klippy-disconnected", undefined, 1000)
  assert.equal(first.klippyDownSince, 1000)
  assert.equal(from("klippy-restarting", first, 6000).klippyDownSince, 1000, "both 503 texts count")
})

test("any other answer, or no answer, resets the clock", () => {
  const down = from("klippy-disconnected", undefined, 1000)
  for (const f of ["startup", "standby.synthetic", "shutdown", "timeout"])
    assert.equal(from(f, down, 6000).klippyDownSince, null, f)
  const again = from("klippy-disconnected", from("startup", down, 6000), 9000)
  assert.equal(again.klippyDownSince, 9000)
})

test("a known service name survives; a failed lookup is forgotten when the episode ends", () => {
  const known = Object.assign(from("klippy-disconnected"), { klipperService: { name: "klipper", pending: false, seq: 1 } })
  assert.deepEqual(from("startup", known, 6000).klipperService, known.klipperService)
  assert.deepEqual(from("timeout", known, 6000).klipperService, known.klipperService)
  const failed = Object.assign(from("klippy-disconnected"), { klipperService: { name: null, pending: false, seq: 1 } })
  assert.deepEqual(from("klippy-disconnected", failed, 6000).klipperService, failed.klipperService, "kept while still down")
  assert.equal(from("startup", failed, 6000).klipperService, null)
})

test("clearKlippyDown resets one printer's clock", () => {
  const key = printer().key
  const statuses = {}
  statuses[key] = from("klippy-disconnected")
  const cleared = M.clearKlippyDown(statuses, key)
  assert.equal(cleared[key].klippyDownSince, null)
  assert.equal(statuses[key].klippyDownSince, 1000, "not mutated")
  assert.equal(M.clearKlippyDown(cleared, key), cleared, "already clear")
  assert.equal(M.clearKlippyDown(statuses, "nope"), statuses)
  for (const bad of [null, undefined, "lixo"]) assert.equal(M.clearKlippyDown(bad, key), bad)
})

// ---- Availability and sending (US1, FR-001, FR-002, FR-005)

const down = (since) => from("klippy-disconnected", undefined, since === undefined ? 1000 : since)

test("canRestartKlipper: only after 15 s of uninterrupted 503", () => {
  const s = down(1000)
  assert.equal(M.canRestartKlipper(s, 15999), false)
  assert.equal(M.canRestartKlipper(s, 16000), true)
  for (const f of ["shutdown", "startup", "standby.synthetic", "timeout"])
    assert.equal(M.canRestartKlipper(from(f), 99999), false, f)
  for (const now of [undefined, NaN, "x"]) assert.equal(M.canRestartKlipper(s, now), false)
  for (const bad of [null, undefined, {}, "lixo"]) assert.equal(M.canRestartKlipper(bad, 99999), false)
})

test("actionsFor offers klipperRestart only with now and 15 s down", () => {
  const s = down(1000)
  assert.deepEqual(M.actionsFor(s, 16000), ["klipperRestart"])
  assert.deepEqual(M.actionsFor(s, 11000), [])
  assert.deepEqual(M.actionsFor(s), [], "no clock, no offer")
  assert.deepEqual(M.actionsFor(from("shutdown"), 99999), ["firmwareRestart"])
})

test("buildActionArgs puts the service name in the query, only for klipperRestart", () => {
  const base = "http://v"
  const url = (svc) => M.buildActionArgs(base, "klipperRestart", 3, svc).slice(-1)[0]
  assert.equal(url("klipper-1"), "http://v/machine/services/restart?service=klipper-1")
  assert.equal(url(""), "http://v/machine/services/restart?service=klipper")
  assert.equal(url(undefined), "http://v/machine/services/restart?service=klipper")
  assert.equal(url("my klipper"), "http://v/machine/services/restart?service=my%20klipper")
  assert.deepEqual(M.buildActionArgs(base, "pause", 3, "x"), M.buildActionArgs(base, "pause", 3))
})

test("planCommand sends klipperRestart with the printer's own service name", () => {
  const p = printer()
  const s = Object.assign(down(1000), { klipperService: { name: "klipper-1", pending: false, seq: 1 } })
  const plan = M.planCommand({}, p, s, "klipperRestart", 3000, 16000)
  assert.ok(plan.request)
  assert.equal(plan.request.args.slice(-1)[0], p.baseUrl + "/machine/services/restart?service=klipper-1")
  assert.deepEqual(plan.commands[p.key].busy, { action: "klipperRestart", seq: 1, startedAt: 16000 })
  assert.equal(plan.request.guardMs, 61000)
  assert.equal(M.planCommand({}, p, down(1000), "klipperRestart", 3000, 16000).request.args.slice(-1)[0],
    p.baseUrl + "/machine/services/restart?service=klipper", "no lookup yet")

  assert.equal(M.planCommand({}, p, s, "klipperRestart", 3000, 11000).request, null, "only 10 s down")
  const again = M.planCommand(plan.commands, p, s, "klipperRestart", 3000, 16001)
  assert.equal(again.request, null, "double click")
  assert.equal(again.commands, plan.commands)
  const stopping = {}
  stopping[p.key] = Object.assign(M.emptyCommands(), { estop: { action: "emergencyStop", seq: 1, startedAt: 0 }, seq: 1 })
  assert.equal(M.planCommand(stopping, p, s, "klipperRestart", 3000, 16000).request, null, "estop pending")
})

// ---- The service name (FR-005)

function serviceName(fixture) {
  const f = loadFixture(fixture)
  return M.parseServiceInfo(f.stdout, f.exitCode)
}

test("parseServiceInfo reads instance_ids.klipper", () => {
  assert.equal(serviceName("system-info.synthetic"), "klipper")
  assert.equal(serviceName("system-info-instance.synthetic"), "klipper-1")
  for (const f of ["system-info-no-klipper.synthetic", "refused", "timeout", "garbage.synthetic", "klippy-disconnected"])
    assert.equal(serviceName(f), null, f)
  assert.equal(M.parseServiceInfo(undefined, undefined), null)
})

test("buildServiceInfoArgs is a status-style GET of /machine/system_info", () => {
  assert.deepEqual(M.buildServiceInfoArgs("http://v", 3), M.buildCurlArgs("http://v/machine/system_info", 3))
  assert.deepEqual(M.buildServiceInfoArgs("", 3), [])
})

test("planServiceInfo asks once per disconnected printer without a name", () => {
  const p = printer()
  const statuses = {}
  statuses[p.key] = down(1000)
  const plan = M.planServiceInfo(statuses, printers(), 3000)
  assert.equal(plan.requests.length, 1)
  assert.deepEqual(plan.requests[0], { key: p.key, seq: 1, args: M.buildServiceInfoArgs(p.baseUrl, 3) })
  assert.deepEqual(plan.statuses[p.key].klipperService, { name: null, pending: true, seq: 1 })
  const second = M.planServiceInfo(plan.statuses, printers(), 3000)
  assert.equal(second.requests.length, 0)
  assert.equal(second.statuses, plan.statuses)

  const up = {}
  up[p.key] = from("standby.synthetic")
  assert.equal(M.planServiceInfo(up, printers(), 3000).requests.length, 0, "not disconnected")
  const named = {}
  named[p.key] = Object.assign(down(1000), { klipperService: { name: "klipper", pending: false, seq: 1 } })
  assert.equal(M.planServiceInfo(named, printers(), 3000).requests.length, 0, "name known")
  const bad = M.normalizePrinters([{ name: "Bad", address: "a b" }])
  const badStatuses = {}
  badStatuses[bad[0].key] = down(1000)
  assert.equal(M.planServiceInfo(badStatuses, bad, 3000).requests.length, 0, "invalid printer")
  for (const junk of [null, undefined, "lixo"]) assert.equal(M.planServiceInfo(junk, printers(), 3000).requests.length, 0)
})

test("acceptServiceInfo stores the answer of the pending lookup only", () => {
  const p = printer()
  const statuses = {}
  statuses[p.key] = down(1000)
  const pending = M.planServiceInfo(statuses, printers(), 3000).statuses
  const done = M.acceptServiceInfo(pending, p.key, 1, "klipper-1")
  assert.deepEqual(done[p.key].klipperService, { name: "klipper-1", pending: false, seq: 1 })
  assert.deepEqual(M.acceptServiceInfo(pending, p.key, 1, "")[p.key].klipperService, { name: null, pending: false, seq: 1 })
  assert.equal(M.acceptServiceInfo(pending, p.key, 2, "x"), pending, "other seq")
  assert.equal(M.acceptServiceInfo(done, p.key, 1, "x"), done, "not pending")
  assert.equal(M.acceptServiceInfo(pending, "nope", 1, "x"), pending)
})

// ---- Panel and notifications (FR-004, FR-010, FR-011)

test("buildActionsModel: one plain Restart Klipper button after 15 s down", () => {
  const p = printer()
  const s = down(1000)
  const m = M.buildActionsModel(p, s, M.emptyCommands(), 16000)
  assert.deepEqual(m.primary, [{
    id: "klipperRestart", label: "Restart Klipper", glyph: "\u{f0450}", confirm: true, urgent: false, busy: false, enabled: true
  }])
  assert.equal(m.emergency, null)
  assert.deepEqual(M.buildActionsModel(p, s, M.emptyCommands()).primary, [], "no now, no offer")
  const running = M.planCommand({}, p, s, "klipperRestart", 3000, 16000).commands[p.key]
  const busy = M.buildActionsModel(p, s, running, 16000).primary[0]
  assert.equal(busy.busy, true)
  assert.equal(busy.enabled, false)

  const statuses = {}
  statuses[p.key] = s
  const panel = M.buildPanelModel(printers(), statuses, p.key, 16000, {})
  assert.deepEqual(panel.actions.primary.map(b => b.id), ["klipperRestart"])
})

test("confirmation texts for klipperRestart", () => {
  assert.equal(M.confirmMessage("klipperRestart", "Voron"), "Restart the Klipper service on Voron? It will start again on the printer's computer.")
  assert.equal(M.confirmLabel("klipperRestart"), "Restart")
})

test("the service restart sequence raises no notification, protected or not", () => {
  for (const prot of [true, false]) {
    let w = M.emptyWatch()
    let prev = null
    const events = []
    let t = 1000
    for (const f of ["klippy-disconnected", "klippy-disconnected", "startup", "standby.synthetic"]) {
      prev = from(f, prev, t += 5000)
      const r = M.observe(w, prev, prot)
      w = r.watch
      events.push(...r.events)
    }
    assert.deepEqual(events, [], "protected " + prot)
  }
})

// ---- One send per command across bars (FR-013)

test("claimSend lets the same command out once every 5 s per printer", () => {
  const first = M.claimSend({}, "k", "klipperRestart", 1000)
  assert.equal(first.ok, true)
  assert.deepEqual(first.sends.k, { action: "klipperRestart", at: 1000 })
  const dup = M.claimSend(first.sends, "k", "klipperRestart", 5999)
  assert.equal(dup.ok, false)
  assert.equal(dup.sends, first.sends, "refused keeps the same object")
  assert.equal(M.claimSend(first.sends, "k", "klipperRestart", 6000).ok, true)
  assert.equal(M.claimSend(first.sends, "k", "pause", 1001).ok, true, "another action")
  assert.equal(M.claimSend(first.sends, "other", "klipperRestart", 1001).ok, true, "another printer")
  for (const bad of [null, undefined, "lixo"]) assert.equal(M.claimSend(bad, "k", "pause", 1).ok, true)
  assert.equal(M.claimSend({}, "k", "pause", NaN).ok, true)
})

test("releaseSend forgets a failed command so it can be retried at once", () => {
  const sends = M.claimSend({}, "k", "klipperRestart", 1000).sends
  const released = M.releaseSend(sends, "k", "klipperRestart")
  assert.equal(released.k, undefined)
  assert.equal(M.claimSend(released, "k", "klipperRestart", 1001).ok, true)
  assert.equal(M.releaseSend(sends, "k", "pause"), sends, "other action untouched")
  assert.equal(M.releaseSend(sends, "nope", "klipperRestart"), sends)
  for (const bad of [null, undefined, "lixo"]) assert.equal(M.releaseSend(bad, "k", "pause"), bad)
})

// ---- Failures (US2, FR-009)

function restartFailedWith(fixture) {
  const p = printer()
  const plan = M.planCommand({}, p, down(1000), "klipperRestart", 3000, 16000)
  return M.acceptCommandResult(plan.commands, p.key, plan.request.seq, action(fixture))
}

test("a failed service restart shows its reason under the Restart Klipper label", () => {
  const key = printer().key
  const cases = [
    ["action-service-not-allowed.synthetic", "Restart Klipper failed: Service 'klipper' not allowed"],
    ["timeout", "Restart Klipper failed: no response (timeout) — check the printer before trying again"],
    ["refused", "Restart Klipper failed: connection refused"],
  ]
  for (const [fixture, text] of cases) {
    const c = restartFailedWith(fixture)
    assert.equal(c[key].busy, null, fixture)
    assert.deepEqual(c[key].failure, { action: "klipperRestart", message: text }, fixture)
  }
  const p = printer()
  const m = M.buildActionsModel(p, down(1000), restartFailedWith("action-service-not-allowed.synthetic")[key], 16000)
  assert.equal(m.failureText, "Restart Klipper failed: Service 'klipper' not allowed")
  assert.equal(m.primary[0].enabled, true)
})

test("still disconnected after a restart: the button is back 15 s after the next 503 (US2.2)", () => {
  const key = printer().key
  const statuses = {}
  statuses[key] = down(1000)
  const cleared = M.clearKlippyDown(statuses, key)
  const again = from("klippy-disconnected", cleared[key], 21000)
  assert.equal(M.canRestartKlipper(again, 30000), false)
  assert.equal(M.canRestartKlipper(again, 36000), true)
})

test("the real Voron system_info names its Klipper service klipper", () => {
  assert.equal(serviceName("system-info-voron"), "klipper")
})
