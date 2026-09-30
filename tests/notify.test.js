const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// ---- Slice 004: desktop notifications

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

// A status as the widget holds it after reading the given fixture.
function from(fixture, prev) {
  return M.applyReading(prev || M.initialStatus("k#0"), reading(fixture), 1000)
}

// Feeds statuses to observe in order; returns the final watch and every event.
function run(statuses, watch, protectedNow) {
  let w = watch
  const events = []
  for (const s of statuses) {
    const r = M.observe(w, s, protectedNow === true)
    w = r.watch
    events.push(...r.events)
  }
  return { watch: w, events }
}

const offline = () => from("refused")

test("emptyWatch", () => {
  assert.deepEqual(M.emptyWatch(), { seeded: false, last: null, silent: 0, lostNotified: false })
})

test("the first answered reading seeds the watch without events", () => {
  for (const f of ["printing.synthetic", "paused.synthetic", "complete.synthetic", "shutdown.synthetic", "standby-heating.synthetic"]) {
    const r = M.observe(M.emptyWatch(), from(f), false)
    assert.deepEqual(r.events, [], f)
    assert.equal(r.watch.seeded, true, f)
  }
  const s = from("printing.synthetic")
  assert.deepEqual(M.observe(undefined, s, false).watch.last, {
    state: "printing", printState: "printing", filename: s.filename, heating: true })
  assert.equal(M.observe(M.emptyWatch(), from("standby.synthetic"), false).watch.last.heating, false)
  assert.equal(M.observe(M.emptyWatch(), from("standby-heating.synthetic"), false).watch.last.heating, true)
})

test("readings without an answer before the first answer change nothing", () => {
  const w = M.emptyWatch()
  const r = M.observe(w, offline(), false)
  assert.equal(r.watch, w)
  assert.deepEqual(r.events, [])
})

test("a repeated state never notifies", () => {
  for (const f of ["printing.synthetic", "paused.synthetic", "standby.synthetic", "complete.synthetic", "shutdown.synthetic"]) {
    assert.deepEqual(run([from(f), from(f), from(f)], M.emptyWatch()).events, [], f)
  }
})

test("observe never throws and keeps the watch on a bad status", () => {
  const w = M.emptyWatch()
  for (const v of [null, undefined, {}, "x", 5]) {
    const r = M.observe(w, v, false)
    assert.equal(r.watch, w)
    assert.deepEqual(r.events, [])
  }
  for (const v of [null, "x", 5]) assert.doesNotThrow(() => M.observe(v, from("printing.synthetic"), false))
})

test("reconcileWatches keeps only configured printers", () => {
  const ps = M.normalizePrinters([{ name: "A", address: "a" }])
  const watches = { [ps[0].key]: M.emptyWatch(), "gone#1": M.emptyWatch() }
  assert.deepEqual(Object.keys(M.reconcileWatches(watches, ps)), [ps[0].key])
  const kept = { [ps[0].key]: M.emptyWatch() }
  assert.equal(M.reconcileWatches(kept, ps), kept)
  for (const v of [null, undefined, "x"]) assert.doesNotThrow(() => M.reconcileWatches(v, v))
})

test("buildNotification per event type", () => {
  const args = (u, t, b) => ["notify-send", "-a", "OmaKlippy", "-u", u, "-i", "printer", t, b]
  const c = M.buildNotification({ type: "complete", filename: "cube.gcode" }, "Voron")
  assert.deepEqual(c, { urgency: "normal", title: "Print complete", body: "Voron — cube.gcode", args: args("normal", "Print complete", "Voron — cube.gcode") })
  assert.equal(M.buildNotification({ type: "complete", filename: "" }, "Voron").body, "Voron")
  const f = M.buildNotification({ type: "failed", filename: "cube.gcode", reason: "MCU shutdown" }, "Voron")
  assert.deepEqual([f.urgency, f.title, f.body], ["critical", "Print failed", "Voron: MCU shutdown (cube.gcode)"])
  assert.equal(M.buildNotification({ type: "failed", filename: "", reason: "Heater extruder not heating" }, "Biqu B1").body, "Biqu B1: Heater extruder not heating")
  const p = M.buildNotification({ type: "paused", filename: "cube.gcode" }, "Voron")
  assert.deepEqual([p.urgency, p.title, p.body], ["normal", "Print paused", "Voron — cube.gcode"])
  const l = M.buildNotification({ type: "lostContact", filename: "cube.gcode" }, "Voron")
  assert.deepEqual([l.urgency, l.title, l.body], ["critical", "Printer not responding", "Voron stopped answering during a print (cube.gcode)"])
  assert.deepEqual(l.args, args("critical", l.title, l.body))
  for (const v of [null, undefined, {}, { type: "boom" }]) assert.equal(M.buildNotification(v, "x"), null)
})

test("parseNotifyResult and notifyWarning", () => {
  assert.deepEqual(M.parseNotifyResult(0, true), { ok: true, message: "" })
  assert.deepEqual(M.parseNotifyResult(-1, false), { ok: false, message: "notify-send not found" })
  assert.deepEqual(M.parseNotifyResult(-2, true), { ok: false, message: "no answer from notify-send" })
  assert.deepEqual(M.parseNotifyResult(1, true), { ok: false, message: "notification service unavailable (exit 1)" })
  assert.equal(M.NOTIFY_TIMEOUT_SEC, 10)
  assert.equal(M.NOTIFY_LOST_AFTER, 3)
  assert.equal(M.notifyWarning({ available: false, message: "x" }), "Notifications unavailable: x")
  for (const v of [{ available: true, message: "" }, { available: null, message: "" }, null, undefined]) assert.equal(M.notifyWarning(v), "")
})

test("registry: the first live instance leads", () => {
  let reg = M.emptyRegistry()
  assert.deepEqual(reg, { instances: [], next: 1 })
  const a = M.registerInstance(reg); reg = a.registry
  const b = M.registerInstance(reg); reg = b.registry
  assert.deepEqual([a.id, b.id], [1, 2])
  assert.equal(M.isLeader(reg, 1), true)
  assert.equal(M.isLeader(reg, 2), false)
  reg = M.unregisterInstance(reg, 1)
  assert.equal(M.isLeader(reg, 2), true)
  assert.equal(M.unregisterInstance(reg, 9), reg, "unknown id")
  for (const v of [null, undefined, "x"]) {
    assert.doesNotThrow(() => M.registerInstance(v))
    assert.doesNotThrow(() => M.unregisterInstance(v, 1))
    assert.equal(M.isLeader(v, 1), false)
  }
})

// ---- US1: print complete

test("complete after printing or paused notifies once, with the file", () => {
  for (const before of ["printing.synthetic", "paused.synthetic"]) {
    const r = run([from(before), from("complete.synthetic"), from("complete.synthetic")], M.emptyWatch())
    assert.equal(r.events.length, 1, before)
    assert.equal(r.events[0].type, "complete")
    assert.equal(r.events[0].filename, from("complete.synthetic").filename || from(before).filename)
  }
})

test("complete without a print before it does not notify (seeded or idle)", () => {
  assert.deepEqual(run([from("complete.synthetic")], M.emptyWatch()).events, [], "shell started after the print")
  assert.deepEqual(run([from("standby.synthetic"), from("complete.synthetic")], M.emptyWatch()).events, [])
})

test("cancelling never notifies (Voron goes paused → standby)", () => {
  assert.deepEqual(run([from("paused.synthetic"), from("standby.synthetic")], M.emptyWatch()).events, [])
  assert.deepEqual(run([from("printing.synthetic"), from("cancelled.synthetic")], M.emptyWatch()).events, [])
  assert.deepEqual(run([from("printing.synthetic"), from("standby.synthetic")], M.emptyWatch()).events, [])
})

// ---- US2: print failed and lost contact

test("an error during a print notifies once with the reason", () => {
  for (const before of ["printing.synthetic", "paused.synthetic"]) {
    for (const err of ["print-error.synthetic", "shutdown.synthetic"]) {
      const bad = from(err)
      const r = run([from(before), bad, bad], M.emptyWatch())
      assert.equal(r.events.length, 1, before + "/" + err)
      assert.deepEqual([r.events[0].type, r.events[0].reason], ["failed", bad.reason])
      assert.notEqual(r.events[0].filename, "")
    }
  }
})

test("an idle printer notifies an error only when a heater was on", () => {
  const hot = run([from("standby-heating.synthetic"), from("shutdown.synthetic")], M.emptyWatch())
  assert.equal(hot.events.length, 1)
  assert.deepEqual([hot.events[0].type, hot.events[0].filename], ["failed", ""])
  assert.deepEqual(run([from("standby.synthetic"), from("shutdown.synthetic")], M.emptyWatch()).events, [])
  assert.deepEqual(run([from("shutdown.synthetic"), from("standby.synthetic")], M.emptyWatch()).events, [], "error → idle")
})

test("Klipper restarting is not a failure (FIRMWARE_RESTART)", () => {
  assert.equal(from("startup.synthetic").state, "error")
  for (const before of ["printing.synthetic", "standby-heating.synthetic"]) {
    assert.deepEqual(run([from(before), from("startup.synthetic"), from("standby.synthetic")], M.emptyWatch()).events, [], before)
  }
})

test("lost contact: once after 3 silent readings during a print, never for 1–2", () => {
  const printing = from("printing.synthetic")
  assert.deepEqual(run([printing, offline(), offline(), printing], M.emptyWatch()).events, [], "two misses and back")
  const r = run([printing, offline(), offline(), offline(), offline(), offline()], M.emptyWatch())
  assert.equal(r.events.length, 1)
  assert.deepEqual([r.events[0].type, r.events[0].filename], ["lostContact", printing.filename])
  const again = run([printing, offline(), offline(), offline(), printing, offline(), offline(), offline()], M.emptyWatch())
  assert.equal(again.events.filter(e => e.type === "lostContact").length, 2, "answering again re-arms it")
  assert.deepEqual(run([from("standby.synthetic"), offline(), offline(), offline(), offline()], M.emptyWatch()).events, [], "idle")
})

test("after a gap the next answer is compared with the last answered state", () => {
  const printing = from("printing.synthetic")
  assert.deepEqual(run([printing, offline(), from("complete.synthetic")], M.emptyWatch()).events.map(e => e.type), ["complete"])
  assert.deepEqual(run([printing, offline(), offline(), offline(), from("shutdown.synthetic")], M.emptyWatch()).events.map(e => e.type), ["lostContact", "failed"])
})

// ---- US3: paused, and panel actions that must not notify

test("printing → paused notifies; a pause while protected does not", () => {
  const printing = from("printing.synthetic")
  const paused = from("paused.synthetic")
  const r = run([printing, paused, paused], M.emptyWatch())
  assert.deepEqual(r.events.map(e => [e.type, e.filename]), [["paused", paused.filename]])
  assert.equal(run([printing, paused, printing, paused], M.emptyWatch()).events.length, 2, "resumed and paused again")
  const seeded = M.observe(M.emptyWatch(), printing, false).watch
  const guarded = M.observe(seeded, paused, true)
  assert.deepEqual(guarded.events, [])
  assert.deepEqual(M.observe(guarded.watch, paused, false).events, [], "the next reading is still paused: nothing new")
  for (const f of ["complete.synthetic", "shutdown.synthetic"]) assert.deepEqual(M.observe(seeded, from(f), true).events, [], f)
})

test("protections: start, finish, release per instance", () => {
  const reg = { instances: [1, 2], next: 3 }
  let p = M.protectStart({}, "k")
  assert.deepEqual(p.k, { pending: 1, answeredAt: null, released: {} })
  assert.equal(M.isProtected(p, "k", 1), true)
  assert.equal(M.releaseProtection(p, "k", 5000, 1, reg), p, "still running")
  p = M.protectFinish(p, "k", 1000)
  assert.deepEqual([p.k.pending, p.k.answeredAt], [0, 1000])
  assert.equal(M.releaseProtection(p, "k", 999, 2, reg), p, "query left before the answer")
  assert.equal(M.releaseProtection(p, "k", null, 2, reg), p)
  const one = M.releaseProtection(p, "k", 1000, 2, reg)
  assert.equal(M.isProtected(one, "k", 2), false)
  assert.equal(M.isProtected(one, "k", 1), true, "instance 1's old query is still read protected")
  const both = M.releaseProtection(one, "k", 1200, 1, reg)
  assert.equal("k" in both, false, "gone once every instance released it")
  assert.equal(M.isProtected(both, "k", 1), false)
})

test("protections: two commands release only after both answer; a new one re-protects", () => {
  const reg = { instances: [1], next: 2 }
  let p = M.protectStart(M.protectStart({}, "k"), "k")
  p = M.protectFinish(p, "k", 1000)
  assert.equal(M.releaseProtection(p, "k", 2000, 1, reg), p, "e-stop still running")
  p = M.protectFinish(p, "k", 1500)
  assert.equal("k" in M.releaseProtection(p, "k", 1500, 1, reg), false)
  let q = M.protectFinish(M.protectStart({}, "k"), "k", 10)
  q = M.releaseProtection(q, "k", 10, 1, { instances: [1, 2], next: 3 })
  assert.equal(M.isProtected(q, "k", 1), false)
  q = M.protectStart(q, "k")
  assert.equal(M.isProtected(q, "k", 1), true, "new command protects instance 1 again")
  assert.equal(M.protectFinish(q, "k", 5).k.pending, 0)
  assert.equal(M.protectFinish(M.protectFinish(q, "k", 5), "k", 6).k.pending, 0, "never below 0")
})

test("protection functions leave other printers alone and never throw", () => {
  const p = { other: { pending: 0, answeredAt: 1, released: {} } }
  assert.equal(M.protectFinish(p, "k", 1), p)
  assert.equal(M.releaseProtection(p, "k", 5, 1, { instances: [1], next: 2 }), p)
  assert.equal(M.isProtected(p, "k", 1), false)
  for (const v of [null, undefined, "x"]) {
    assert.doesNotThrow(() => M.protectStart(v, v))
    assert.doesNotThrow(() => M.protectFinish(v, v, v))
    assert.doesNotThrow(() => M.releaseProtection(v, v, v, v, v))
    assert.equal(M.isProtected(v, "k", 1), false)
  }
})

// ---- US4: choosing what to notify

test("filterEvents keeps only the switched-on types", () => {
  const all = [{ type: "complete" }, { type: "failed" }, { type: "paused" }, { type: "lostContact" }]
  assert.deepEqual(M.filterEvents(all, { complete: true, failed: true, paused: true, lostContact: true }), all)
  assert.deepEqual(M.filterEvents(all, { complete: false, failed: true, paused: false, lostContact: true }).map(e => e.type), ["failed", "lostContact"])
  assert.deepEqual(M.filterEvents(all, { complete: false, failed: false, paused: false, lostContact: false }), [])
  assert.deepEqual(M.filterEvents(all, M.readSettings({ notifyLostContact: "Off" }).notify).map(e => e.type), ["complete", "failed", "paused"])
  for (const v of [null, undefined, "x"]) assert.doesNotThrow(() => M.filterEvents(v, v))
})
