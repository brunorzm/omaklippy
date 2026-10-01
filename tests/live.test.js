const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// The raw text of a websocket fixture, as the connection receives it.
function msg(name) {
  return loadFixture(name).message
}

function printers() {
  return M.normalizePrinters([{ name: "Voron", address: "voron.local" }, { name: "Biqu", address: "biqu.local:7125" }])
}

const T0 = 1000000
const GARBAGE = [undefined, null, 5, "", "{", "[]", {}, [], [null], { result: 5 }, "{\"method\":5}"]

// ---- Mensagens

test("readingFromStatus reads result.status exactly as parseResponse does", () => {
  for (const name of ["standby", "printing", "paused", "shutdown", "startup", "klippy-error.synthetic", "printing-layers.synthetic"]) {
    const f = loadFixture(name)
    const body = f.stdout.slice(0, f.stdout.lastIndexOf("\n"))
    const fromStatus = M.readingFromStatus(JSON.parse(body).result.status)
    assert.deepEqual(fromStatus, M.parseResponse(f.stdout, f.exitCode), name)
    assert.equal(fromStatus.httpStatus, 200)
    assert.equal(fromStatus.reachable, true)
  }
  assert.equal(M.readingFromStatus(null).errorMessage, M.TEXT.unexpectedResponse)
})

test("liveUrl", () => {
  assert.equal(M.liveUrl("http://voron.local"), "ws://voron.local/websocket")
  assert.equal(M.liveUrl("http://biqu.local:7125"), "ws://biqu.local:7125/websocket")
  assert.equal(M.liveUrl("https://x/moon"), "wss://x/moon/websocket")
  assert.equal(M.liveUrl(""), "")
  assert.equal(M.liveUrl("ftp://x"), "")
  for (const g of GARBAGE) assert.equal(M.liveUrl(g), "")
})

test("buildSubscribeMessage asks for the same objects as the status query", () => {
  const m = JSON.parse(M.buildSubscribeMessage(3))
  assert.equal(m.jsonrpc, "2.0")
  assert.equal(m.method, "printer.objects.subscribe")
  assert.equal(m.id, 3)
  assert.deepEqual(m.params.objects, { webhooks: null, print_stats: null, virtual_sdcard: null, display_status: null,
    extruder: ["temperature", "target"], heater_bed: ["temperature", "target"] })
})

test("parseLiveMessage", () => {
  const sub = M.parseLiveMessage(msg("ws-subscribe-voron"))
  assert.equal(sub.kind, "result")
  assert.equal(sub.id, 2)
  assert.equal(sub.status.webhooks.state, "ready")
  const upd = M.parseLiveMessage(msg("ws-update-voron"))
  assert.equal(upd.kind, "update")
  assert.deepEqual(Object.keys(upd.diff).sort(), ["extruder", "heater_bed"])
  assert.equal(M.parseLiveMessage(msg("ws-update-printing.synthetic")).diff.print_stats.state, "paused")
  const err = M.parseLiveMessage(msg("ws-subscribe-error.synthetic"))
  assert.equal(err.kind, "error")
  assert.equal(err.id, 2)
  assert.equal(err.message, "Klippy Host not connected")
  assert.equal(M.parseLiveMessage(msg("ws-klippy-disconnected.synthetic")).kind, "klippyDisconnected")
  assert.equal(M.parseLiveMessage(msg("ws-klippy-ready.synthetic")).kind, "klippyReady")
  assert.equal(M.parseLiveMessage(msg("ws-proc-stat.synthetic")).kind, "ignore")
  // proc_stat is dropped before parsing: even a broken one.
  assert.equal(M.parseLiveMessage('{"jsonrpc":"2.0","method":"notify_proc_stat_update",garbage').kind, "ignore")
  assert.equal(M.parseLiveMessage('{"jsonrpc":"2.0","method":"notify_gcode_response","params":["ok"]}').kind, "ignore")
  for (const g of GARBAGE) assert.equal(M.parseLiveMessage(g).kind, "ignore")
})

test("mergeStatus lays the diff over the previous status, object by object", () => {
  const prev = M.parseLiveMessage(msg("ws-subscribe-voron")).status
  const before = JSON.stringify(prev)
  const diff = M.parseLiveMessage(msg("ws-update-printing.synthetic")).diff
  const next = M.mergeStatus(prev, diff)
  assert.equal(JSON.stringify(prev), before)
  assert.equal(next.print_stats.state, "paused")
  assert.equal(next.print_stats.print_duration, 812.4)
  assert.equal(next.print_stats.filename, prev.print_stats.filename)
  assert.equal(next.extruder.target, 215)
  assert.equal(next.extruder.temperature, prev.extruder.temperature)
  assert.equal(next.virtual_sdcard.progress, 0.4213)
  assert.deepEqual(M.mergeStatus({}, { extruder: { temperature: 1 } }), { extruder: { temperature: 1 } })
  assert.deepEqual(M.mergeStatus(null, null), {})
})

test("isUrgentDiff: state changes go out at once", () => {
  assert.equal(M.isUrgentDiff({ webhooks: { state: "shutdown" } }), true)
  assert.equal(M.isUrgentDiff({ print_stats: { state: "paused", print_duration: 3 } }), true)
  assert.equal(M.isUrgentDiff({ print_stats: { print_duration: 3 } }), false)
  assert.equal(M.isUrgentDiff({ extruder: { temperature: 32.6 } }), false)
  assert.equal(M.isUrgentDiff({ virtual_sdcard: { progress: 0.5 } }), false)
  for (const g of GARBAGE) assert.equal(M.isUrgentDiff(g), false)
})

test("the message functions tolerate garbage", () => {
  const fns = ["readingFromStatus", "liveUrl", "buildSubscribeMessage", "parseLiveMessage", "mergeStatus", "isUrgentDiff"]
  for (const name of fns) {
    assert.equal(typeof M[name], "function", name)
    for (const a of GARBAGE) for (const b of GARBAGE) assert.doesNotThrow(() => M[name](a, b), name)
  }
})

// ---- Máquina da conexão (US1: caminho feliz)

const VORON = "http://voron.local#0"
const BIQU = "http://biqu.local:7125#1"

function act(actions) {
  return actions.map(a => a.key + ":" + a.type)
}

// Voron connected and subscribed at T0.
function subscribed() {
  let lives = M.reconcileLives({}, printers(), T0)
  let r = M.liveTick(lives, T0)
  r = M.liveOpened(r.lives, VORON, T0)
  const id = r.lives[VORON].subscribeId
  const sub = M.parseLiveMessage(msg("ws-subscribe-voron").replace('"id":2', '"id":' + id))
  return M.liveMessage(r.lives, VORON, sub, T0)
}

test("emptyLive and reconcileLives", () => {
  assert.deepEqual(M.emptyLive("ws://x/websocket"), { state: "idle", url: "ws://x/websocket", attempt: 0, retryAt: null,
    lastFrameAt: null, lastPingAt: null, subscribeId: 0, buffer: null, dirty: false, urgent: false })
  const lives = M.reconcileLives({}, printers(), T0)
  assert.deepEqual(Object.keys(lives).sort(), [VORON, BIQU].sort())
  assert.equal(lives[VORON].url, "ws://voron.local/websocket")
  assert.equal(lives[BIQU].url, "ws://biqu.local:7125/websocket")
  assert.equal(M.reconcileLives(lives, printers(), T0), lives)
  const one = M.reconcileLives(lives, [printers()[0]], T0)
  assert.deepEqual(Object.keys(one), [VORON])
  assert.equal(one[VORON], lives[VORON])
  // Same key, another URL: a new connection.
  const moved = M.normalizePrinters([{ address: "voron.local" }])
  moved[0].baseUrl = "http://voron2.local"
  assert.equal(M.reconcileLives(lives, moved, T0)[VORON].url, "ws://voron2.local/websocket")
  // Invalid addresses never connect.
  assert.deepEqual(M.reconcileLives({}, M.normalizePrinters([{ address: "a b" }]), T0), {})
})

test("tick opens, opened subscribes, the answer makes it live", () => {
  const lives = M.reconcileLives({}, printers(), T0)
  const t = M.liveTick(lives, T0)
  assert.deepEqual(act(t.actions).sort(), [BIQU + ":open", VORON + ":open"].sort())
  assert.equal(t.lives[VORON].state, "connecting")
  // Nothing more to do on the next tick.
  assert.deepEqual(M.liveTick(t.lives, T0 + 1000).actions, [])
  const o = M.liveOpened(t.lives, VORON, T0 + 50)
  assert.equal(o.lives[VORON].state, "open")
  assert.equal(o.actions.length, 1)
  assert.equal(o.actions[0].type, "send")
  const sent = JSON.parse(o.actions[0].text)
  assert.equal(sent.method, "printer.objects.subscribe")
  assert.equal(sent.id, o.lives[VORON].subscribeId)
  // An answer to another request changes nothing.
  const other = M.liveMessage(o.lives, VORON, M.parseLiveMessage(msg("ws-subscribe-voron").replace('"id":2', '"id":99')), T0)
  assert.equal(other.lives[VORON].state, "open")
  assert.equal(other.entered, false)
  const s = subscribed()
  assert.equal(s.entered, true)
  assert.equal(s.lives[VORON].state, "subscribed")
  assert.equal(s.lives[VORON].attempt, 0)
  assert.equal(s.lives[VORON].dirty, true)
  assert.equal(s.lives[VORON].urgent, true)
  assert.equal(s.lives[VORON].buffer.webhooks.state, "ready")
})

test("updates merge into the buffer; flush hands over a reading", () => {
  let s = subscribed().lives
  const first = M.liveFlush(s, VORON, false)
  assert.equal(first.reading.klippyState, "ready")
  assert.equal(first.lives[VORON].dirty, false)
  assert.equal(M.liveFlush(first.lives, VORON, true).reading, null)
  // A temperature update waits for the 1 s flush.
  const temp = M.liveMessage(first.lives, VORON, M.parseLiveMessage(msg("ws-update-voron")), T0 + 250)
  assert.equal(temp.lives[VORON].dirty, true)
  assert.equal(temp.lives[VORON].urgent, false)
  assert.equal(M.liveFlush(temp.lives, VORON, false).reading, null)
  const flushed = M.liveFlush(temp.lives, VORON, true)
  assert.equal(flushed.reading.nozzle.current, M.parseLiveMessage(msg("ws-update-voron")).diff.extruder.temperature)
  // A state change goes out at once.
  const pause = M.liveMessage(flushed.lives, VORON, M.parseLiveMessage(msg("ws-update-printing.synthetic")), T0 + 500)
  assert.equal(pause.lives[VORON].urgent, true)
  const now = M.liveFlush(pause.lives, VORON, false)
  assert.equal(now.reading.printState, "paused")
  assert.equal(now.reading.progress, 0.4213)
  assert.equal(now.lives[VORON].urgent, false)
  // Pong and messages are signs of life.
  assert.equal(M.livePong(now.lives, VORON, T0 + 900).lives[VORON].lastFrameAt, T0 + 900)
  assert.equal(pause.lives[VORON].lastFrameAt, T0 + 500)
})

// ---- Motor (US1)

test("acceptLive, leaveLive and planDispatch", () => {
  const p = printers()
  let statuses = M.reconcileStatuses({}, p)
  const reading = M.readingFromStatus(M.parseLiveMessage(msg("ws-subscribe-voron")).status)
  const live = M.acceptLive(statuses, VORON, reading, T0)
  assert.equal(live[VORON].live, true)
  assert.equal(live[VORON].requestedAt, T0)
  assert.equal(live[VORON].state, "idle")
  assert.equal(live[VORON].lastSeenAt, T0)
  assert.equal(live[VORON].pending, false)
  assert.equal(live[VORON].seq, 0)
  assert.equal(M.acceptLive(live, "nope", reading, T0), live)
  // Polling skips the live printer only.
  const d = M.planDispatch(live, p, 3000)
  assert.deepEqual(d.requests.map(r => r.key), [BIQU])
  const left = M.leaveLive(live, VORON)
  assert.equal(left[VORON].live, false)
  assert.equal(M.leaveLive(left, VORON), left)
  assert.deepEqual(M.planDispatch(left, p, 3000).requests.map(r => r.key).sort(), [BIQU, VORON].sort())
  // An in-flight query keeps its answer after going live.
  const pend = M.planDispatch(statuses, p, 3000).statuses
  const both = M.acceptLive(pend, VORON, reading, T0)
  assert.equal(both[VORON].pending, true)
})

test("detailFor says live, and the usual text otherwise", () => {
  const p = printers()
  const reading = M.readingFromStatus(M.parseLiveMessage(msg("ws-subscribe-voron")).status)
  const live = M.acceptLive(M.reconcileStatuses({}, p), VORON, reading, T0)
  assert.equal(M.detailFor(p[0], live[VORON], T0 + 90000).freshnessText, "live")
  const polled = M.leaveLive(live, VORON)
  assert.equal(M.detailFor(p[0], polled[VORON], T0 + 90000).freshnessText, "updated 1 min ago")
  const off = Object.assign({}, live[VORON], { state: "offline", offlineSince: T0 })
  assert.equal(M.detailFor(p[0], off, T0 + 90000).freshnessText, "no response for 1 min")
})

test("estimate and Klipper service lookups work on live statuses", () => {
  const p = printers()
  const printing = loadFixture("printing")
  const st = JSON.parse(printing.stdout.slice(0, printing.stdout.lastIndexOf("\n"))).result.status
  const live = M.acceptLive(M.reconcileStatuses({}, p), VORON, M.readingFromStatus(st), T0)
  const est = M.planEstimate(live, p, 3000)
  assert.deepEqual(est.requests.map(r => r.key), [VORON])
  assert.equal(live[VORON].klippyDownSince, null)
  assert.deepEqual(M.planServiceInfo(live, p, 3000).requests, [])
})

// ---- Falhas (US2)

test("ping every 5 s, dead after 10 s without a frame", () => {
  let s = subscribed().lives
  assert.deepEqual(act(M.liveTick(s, T0 + 1000).actions).filter(a => a.startsWith(VORON)), [])
  const p1 = M.liveTick(s, T0 + 5000)
  assert.deepEqual(act(p1.actions).filter(a => a.startsWith(VORON)), [VORON + ":ping"])
  assert.deepEqual(act(M.liveTick(p1.lives, T0 + 6000).actions).filter(a => a.startsWith(VORON)), [])
  const dead = M.liveTick(p1.lives, T0 + 10000)
  assert.deepEqual(act(dead.actions).filter(a => a.startsWith(VORON)), [VORON + ":close"])
  assert.equal(dead.lives[VORON].state, "waiting")
  assert.deepEqual(dead.left, [VORON])
  // A frame in time keeps it alive.
  const alive = M.livePong(p1.lives, VORON, T0 + 8000).lives
  assert.deepEqual(act(M.liveTick(alive, T0 + 10000).actions).filter(a => a.startsWith(VORON)), [VORON + ":ping"])
})

test("an open connection waiting for Klipper is pinged too", () => {
  const t = M.liveTick(M.reconcileLives({}, printers(), T0), T0)
  const o = M.liveOpened(t.lives, VORON, T0).lives
  assert.deepEqual(act(M.liveTick(o, T0 + 4000).actions).filter(a => a.startsWith(VORON)), [])
  const p = M.liveTick(o, T0 + 5000)
  assert.deepEqual(act(p.actions).filter(a => a.startsWith(VORON)), [VORON + ":ping"])
  // Kept alive by its pongs, not closed after 9 s.
  const alive = M.livePong(p.lives, VORON, T0 + 5010).lives
  assert.deepEqual(act(M.liveTick(alive, T0 + 9500).actions).filter(a => a.startsWith(VORON)), [])
})

test("dead means 9 s without a frame, so a tick every second notices within 10 s", () => {
  const s = subscribed().lives
  assert.deepEqual(act(M.liveTick(s, T0 + 8999).actions).filter(a => a.startsWith(VORON)), [VORON + ":ping"])
  assert.deepEqual(act(M.liveTick(s, T0 + 9000).actions).filter(a => a.startsWith(VORON)), [VORON + ":close"])
})

test("a connection that never opens is given up after 10 s", () => {
  const t = M.liveTick(M.reconcileLives({}, printers(), T0), T0)
  const hung = M.liveTick(t.lives, T0 + 10000)
  assert.deepEqual(act(hung.actions).sort(), [BIQU + ":close", VORON + ":close"].sort())
  assert.equal(hung.lives[VORON].state, "waiting")
  assert.deepEqual(hung.left, [])
})

test("liveClosed waits 2, 4, 8, 16 then 30 s; a subscription resets it", () => {
  let lives = M.liveTick(M.reconcileLives({}, printers(), T0), T0).lives
  let now = T0
  const waits = []
  for (let i = 0; i < 6; i++) {
    const c = M.liveClosed(lives, VORON, now)
    waits.push((c.lives[VORON].retryAt - now) / 1000)
    assert.equal(c.lives[VORON].state, "waiting")
    assert.equal(c.left, false)
    // Not before retryAt; then it opens again.
    assert.deepEqual(act(M.liveTick(c.lives, c.lives[VORON].retryAt - 1).actions).filter(a => a.startsWith(VORON)), [])
    const t = M.liveTick(c.lives, c.lives[VORON].retryAt)
    assert.deepEqual(act(t.actions).filter(a => a.startsWith(VORON)), [VORON + ":open"])
    lives = t.lives
    now = c.lives[VORON].retryAt
  }
  assert.deepEqual(waits, [2, 4, 8, 16, 30, 30])
  const s = subscribed().lives
  const c = M.liveClosed(s, VORON, T0)
  assert.equal(c.left, true)
  assert.equal(c.lives[VORON].buffer, null)
  assert.equal(c.lives[VORON].retryAt - T0, 2000)
  assert.equal(M.liveClosed(c.lives, "nope", T0).lives, c.lives)
})

test("Klipper away and back, and a refused subscription", () => {
  const s = subscribed().lives
  const down = M.liveMessage(s, VORON, M.parseLiveMessage(msg("ws-klippy-disconnected.synthetic")), T0 + 100)
  assert.equal(down.left, true)
  assert.equal(down.lives[VORON].state, "open")
  assert.equal(down.lives[VORON].buffer, null)
  const back = M.liveMessage(down.lives, VORON, M.parseLiveMessage(msg("ws-klippy-ready.synthetic")), T0 + 200)
  assert.equal(back.actions.length, 1)
  assert.equal(JSON.parse(back.actions[0].text).id, s[VORON].subscribeId + 1)
  // The new subscription is refused (Klipper still starting): no live.
  const id = back.lives[VORON].subscribeId
  const refused = M.liveMessage(back.lives, VORON, M.parseLiveMessage(msg("ws-subscribe-error.synthetic").replace('"id":2', '"id":' + id)), T0 + 300)
  assert.equal(refused.entered, false)
  assert.equal(refused.lives[VORON].state, "open")
  assert.equal(M.liveFlush(refused.lives, VORON, true).reading, null)
  // Updates outside a subscription are ignored.
  const stray = M.liveMessage(refused.lives, VORON, M.parseLiveMessage(msg("ws-update-voron")), T0 + 400)
  assert.equal(stray.lives[VORON].dirty, false)
})

test("liveWarning", () => {
  assert.equal(M.liveWarning(true), "Live updates unavailable: install qt6-websockets")
  assert.equal(M.liveWarning(false), "")
})

// ---- Comandos (US3)

test("afterCommand: no follow-up query while live", () => {
  const p = printers()
  const reading = M.readingFromStatus(M.parseLiveMessage(msg("ws-subscribe-voron")).status)
  const live = M.acceptLive(M.reconcileStatuses({}, p), VORON, reading, T0)
  const r = M.afterCommand(live, VORON)
  assert.equal(r.dispatch, false)
  assert.equal(r.statuses, live)
  const pend = M.planDispatch(M.reconcileStatuses({}, p), p, 3000).statuses
  const polled = M.afterCommand(pend, VORON)
  assert.equal(polled.dispatch, true)
  assert.equal(polled.statuses[VORON].followUp, true)
})

test("a live reading after the command answer releases the panel protection", () => {
  const p = printers()
  const reading = M.readingFromStatus(M.parseLiveMessage(msg("ws-subscribe-voron")).status)
  const reg = { instances: [1], next: 2 }
  let prot = M.protectFinish(M.protectStart({}, VORON), VORON, T0)
  const early = M.acceptLive(M.reconcileStatuses({}, p), VORON, reading, T0 - 1)
  assert.equal(M.releaseProtection(prot, VORON, early[VORON].requestedAt, 1, reg), prot)
  const late = M.acceptLive(early, VORON, reading, T0 + 1)
  assert.deepEqual(M.releaseProtection(prot, VORON, late[VORON].requestedAt, 1, reg), {})
})

test("the machine functions tolerate garbage", () => {
  const fns = ["emptyLive", "reconcileLives", "liveTick", "liveOpened", "liveMessage", "livePong", "liveClosed",
    "liveFlush", "acceptLive", "leaveLive", "liveWarning", "afterCommand"]
  for (const name of fns) {
    assert.equal(typeof M[name], "function", name)
    for (const a of GARBAGE) for (const b of GARBAGE) assert.doesNotThrow(() => M[name](a, b, a, b), name)
  }
})
