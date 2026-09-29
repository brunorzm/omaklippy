const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

function parse(name) {
  const f = loadFixture(name)
  return M.parseResponse(f.stdout, f.exitCode)
}

const curlCases = [
  ["bad-url", "endereço inválido"],
  ["dns", "host não encontrado"],
  ["refused", "conexão recusada"],
  ["timeout", "sem resposta (tempo limite)"],
]
for (const [fixture, message] of curlCases) {
  test(`curl failure ${fixture} → offline "${message}"`, () => {
    const r = parse(fixture)
    assert.equal(r.reachable, false)
    assert.equal(r.httpStatus, 0)
    assert.equal(r.errorMessage, message)
    assert.deepEqual(M.deriveState(r), { state: "offline", reason: message })
  })
}

test("any other curl failure → offline with the curl code", () => {
  const r = M.parseResponse("\n000", 35)
  assert.equal(r.reachable, false)
  assert.equal(r.errorMessage, "falha de rede (curl 35)")
})

test("curl that could not start → error 'curl não encontrado'", () => {
  for (const code of [-1, 127]) {
    const r = M.parseResponse("", code)
    assert.equal(r.reachable, true)
    assert.equal(r.httpStatus, 0)
    assert.equal(r.errorMessage, "curl não encontrado")
    assert.equal(M.deriveState(r).state, "error")
  }
  assert.equal(M.deriveState(parse("curl-missing.synthetic")).reason, "curl não encontrado")
})

test("401/403 → error with the trusted_clients hint", () => {
  const msg = "acesso não autorizado — libere este computador em trusted_clients"
  assert.equal(parse("unauthorized.synthetic").errorMessage, msg)
  assert.equal(M.parseResponse('{"error":{"code":403,"message":"Forbidden"}}\n403', 0).errorMessage, msg)
  assert.deepEqual(M.deriveState(parse("unauthorized.synthetic")), { state: "error", reason: msg })
})

test("other HTTP errors use error.message, or 'HTTP <code>'", () => {
  assert.equal(parse("klippy-disconnected.synthetic").errorMessage, "Klippy Host not connected")
  assert.equal(parse("http-500-plain.synthetic").errorMessage, "HTTP 500")
  assert.equal(M.deriveState(parse("klippy-disconnected.synthetic")).state, "error")
})

test("200 without result.status, or not JSON → 'resposta inesperada'", () => {
  assert.equal(parse("garbage.synthetic").errorMessage, "resposta inesperada")
  assert.equal(M.parseResponse('{"result":{}}\n200', 0).errorMessage, "resposta inesperada")
  assert.equal(M.deriveState(parse("garbage.synthetic")).state, "error")
})

test("deriveState: Klipper not ready → error with state_message or 'Klipper: <state>'", () => {
  assert.deepEqual(M.deriveState(parse("shutdown.synthetic")), { state: "error", reason: "Emergency stop from M112" })
  assert.deepEqual(M.deriveState(parse("startup.synthetic")), { state: "error", reason: "Klipper: startup" })
})

test("deriveState: print_stats error → error with its message", () => {
  assert.deepEqual(M.deriveState(parse("print-error.synthetic")), { state: "error", reason: "Move out of range: 300.000 0.000 0.200" })
})

test("deriveState evaluates offline before HTTP errors before Klipper before print state", () => {
  assert.equal(M.deriveState({ reachable: false, errorMessage: "x", klippyState: "ready", printState: "printing" }).state, "offline")
  assert.equal(M.deriveState({ reachable: true, errorMessage: "x", klippyState: "ready", printState: "printing" }).state, "error")
  assert.equal(M.deriveState({ reachable: true, errorMessage: "", klippyState: "shutdown", printState: "printing" }).state, "error")
})

test("applyReading going offline clears job and temperatures", () => {
  const printing = M.applyReading(M.initialStatus("k"), parse("printing.synthetic"), 1000)
  const off = M.applyReading(printing, parse("timeout"), 2000)
  assert.equal(off.state, "offline")
  assert.equal(off.percent, null)
  assert.equal(off.remainingSec, null)
  assert.equal(off.filename, "")
  assert.equal(off.nozzle, null)
  assert.equal(off.bed, null)
  assert.equal(off.offlineSince, 2000)
  assert.equal(off.lastSeenAt, 1000, "keeps when it was last seen")
})

test("applyReading keeps offlineSince while it stays offline", () => {
  const first = M.applyReading(M.initialStatus("k"), parse("refused"), 1000)
  const second = M.applyReading(first, parse("timeout"), 9000)
  assert.equal(second.offlineSince, 1000)
})

test("applyReading back online resets offlineSince", () => {
  const off = M.applyReading(M.initialStatus("k"), parse("refused"), 1000)
  const on = M.applyReading(off, parse("standby"), 2000)
  assert.equal(on.state, "idle")
  assert.equal(on.offlineSince, null)
})

test("applyReading does not mark 'curl não encontrado' as seen", () => {
  const s = M.applyReading(M.initialStatus("k"), parse("curl-missing.synthetic"), 1000)
  assert.equal(s.state, "error")
  assert.equal(s.lastSeenAt, null)
})

test("no exported function throws on garbage input", () => {
  const garbage = [null, undefined, {}, "lixo", 42, []]
  for (const [name, fn] of Object.entries(M)) {
    if (typeof fn !== "function") continue
    for (const a of garbage) {
      for (const b of garbage) {
        assert.doesNotThrow(() => fn(a, b, a, b, 0), `${name}(${JSON.stringify(a)}, ${JSON.stringify(b)})`)
      }
    }
  }
})

test("real Biqu capture with Klipper stopped (503 + traceback) → error 'Klippy Host not connected'", () => {
  const r = parse("klippy-disconnected")
  assert.equal(r.httpStatus, 503)
  assert.deepEqual(M.deriveState(r), { state: "error", reason: "Klippy Host not connected" })
  assert.equal(r.nozzle, null)
})

test("real Biqu capture outside trusted_clients (401 + traceback) → error with the hint", () => {
  const r = parse("unauthorized")
  assert.equal(r.httpStatus, 401)
  assert.equal(M.deriveState(r).reason, "acesso não autorizado — libere este computador em trusted_clients")
})
