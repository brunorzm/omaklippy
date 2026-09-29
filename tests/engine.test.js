const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

const printers = () => M.normalizePrinters([
  { name: "Voron", address: "192.168.1.50" },
  { name: "Ender", address: "10.0.0.2" },
  { name: "Bad", address: "a b" },
])

function reading(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

test("reconcileStatuses creates initial statuses and marks invalid printers offline", () => {
  const ps = printers()
  const s = M.reconcileStatuses({}, ps)
  assert.deepEqual(Object.keys(s).sort(), ps.map(p => p.key).sort())
  assert.equal(s[ps[0].key].reason, "aguardando primeira resposta")
  assert.equal(s[ps[2].key].state, "offline")
  assert.equal(s[ps[2].key].reason, "endereço inválido")
})

test("reconcileStatuses keeps existing statuses, drops removed keys and does not mutate its input", () => {
  const ps = printers()
  const first = M.reconcileStatuses({}, ps)
  const kept = Object.assign({}, first[ps[0].key], { state: "printing", percent: 10 })
  const prev = Object.assign({}, first, { [ps[0].key]: kept, "gone#9": M.initialStatus("gone#9") })
  const snapshot = JSON.stringify(prev)
  const next = M.reconcileStatuses(prev, ps)
  assert.equal(next[ps[0].key], kept)
  assert.equal(next["gone#9"], undefined)
  assert.equal(JSON.stringify(prev), snapshot)
})

test("planDispatch requests every valid, idle printer and marks it pending", () => {
  const ps = printers()
  const s = M.reconcileStatuses({}, ps)
  const out = M.planDispatch(s, ps, 3000)
  assert.deepEqual(out.requests.map(r => r.key), [ps[0].key, ps[1].key])
  assert.equal(out.requests[0].seq, 1)
  assert.deepEqual(out.requests[0].args, M.buildCurlArgs(M.buildQueryUrl("http://192.168.1.50"), 3))
  assert.equal(out.statuses[ps[0].key].pending, true)
  assert.equal(out.statuses[ps[0].key].seq, 1)
  assert.equal(out.statuses[ps[2].key].pending, false)
  assert.equal(s[ps[0].key].pending, false, "input untouched")
})

test("planDispatch skips printers that are still pending", () => {
  const ps = printers()
  const once = M.planDispatch(M.reconcileStatuses({}, ps), ps, 3000)
  const twice = M.planDispatch(once.statuses, ps, 3000)
  assert.equal(twice.requests.length, 0)
})

test("planDispatch rounds the timeout up to whole seconds", () => {
  const ps = printers()
  const out = M.planDispatch(M.reconcileStatuses({}, ps), ps, 2500)
  assert.equal(out.requests[0].args[3], "3")
})

test("acceptResult applies a matching result and clears pending", () => {
  const ps = printers()
  const key = ps[0].key
  const d = M.planDispatch(M.reconcileStatuses({}, ps), ps, 3000)
  const next = M.acceptResult(d.statuses, key, 1, reading("printing.synthetic"), 5000)
  assert.equal(next[key].state, "printing")
  assert.equal(next[key].pending, false)
  assert.equal(next[key].lastSeenAt, 5000)
})

test("acceptResult ignores stale seqs, removed keys and a second result for the same seq", () => {
  const ps = printers()
  const key = ps[0].key
  const d = M.planDispatch(M.reconcileStatuses({}, ps), ps, 3000)
  assert.equal(M.acceptResult(d.statuses, key, 0, reading("printing.synthetic"), 1), d.statuses)
  assert.equal(M.acceptResult(d.statuses, "gone#9", 1, reading("printing.synthetic"), 1), d.statuses)
  const once = M.acceptResult(d.statuses, key, 1, reading("printing.synthetic"), 1)
  assert.equal(M.acceptResult(once, key, 1, reading("paused.synthetic"), 2), once)
})

test("guard fires → offline; a late onExited with the same seq is ignored", () => {
  const ps = printers()
  const key = ps[0].key
  const d = M.planDispatch(M.reconcileStatuses({}, ps), ps, 3000)
  const guarded = M.acceptResult(d.statuses, key, 1, { reachable: false, errorMessage: "sem resposta (tempo limite)" }, 4000)
  assert.equal(guarded[key].state, "offline")
  assert.equal(guarded[key].reason, "sem resposta (tempo limite)")
  assert.equal(M.acceptResult(guarded, key, 1, reading("printing.synthetic"), 4100), guarded)
})
