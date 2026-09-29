const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel } = require("./helpers")
const M = loadModel()

test("readSettings applies defaults", () => {
  const s = M.readSettings({})
  assert.deepEqual(s.printers, [])
  assert.equal(s.intervalMs, 5000)
  assert.equal(s.timeoutMs, 3000)
})

test("readSettings clamps interval to [2, 3600] and timeout to [1, 30]", () => {
  assert.equal(M.readSettings({ refreshIntervalSec: 1 }).intervalMs, 2000)
  assert.equal(M.readSettings({ refreshIntervalSec: 9999 }).intervalMs, 3600000)
  assert.equal(M.readSettings({ refreshIntervalSec: 10 }).intervalMs, 10000)
  assert.equal(M.readSettings({ timeoutSec: 0 }).timeoutMs, 1000)
  assert.equal(M.readSettings({ timeoutSec: 99 }).timeoutMs, 30000)
})

test("readSettings uses the default for invalid values", () => {
  assert.equal(M.readSettings({ refreshIntervalSec: "abc" }).intervalMs, 5000)
  assert.equal(M.readSettings({ refreshIntervalSec: null }).intervalMs, 5000)
  assert.equal(M.readSettings({ timeoutSec: NaN }).timeoutMs, 3000)
  assert.equal(M.readSettings({ timeoutSec: {} }).timeoutMs, 3000)
})

test("readSettings treats a non-array printers value as []", () => {
  assert.deepEqual(M.readSettings({ printers: "Voron" }).printers, [])
  assert.deepEqual(M.readSettings({ printers: { name: "x" } }).printers, [])
  assert.deepEqual(M.readSettings(null).printers, [])
  assert.deepEqual(M.readSettings(undefined).printers, [])
})

const addressCases = [
  ["192.168.1.50", "http://192.168.1.50"],
  ["voron.local:7125", "http://voron.local:7125"],
  ["http://voron.local/", "http://voron.local"],
  ["https://p.lan:8443", "https://p.lan:8443"],
  ["  voron  ", "http://voron"],
  ["http://h/mainsail/", "http://h/mainsail"],
  ["", ""],
  ["ftp://x", ""],
  ["a b", ""],
  ["http://", ""],
  ["host:abc", ""],
  ["host:70000", ""],
]
for (const [input, expected] of addressCases) {
  test(`normalizeAddress(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
    assert.equal(M.normalizeAddress(input), expected)
  })
}

test("readSettings accepts the array-like lists QML hands over", () => {
  const qtList = { length: 1, 0: { name: "Voron", address: "voron.local" } }
  assert.equal(M.readSettings({ printers: qtList }).printers[0].displayName, "Voron")
})

test("readSettings accepts printers as a JSON string (omarchy bar set without --json)", () => {
  const s = M.readSettings({ printers: '[{"name":"A","address":"10.0.0.1"},{"name":"B","address":"10.0.0.2"}]' })
  assert.deepEqual(s.printers.map(p => p.displayName), ["A", "B"])
  assert.deepEqual(M.readSettings({ printers: "[not json" }).printers, [])
})

test("readSettings accepts a single printer object (what a one-item --json list becomes)", () => {
  const s = M.readSettings({ printers: { name: "Voron", address: "voron.local" } })
  assert.equal(s.printers.length, 1)
  assert.equal(s.printers[0].baseUrl, "http://voron.local")
})

test("normalizeAddress never throws on non-strings", () => {
  for (const v of [null, undefined, 42, {}, []]) assert.equal(M.normalizeAddress(v), "")
})

test("normalizePrinters ignores items that are not objects or lack a string address", () => {
  const list = M.normalizePrinters([null, "x", { name: "a" }, { address: 5 }, { name: "ok", address: "10.0.0.1" }])
  assert.equal(list.length, 1)
  assert.equal(list[0].name, "ok")
})

test("normalizePrinters derives key, order, baseUrl, invalidReason and displayName", () => {
  const list = M.normalizePrinters([
    { name: "Voron", address: "192.168.1.50" },
    { name: "", address: "ender.local:7125" },
    { name: "Bad", address: "a b" },
  ])
  assert.deepEqual(list.map(p => p.key), ["http://192.168.1.50#0", "http://ender.local:7125#1", "#2"])
  assert.deepEqual(list.map(p => p.order), [0, 1, 2])
  assert.equal(list[0].baseUrl, "http://192.168.1.50")
  assert.equal(list[0].invalidReason, "")
  assert.equal(list[0].displayName, "Voron")
  assert.equal(list[1].displayName, "ender.local:7125", "nome vazio → host da URL")
  assert.equal(list[2].baseUrl, "")
  assert.equal(list[2].invalidReason, "endereço inválido")
  assert.equal(list[2].displayName, "Bad")
})

test("normalizePrinters uses the raw address as name when the address is invalid and the name is empty", () => {
  const list = M.normalizePrinters([{ address: "a b" }])
  assert.equal(list[0].displayName, "a b")
})

test("disambiguateNames appends host[:port] to repeated names (case/space-insensitive)", () => {
  const list = M.normalizePrinters([
    { name: "Ender", address: "192.168.1.51" },
    { name: " ender ", address: "ender.local:7125" },
    { name: "Voron", address: "voron.local" },
  ])
  assert.deepEqual(list.map(p => p.displayName), ["Ender (192.168.1.51)", "ender (ender.local:7125)", "Voron"])
})

test("disambiguateNames leaves unique names alone and is exported", () => {
  const list = M.disambiguateNames([{ name: "A", displayName: "A", baseUrl: "http://a", address: "a" }])
  assert.equal(list[0].displayName, "A")
})
