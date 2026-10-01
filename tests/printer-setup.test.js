const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// The user's two printers as shell.json holds them, plus a field the plugin
// does not know about (it must survive every save).
function raw() {
  return [
    { name: "Voron", address: "voron.local", webUrl: "http://voron.local:81", foo: 1 },
    { name: "Biqu", address: "biqu.local" }
  ]
}

function printers(list) {
  return M.normalizePrinters(list || raw())
}

function fx(name) {
  const f = loadFixture(name)
  return { stdout: f.stdout, exitCode: f.exitCode }
}

const GARBAGE = [undefined, null, 5, "", "{", "[]", {}, [], [null], { result: 5 }]

// ---- Lista nova e gravação

test("rawPrinters reads a list, a JSON text of a list, and nothing else", () => {
  assert.deepEqual(M.rawPrinters({ printers: raw() }), raw())
  assert.deepEqual(M.rawPrinters({ printers: JSON.stringify(raw()) }), raw())
  assert.deepEqual(M.rawPrinters({ printers: "garbage" }), [])
  assert.deepEqual(M.rawPrinters({}), [])
  assert.deepEqual(M.rawPrinters(null), [])
  // QML hands lists over as array-likes.
  assert.deepEqual(M.rawPrinters({ printers: { length: 1, 0: { address: "a.local" } } }), [{ address: "a.local" }])
})

test("addPrinterToList refuses a duplicate and an invalid address", () => {
  const dup = M.addPrinterToList(raw(), "biqu.local", "", printers())
  assert.equal(dup.error, "biqu.local is already in the list")
  assert.equal(dup.list, null)
  assert.equal(M.addPrinterToList(raw(), "BIQU.local", "").error, "BIQU.local is already in the list")
  assert.equal(M.addPrinterToList(raw(), "http://biqu.local/", "").error, "http://biqu.local/ is already in the list")
  assert.equal(M.addPrinterToList(raw(), "a b", "").error, M.TEXT.invalidAddress)
  assert.equal(M.addPrinterToList(raw(), "", "").error, M.TEXT.invalidAddress)
  // The same host on another port is the same printer (nginx on 80 → 7125).
  assert.equal(M.addPrinterToList(raw(), "biqu.local:7125", "").error, "biqu.local:7125 is already in the list")
  assert.equal(M.addPrinterToList([{ address: "biqu.local:7125" }], "biqu.local", "").error, "biqu.local is already in the list")
})

test("addPrinterToList appends and keeps every other field", () => {
  const r = M.addPrinterToList(raw(), " 192.168.1.50 ", " Ender ", printers())
  assert.equal(r.error, "")
  assert.deepEqual(r.list, raw().concat([{ name: "Ender", address: "192.168.1.50" }]))
  assert.equal(r.key, "http://192.168.1.50#2")
  const unnamed = M.addPrinterToList(raw(), "192.168.1.50", "  ")
  assert.deepEqual(unnamed.list[2], { address: "192.168.1.50" })
  // The source list is not touched.
  const src = raw()
  M.addPrinterToList(src, "192.168.1.50", "")
  assert.deepEqual(src, raw())
})

test("addPrinterToList key follows normalizePrinters order past invalid items", () => {
  const withJunk = [raw()[0], { address: 5 }, raw()[1]]
  const r = M.addPrinterToList(withJunk, "192.168.1.50", "")
  assert.equal(r.key, "http://192.168.1.50#2")
  const keys = M.normalizePrinters(r.list).map(p => p.key)
  assert.ok(keys.includes(r.key))
  // A text list becomes a real list.
  assert.ok(Array.isArray(M.addPrinterToList(M.rawPrinters({ printers: JSON.stringify(raw()) }), "x.local", "").list))
})

test("removePrinterFromList removes by order and keeps the rest", () => {
  assert.deepEqual(M.removePrinterFromList(raw(), 1), [raw()[0]])
  assert.deepEqual(M.removePrinterFromList(raw(), 0), [raw()[1]])
  const withJunk = [raw()[0], { address: 5 }, raw()[1]]
  // Order 1 is the Biqu (normalizePrinters skips the junk); the junk stays.
  assert.deepEqual(M.removePrinterFromList(withJunk, 1), [raw()[0], { address: 5 }])
  assert.deepEqual(M.removePrinterFromList([raw()[0]], 0), [])
  assert.deepEqual(M.removePrinterFromList(raw(), 7), raw())
})

test("buildSaveArgs puts a space before the JSON (qs ipc splits a leading [)", () => {
  const list = [{ name: "Biqu B1", address: "biqu.local" }]
  assert.deepEqual(M.buildSaveArgs(list), ["omarchy-shell", "shell", "setBarWidget", "io.github.brunorzm.omaklippy",
    "printers", " " + JSON.stringify(list), "{}"])
  assert.deepEqual(M.buildSaveArgs([]), ["omarchy-shell", "shell", "setBarWidget", "io.github.brunorzm.omaklippy",
    "printers", " []", "{}"])
})

test("parseSaveResult", () => {
  const ok = fx("set-widget-ok")
  assert.deepEqual(M.parseSaveResult(ok.stdout, ok.exitCode, true), { ok: true, message: "" })
  const err = fx("set-widget-error.synthetic")
  assert.deepEqual(M.parseSaveResult(err.stdout, err.exitCode, true),
    { ok: false, message: "could not find widget io.github.brunorzm.omaklippy" })
  assert.deepEqual(M.parseSaveResult("", -1, false), { ok: false, message: "omarchy-shell not found" })
  assert.deepEqual(M.parseSaveResult("", -2, true), { ok: false, message: M.TEXT.setup.shellNoAnswer })
  assert.deepEqual(M.parseSaveResult("", 1, true, "omarchy-shell is not running\n"),
    { ok: false, message: "omarchy-shell is not running" })
  assert.equal(M.parseSaveResult("", 3, true).ok, false)
})

// ---- Redes, anúncio, verificação, nomes

test("parseLocalNets keeps only the real local networks", () => {
  const f = fx("ip-addr.synthetic")
  assert.deepEqual(M.buildNetsArgs(), ["ip", "-j", "-4", "addr", "show"])
  assert.deepEqual(M.parseLocalNets(f.stdout, 0), [{ iface: "wlp7s0", prefix: "192.168.1.", self: "192.168.1.21" }])
  assert.deepEqual(M.parseLocalNets(f.stdout, 1), [])
  for (const g of GARBAGE) assert.deepEqual(M.parseLocalNets(g, 0), [])
  // Two addresses in the same /24 make one network.
  const twice = JSON.stringify([{ ifname: "eth0", addr_info: [
    { family: "inet", local: "10.0.0.5", prefixlen: 24, scope: "global" },
    { family: "inet", local: "10.0.0.6", prefixlen: 16, scope: "global" },
    { family: "inet", local: "10.1.0.6", prefixlen: 8, scope: "global" }] }])
  assert.deepEqual(M.parseLocalNets(twice, 0), [{ iface: "eth0", prefix: "10.0.0.", self: "10.0.0.5" }])
})

test("parseMdns reads IPv4 resolved lines and undoes avahi escapes", () => {
  assert.deepEqual(M.buildMdnsArgs(), ["avahi-browse", "-rtp", "_moonraker._tcp"])
  assert.deepEqual(M.parseMdns(fx("avahi-moonraker.synthetic").stdout), [
    { name: "voron", host: "voron.local", ip: "192.168.1.110", port: 7125 },
    { name: "My Printer", host: "myprinter.local", ip: "192.168.1.120", port: 7125 }
  ])
  for (const g of GARBAGE) assert.deepEqual(M.parseMdns(g), [])
})

test("buildScanArgs checks the whole /24 but this computer, in one curl", () => {
  const nets = M.parseLocalNets(fx("ip-addr.synthetic").stdout, 0)
  const args = M.buildScanArgs(nets)
  assert.equal(args[0], "curl")
  assert.ok(args.includes("--parallel"))
  assert.equal(args[args.indexOf("--parallel-max") + 1], "64")
  const urls = args.filter(a => a.startsWith("http://"))
  assert.equal(urls.length, 253)
  assert.ok(!urls.includes("http://192.168.1.21:7125/server/info"))
  assert.ok(urls.includes("http://192.168.1.1:7125/server/info"))
  assert.ok(urls.includes("http://192.168.1.254:7125/server/info"))
  for (const u of urls) assert.equal(args[args.indexOf(u) - 1], "/dev/null")
  assert.equal(args.filter(a => a === "-o").length, 253)
  assert.deepEqual(M.buildScanArgs([]), [])
  assert.deepEqual(M.buildScanArgs(null), [])
})

test("parseScan returns the addresses that answered 200, whatever curl's exit code", () => {
  assert.deepEqual(M.parseScan(fx("scan.synthetic").stdout), ["192.168.1.100", "192.168.1.110"])
  assert.deepEqual(M.parseScan("http://10.0.0.2:7125/server/info 200\nhttp://10.0.0.2:7125/server/info 200\n"), ["10.0.0.2"])
  for (const g of GARBAGE) assert.deepEqual(M.parseScan(g), [])
})

test("parseReverse and parseHostname", () => {
  assert.deepEqual(M.buildReverseArgs("192.168.1.110"), ["avahi-resolve", "-a", "192.168.1.110"])
  assert.equal(M.parseReverse("192.168.1.110\tvoron.local\n", 0), "voron.local")
  assert.equal(M.parseReverse("192.168.1.110\tvoron.local\n", 1), "")
  assert.equal(M.parseReverse("Failed to resolve address '192.168.1.5': Timeout reached\n", 0), "")
  const hostArgs = M.buildHostnameArgs("http://192.168.1.110:7125", 3)
  assert.equal(hostArgs[0], "curl")
  assert.equal(hostArgs[hostArgs.length - 1], "http://192.168.1.110:7125/printer/info")
  const voron = fx("printer-info-voron")
  assert.equal(M.parseHostname(voron.stdout, voron.exitCode), "voron")
  const down = fx("printer-info-disconnected.synthetic")
  assert.equal(M.parseHostname(down.stdout, down.exitCode), "")
  assert.equal(M.parseHostname("", 7), "")
  for (const g of GARBAGE) {
    assert.equal(M.parseReverse(g, 0), "")
    assert.equal(M.parseHostname(g, 0), "")
  }
})

// ---- Máquina da busca

const T0 = 1000000
const nets = () => M.parseLocalNets(fx("ip-addr.synthetic").stdout, 0)
const mdns = () => M.parseMdns(fx("avahi-moonraker.synthetic").stdout)

function kinds(requests) {
  return requests.map(r => r.kind + (r.ip ? ":" + r.ip : "")).sort()
}

test("startDiscovery asks for the networks and the announcements", () => {
  const r = M.startDiscovery(M.emptyDiscovery(), T0, 3)
  assert.equal(r.discovery.state, "running")
  assert.equal(r.discovery.seq, 1)
  assert.equal(r.discovery.startedAt, T0)
  assert.deepEqual(kinds(r.requests), ["mdns", "nets"])
  for (const q of r.requests) {
    assert.equal(q.seq, 1)
    assert.ok(q.guardMs > 0)
    assert.ok(q.args.length > 0)
  }
  assert.equal(r.requests.find(q => q.kind === "nets").guardMs, 3000)
  assert.equal(r.requests.find(q => q.kind === "mdns").guardMs, 6000)
  // A second search starts over with the next number.
  const again = M.startDiscovery(r.discovery, T0 + 1, 3)
  assert.equal(again.discovery.seq, 2)
  assert.deepEqual(again.discovery.found, [])
})

test("acceptNets asks for the check, or marks it unavailable", () => {
  const d = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const r = M.acceptNets(d, 1, nets(), true)
  assert.deepEqual(kinds(r.requests), ["scan"])
  assert.equal(r.requests[0].guardMs, 20000)
  assert.equal(r.discovery.scanUnavailable, false)
  const none = M.acceptNets(d, 1, [], true)
  assert.deepEqual(none.requests, [])
  assert.equal(none.discovery.scanUnavailable, true)
  assert.equal(M.acceptNets(d, 1, [], false).discovery.scanUnavailable, true)
  // An old search's answer changes nothing.
  const stale = M.acceptNets(d, 0, nets(), true)
  assert.equal(stale.discovery, d)
  assert.deepEqual(stale.requests, [])
})

test("acceptMdns without avahi marks it unavailable", () => {
  const d = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const r = M.acceptMdns(d, 1, [], false, printers())
  assert.equal(r.discovery.mdnsUnavailable, true)
  assert.deepEqual(r.requests, [])
})

test("acceptScan creates one Found per address and asks its name", () => {
  const d0 = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const d1 = M.acceptNets(d0, 1, nets(), true).discovery
  const r = M.acceptScan(d1, 1, ["192.168.1.100", "192.168.1.110"], printers())
  assert.deepEqual(kinds(r.requests), ["hostname:192.168.1.100", "hostname:192.168.1.110",
    "reverse:192.168.1.100", "reverse:192.168.1.110"])
  const host = r.requests.find(q => q.kind === "hostname" && q.ip === "192.168.1.110")
  assert.equal(host.args[host.args.length - 1], "http://192.168.1.110:7125/printer/info")
  assert.equal(host.guardMs, 4000)
  assert.equal(r.requests.find(q => q.kind === "reverse").guardMs, 3000)
  assert.equal(r.discovery.found.length, 2)
  assert.deepEqual(r.discovery.found[0].sources, ["scan"])
  assert.equal(r.discovery.found[0].pending, 2)
  assert.equal(r.discovery.found[0].port, 7125)
  // Before any name comes back, the address and the name are the IP.
  assert.equal(r.discovery.found[0].address, "192.168.1.100")
  assert.equal(r.discovery.found[0].name, "192.168.1.100")
})

// The whole search with the fixtures, in the order the answers usually arrive.
function fullSearch(list) {
  const p = printers(list)
  let d = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  d = M.acceptNets(d, 1, nets(), true).discovery
  d = M.acceptMdns(d, 1, mdns(), true, p).discovery
  d = M.acceptScan(d, 1, M.parseScan(fx("scan.synthetic").stdout), p).discovery
  assert.equal(d.state, "running")
  d = M.acceptReverse(d, 1, "192.168.1.110", "voron.local", p).discovery
  d = M.acceptHostname(d, 1, "192.168.1.110", "voron", p).discovery
  d = M.acceptReverse(d, 1, "192.168.1.100", "biqu.local", p).discovery
  d = M.acceptHostname(d, 1, "192.168.1.100", "biqu", p).discovery
  d = M.acceptReverse(d, 1, "192.168.1.120", "", p).discovery
  d = M.acceptHostname(d, 1, "192.168.1.120", "", p).discovery
  return d
}

test("the whole search: one Found per printer, names, addresses and Added", () => {
  const d = fullSearch()
  assert.equal(d.state, "done")
  assert.deepEqual(d.waiting, {})
  const byIp = {}
  for (const f of d.found) byIp[f.ip] = f
  assert.equal(d.found.length, 3)
  assert.deepEqual(byIp["192.168.1.110"].sources, ["mdns", "scan"])
  assert.equal(byIp["192.168.1.110"].address, "voron.local")
  assert.equal(byIp["192.168.1.110"].name, "voron")
  assert.equal(byIp["192.168.1.110"].added, true)
  assert.equal(byIp["192.168.1.100"].address, "biqu.local")
  assert.equal(byIp["192.168.1.100"].added, true)
  // Only announced, no reverse name, no hostname: the announcement's host and name.
  assert.equal(byIp["192.168.1.120"].address, "myprinter.local")
  assert.equal(byIp["192.168.1.120"].name, "My Printer")
  assert.equal(byIp["192.168.1.120"].added, false)
  // Sorted by name.
  assert.deepEqual(d.found.map(f => f.name), ["biqu", "My Printer", "voron"])
})

test("name and address fallbacks", () => {
  const p = printers([])
  let d = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  d = M.acceptNets(d, 1, nets(), true).discovery
  d = M.acceptScan(d, 1, ["192.168.1.130", "192.168.1.140"], p).discovery
  d = M.acceptReverse(d, 1, "192.168.1.130", "ender.local", p).discovery
  d = M.acceptHostname(d, 1, "192.168.1.130", "", p).discovery
  d = M.acceptReverse(d, 1, "192.168.1.140", "", p).discovery
  d = M.acceptHostname(d, 1, "192.168.1.140", "", p).discovery
  const a = d.found.find(f => f.ip === "192.168.1.130")
  const b = d.found.find(f => f.ip === "192.168.1.140")
  assert.equal(a.address, "ender.local")
  assert.equal(a.name, "ender")
  assert.equal(b.address, "192.168.1.140")
  assert.equal(b.name, "192.168.1.140")
})

test("Added matches by name on the network or by IP, ignoring case", () => {
  // Registered as voron.local, found only by the check with reverse voron.local.
  const p = printers([{ address: "VORON.local" }, { address: "192.168.1.100:7125" }])
  let d = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  d = M.acceptNets(d, 1, nets(), true).discovery
  d = M.acceptScan(d, 1, ["192.168.1.110", "192.168.1.100"], p).discovery
  d = M.acceptReverse(d, 1, "192.168.1.110", "voron.local", p).discovery
  assert.equal(d.found.find(f => f.ip === "192.168.1.110").added, true)
  // Registered by IP (with the port), found with a name.
  d = M.acceptReverse(d, 1, "192.168.1.100", "biqu.local", p).discovery
  assert.equal(d.found.find(f => f.ip === "192.168.1.100").added, true)
  assert.equal(M.isFoundAdded({ ip: "10.0.0.9", address: "x.local" }, p), false)
})

test("old answers, cancel and the 30 s guard", () => {
  const p = printers()
  const d0 = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const d1 = M.acceptScan(M.acceptNets(d0, 1, nets(), true).discovery, 1, ["192.168.1.110"], p).discovery
  // Wrong seq: same object.
  assert.equal(M.acceptScan(d1, 9, ["192.168.1.100"], p).discovery, d1)
  assert.equal(M.acceptReverse(d1, 9, "192.168.1.110", "voron.local", p).discovery, d1)
  assert.equal(M.acceptHostname(d1, 9, "192.168.1.110", "voron", p).discovery, d1)
  assert.equal(M.acceptMdns(d1, 9, mdns(), true, p).discovery, d1)
  // An address the search does not know: same object.
  assert.equal(M.acceptReverse(d1, 1, "10.9.9.9", "x.local", p).discovery, d1)

  const c = M.cancelDiscovery(d1)
  assert.equal(c.state, "idle")
  assert.deepEqual(c.found, [])
  assert.deepEqual(c.waiting, {})
  // After a cancel, the same search's answers change nothing.
  assert.equal(M.acceptReverse(c, 1, "192.168.1.110", "voron.local", p).discovery, c)
  assert.equal(M.cancelDiscovery(M.emptyDiscovery()).state, "idle")

  assert.equal(M.expireDiscovery(d1, T0 + 29999), d1)
  const e = M.expireDiscovery(d1, T0 + 30000)
  assert.equal(e.state, "done")
  assert.deepEqual(e.waiting, {})
  assert.equal(e.found.length, 1)
  assert.equal(e.found[0].pending, 0)
  assert.equal(M.expireDiscovery(e, T0 + 99999), e)

  // discoveryDone only ends a running search with nothing pending.
  assert.equal(M.discoveryDone(d1), d1)
  assert.equal(M.discoveryDone(M.emptyDiscovery()).state, "idle")
})

test("acceptDiscoveryOutput routes a process result to the right parser", () => {
  const p = printers()
  const d0 = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const ip = fx("ip-addr.synthetic")
  const r = M.acceptDiscoveryOutput(d0, "nets", 1, "", ip.stdout, ip.exitCode, true, p)
  assert.deepEqual(kinds(r.requests), ["scan"])
  const m = M.acceptDiscoveryOutput(r.discovery, "mdns", 1, "", "", -1, false, p)
  assert.equal(m.discovery.mdnsUnavailable, true)
  const scan = fx("scan.synthetic")
  const s = M.acceptDiscoveryOutput(m.discovery, "scan", 1, "", scan.stdout, scan.exitCode, true, p)
  assert.equal(s.discovery.found.length, 2)
  const v = fx("printer-info-voron")
  const h = M.acceptDiscoveryOutput(s.discovery, "hostname", 1, "192.168.1.110", v.stdout, v.exitCode, true, p)
  assert.equal(h.discovery.found.find(f => f.ip === "192.168.1.110").name, "voron")
  const unknown = M.acceptDiscoveryOutput(h.discovery, "what", 1, "", "", 0, true, p)
  assert.equal(unknown.discovery, h.discovery)
})

// ---- Conferência do endereço digitado (US2)

test("parseMoonrakerCheck", () => {
  const ok = fx("server-info-voron")
  assert.deepEqual(M.parseMoonrakerCheck(ok.stdout, ok.exitCode), { ok: true, message: "" })
  const refused = loadFixture("refused")
  assert.deepEqual(M.parseMoonrakerCheck(refused.stdout, refused.exitCode), { ok: false, message: M.TEXT.connectionRefused })
  const unauthorized = loadFixture("unauthorized")
  assert.deepEqual(M.parseMoonrakerCheck(unauthorized.stdout, unauthorized.exitCode), { ok: false, message: M.TEXT.unauthorized })
  const other = fx("server-info-not-moonraker.synthetic")
  assert.deepEqual(M.parseMoonrakerCheck(other.stdout, other.exitCode), { ok: false, message: M.TEXT.setup.notMoonraker })
  for (const g of GARBAGE) assert.equal(M.parseMoonrakerCheck(g, 0).ok, false)
})

test("the add-by-address form", () => {
  const r0 = raw()
  const f0 = M.emptyForm()
  assert.equal(f0.state, "editing")

  // Invalid or duplicate: a message, no request.
  const bad = M.submitForm(f0, r0, "a b", "", 3)
  assert.equal(bad.form.state, "editing")
  assert.equal(bad.form.message, M.TEXT.invalidAddress)
  assert.equal(bad.request, null)
  const dup = M.submitForm(f0, r0, "biqu.local", "", 3)
  assert.equal(dup.form.message, "biqu.local is already in the list")
  assert.equal(dup.request, null)

  // Valid: check /server/info.
  const c = M.submitForm(f0, r0, " 192.168.1.50 ", "Ender", 3)
  assert.equal(c.form.state, "checking")
  assert.equal(c.form.address, "192.168.1.50")
  assert.equal(c.request.kind, "check")
  assert.equal(c.request.seq, c.form.seq)
  assert.equal(c.request.args[c.request.args.length - 1], "http://192.168.1.50/server/info")
  assert.equal(c.request.guardMs, 4000)
  assert.equal(M.checkingText(c.form), "Checking 192.168.1.50…")

  // Answered with a name: save.
  const saved = M.acceptCheck(c.form, c.form.seq, { ok: true, message: "" })
  assert.equal(saved.form.state, "saving")
  assert.equal(saved.request, null)
  assert.equal(saved.form.name, "Ender")

  // No answer: the reason and Add anyway.
  const no = M.acceptCheck(c.form, c.form.seq, { ok: false, message: "connection refused" })
  assert.equal(no.form.state, "unreachable")
  assert.equal(no.form.message, "No printer answers at 192.168.1.50: connection refused")
  const anyway = M.addAnyway(no.form)
  assert.equal(anyway.state, "saving")
  assert.equal(anyway.name, "Ender")
  assert.equal(M.addAnyway(f0), f0)

  // Old answers change nothing.
  assert.equal(M.acceptCheck(c.form, c.form.seq + 1, { ok: true }).form, c.form)
  assert.equal(M.acceptCheck(f0, 0, { ok: true }).form, f0)
})

test("the form names the printer when the name is empty", () => {
  const c = M.submitForm(M.emptyForm(), [], "voron.local", "", 3)
  const named = M.acceptCheck(c.form, c.form.seq, { ok: true, message: "" })
  assert.equal(named.form.state, "naming")
  assert.equal(named.request.kind, "formHostname")
  assert.equal(named.request.args[named.request.args.length - 1], "http://voron.local/printer/info")
  assert.equal(M.acceptFormHostname(named.form, named.form.seq, "voron").name, "voron")
  assert.equal(M.acceptFormHostname(named.form, named.form.seq, "voron").state, "saving")
  // No hostname: the host of the address.
  assert.equal(M.acceptFormHostname(named.form, named.form.seq, "").name, "voron.local")
  assert.equal(M.acceptFormHostname(named.form, named.form.seq + 1, "x"), named.form)
  // Add anyway without a name: the host too.
  const no = M.acceptCheck(c.form, c.form.seq, { ok: false, message: "x" })
  assert.equal(M.addAnyway(no.form).name, "voron.local")
  const port = M.submitForm(M.emptyForm(), [], "http://10.0.0.5:7125/", "", 3)
  const portNo = M.acceptCheck(port.form, port.form.seq, { ok: false, message: "x" })
  assert.equal(M.addAnyway(portNo.form).name, "10.0.0.5")
})

test("acceptFormOutput routes the form's process results", () => {
  const c = M.submitForm(M.emptyForm(), [], "voron.local", "", 3)
  const ok = fx("server-info-voron")
  const named = M.acceptFormOutput(c.form, "check", c.form.seq, ok.stdout, ok.exitCode)
  assert.equal(named.form.state, "naming")
  const v = fx("printer-info-voron")
  const done = M.acceptFormOutput(named.form, "formHostname", named.form.seq, v.stdout, v.exitCode)
  assert.equal(done.form.state, "saving")
  assert.equal(done.form.name, "voron")
  assert.equal(M.acceptFormOutput(c.form, "what", c.form.seq, "", 0).form, c.form)
})

// ---- Painel de cadastro

test("buildSetupModel during and after a search", () => {
  const p = printers()
  const running = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  const m0 = M.buildSetupModel(p, running, M.emptyForm(), p[0].key, true, "")
  assert.equal(m0.searching, true)
  assert.equal(m0.searchLabel, "Searching… 0 found")
  assert.equal(m0.nothingFound, false)

  const done = fullSearch()
  const m = M.buildSetupModel(p, done, M.emptyForm(), p[0].key, true, "")
  assert.equal(m.searching, false)
  assert.equal(m.foundCount, 3)
  assert.equal(m.searchLabel, M.TEXT.setup.search)
  assert.deepEqual(m.results.map(r => [r.name, r.address, r.added, r.ready]), [
    ["biqu", "biqu.local", true, true], ["My Printer", "myprinter.local", false, true], ["voron", "voron.local", true, true]])
  assert.deepEqual(m.notices, [])

  // Nothing found once the search ends.
  let empty = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  empty = M.acceptNets(empty, 1, nets(), true).discovery
  empty = M.acceptMdns(empty, 1, [], false, p).discovery
  empty = M.acceptScan(empty, 1, [], p).discovery
  const n = M.buildSetupModel(p, empty, M.emptyForm(), "", true, "")
  assert.equal(n.nothingFound, true)
  assert.deepEqual(n.notices, [M.TEXT.setup.mdnsUnavailable])
  // Before any search, nothing is "not found".
  assert.equal(M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), "", true, "").nothingFound, false)
})

test("buildSetupModel recomputes Added from the current printers", () => {
  const d = fullSearch()
  const fewer = printers([raw()[0]])
  const m = M.buildSetupModel(fewer, d, M.emptyForm(), "", true, "")
  assert.equal(m.results.find(r => r.address === "biqu.local").added, false)
  assert.equal(m.results.find(r => r.address === "voron.local").added, true)
})

test("buildSetupModel: remove label, form, save failure and not editable", () => {
  const p = printers([{ name: "Voron", address: "voron.local" }, { name: "Biqu B1", address: "biqu.local" }])
  const m = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), p[1].key, true, "")
  assert.equal(m.removeLabel, "Remove Biqu B1")
  assert.equal(m.removeKey, p[1].key)
  assert.equal(m.removeName, "Biqu B1")
  assert.equal(M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), "", true, "").removeLabel, "")
  assert.equal(M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), "nope", true, "").removeLabel, "")

  const checking = M.submitForm(M.emptyForm(), [], "192.168.1.50", "", 3).form
  const mc = M.buildSetupModel(p, M.emptyDiscovery(), checking, "", true, "")
  assert.equal(mc.formText, "Checking 192.168.1.50…")
  assert.equal(mc.formBusy, true)
  assert.equal(mc.showAddAnyway, false)
  const no = M.acceptCheck(checking, checking.seq, { ok: false, message: "connection refused" }).form
  const mn = M.buildSetupModel(p, M.emptyDiscovery(), no, "", true, "")
  assert.equal(mn.showAddAnyway, true)
  assert.equal(mn.formText, "No printer answers at 192.168.1.50: connection refused")

  const failed = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), "", true, "Could not save the printers: x")
  assert.equal(failed.saveMessage, "Could not save the printers: x")

  const ne = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), p[0].key, false, "")
  assert.equal(ne.editable, false)
  assert.deepEqual(ne.notices, [M.TEXT.setup.notEditable])
})

test("setupCursorStops walks the setup screen in reading order", () => {
  const p = printers()
  const d = fullSearch()
  const m = M.buildSetupModel(p, d, M.emptyForm(), p[0].key, true, "")
  assert.deepEqual(M.setupCursorStops(m, false), ["search", "add:192.168.1.120", "address", "name", "submit", "remove", "back"])
  // The empty panel has no Back and nothing to remove.
  const e = M.buildSetupModel([], M.emptyDiscovery(), M.emptyForm(), "", true, "")
  assert.deepEqual(M.setupCursorStops(e, true), ["search", "address", "name", "submit"])
  // While searching, Search becomes Cancel.
  const running = M.startDiscovery(M.emptyDiscovery(), T0, 3).discovery
  assert.equal(M.setupCursorStops(M.buildSetupModel(p, running, M.emptyForm(), "", true, ""), false)[0], "cancelSearch")
  // Unreachable: Add anyway after Add.
  const c = M.submitForm(M.emptyForm(), [], "192.168.1.50", "", 3).form
  const no = M.acceptCheck(c, c.seq, { ok: false, message: "x" }).form
  assert.deepEqual(M.setupCursorStops(M.buildSetupModel(p, M.emptyDiscovery(), no, "", true, ""), false),
    ["search", "address", "name", "submit", "addAnyway", "back"])
  // Not editable: Back only.
  assert.deepEqual(M.setupCursorStops(M.buildSetupModel(p, d, M.emptyForm(), p[0].key, false, ""), false), ["back"])
})

test("a found printer is saved with the port it answered on", () => {
  const d = fullSearch([])
  const f = d.found.find(x => x.ip === "192.168.1.110")
  assert.equal(M.foundAddress(f), "voron.local:7125")
  const r = M.addPrinterToList([], M.foundAddress(f), f.name)
  assert.deepEqual(r.list, [{ name: "voron", address: "voron.local:7125" }])
  // Its web UI is the host without Moonraker's port.
  assert.equal(M.normalizePrinters(r.list)[0].webUrl, "http://voron.local")
})

// ---- Remover (US3)

test("remove confirmation texts", () => {
  assert.equal(M.confirmMessage("removePrinter", "Biqu B1"), "Remove Biqu B1 from the list? You can add it again later.")
  assert.equal(M.confirmLabel("removePrinter"), "Remove")
})

// ---- Nunca lança

test("every new function tolerates garbage", () => {
  const fns = ["rawPrinters", "addPrinterToList", "removePrinterFromList", "buildSaveArgs", "parseSaveResult",
    "parseLocalNets", "parseMdns", "buildScanArgs", "parseScan", "buildReverseArgs", "parseReverse",
    "buildHostnameArgs", "parseHostname", "parseMoonrakerCheck", "startDiscovery", "acceptNets", "acceptMdns",
    "acceptScan", "acceptReverse", "acceptHostname", "cancelDiscovery", "expireDiscovery", "discoveryDone",
    "acceptDiscoveryOutput", "isFoundAdded", "foundAddress", "submitForm", "acceptCheck", "acceptFormHostname",
    "addAnyway", "acceptFormOutput", "checkingText", "buildSetupModel", "setupCursorStops"]
  for (const name of fns) {
    assert.equal(typeof M[name], "function", name)
    for (const a of GARBAGE) for (const b of GARBAGE) {
      assert.doesNotThrow(() => M[name](a, b, a, b, a, b, a, b), name)
    }
  }
})

test("formAfterSave clears the form or keeps the text with the reason", () => {
  const c = M.submitForm(M.emptyForm(), [], "192.168.1.50", "Ender", 3).form
  const saving = M.acceptCheck(c, c.seq, { ok: true }).form
  assert.deepEqual(M.formAfterSave(saving, true), M.emptyForm())
  const failed = M.formAfterSave(saving, false, "could not find widget")
  assert.equal(failed.state, "editing")
  assert.equal(failed.address, "192.168.1.50")
  assert.equal(failed.message, "could not find widget")
  assert.equal(M.formAfterSave(c, true), c)
})

test("panelStops: main screen ends with Printers…, setup screen has its own", () => {
  const p = printers()
  const panel = M.buildPanelModel(p, {}, p[0].key, T0, {}, "")
  const setup = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), p[0].key, true, "")
  const main = M.panelStops(panel, setup, false)
  assert.deepEqual(main, M.cursorStops(panel).concat(["openSetup"]))
  assert.deepEqual(M.panelStops(panel, setup, true), M.setupCursorStops(setup, false))
  const emptyPanel = M.buildPanelModel([], {}, "", T0)
  const emptySetup = M.buildSetupModel([], M.emptyDiscovery(), M.emptyForm(), "", true, "")
  assert.deepEqual(M.panelStops(emptyPanel, emptySetup, false), ["search", "address", "name", "submit"])
  for (const g of GARBAGE) assert.doesNotThrow(() => M.panelStops(g, g, g))
})
