const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel, loadFixture } = require("./helpers")
const M = loadModel()

// An example key only: never a real printer's.
const KEY = "0123456789abcdef0123456789abcdef"
const OTHER = "ffffffffffffffffffffffffffffffff"

function printers() {
  return M.normalizePrinters([{ name: "Lab", address: "lab.local", apiKey: KEY }, { name: "Voron", address: "voron.local" }])
}

// Fails if the key shows up anywhere inside value (texts, lists, objects).
function noKeyIn(value, label) {
  const seen = JSON.stringify(value === undefined ? null : value)
  assert.equal(seen.indexOf(KEY), -1, (label || "value") + " carries the key")
}

function fx(name) {
  const f = loadFixture(name)
  return f.message !== undefined ? f.message : f
}

const GARBAGE = [undefined, null, 5, "", "{", "[]", {}, [], [null], { result: 5 }]

// ---- Configuração, pedidos e respostas (base)

test("normalizeApiKey", () => {
  assert.deepEqual(M.normalizeApiKey("  " + KEY + "  "), { key: KEY, valid: true })
  assert.deepEqual(M.normalizeApiKey(""), { key: "", valid: true })
  assert.deepEqual(M.normalizeApiKey(undefined), { key: "", valid: true })
  assert.equal(M.normalizeApiKey("a b").valid, false)
  assert.equal(M.normalizeApiKey("chavé").valid, false)
  assert.equal(M.normalizeApiKey("x".repeat(257)).valid, false)
  assert.equal(M.normalizeApiKey("x".repeat(256)).valid, true)
  assert.equal(M.normalizeApiKey(5).valid, false)
})

test("normalizePrinters reads the key and hides it behind a hint", () => {
  const [lab, voron] = printers()
  assert.equal(lab.apiKey, KEY)
  assert.equal(lab.apiKeyHint, "…cdef")
  assert.equal(lab.invalidReason, "")
  assert.equal(voron.apiKey, "")
  assert.equal(voron.apiKeyHint, "")
  const bad = M.normalizePrinters([{ address: "lab.local", apiKey: "a b" }])[0]
  assert.equal(bad.invalidReason, M.TEXT.invalidApiKey)
  assert.equal(bad.apiKey, "")
  // The text form of the list (slice 001) too.
  const text = M.readSettings({ printers: JSON.stringify([{ address: "lab.local", apiKey: " " + KEY }]) }).printers[0]
  assert.equal(text.apiKey, KEY)
})

test("keyedRequest passes the key on stdin, never in the arguments", () => {
  const args = M.buildCurlArgs("http://lab.local/printer/info", 3)
  const r = M.keyedRequest(args, KEY)
  assert.equal(r.stdin, "X-Api-Key: " + KEY + "\n")
  assert.deepEqual(r.args.slice(0, -1).slice(-2), ["-H", "@-"])
  assert.equal(r.args[r.args.length - 1], "http://lab.local/printer/info")
  assert.equal(r.args.length, args.length + 2)
  noKeyIn(r.args, "args")
  const none = M.keyedRequest(args, "")
  assert.deepEqual(none, { args: args, stdin: "" })
  assert.deepEqual(M.keyedRequest(args, "a b"), { args: args, stdin: "" })
  assert.deepEqual(M.keyedRequest(null, KEY), { args: [], stdin: "" })
})

test("a refusal says what to do, and tells a rejected key apart", () => {
  const u = loadFixture("unauthorized")
  assert.equal(M.TEXT.unauthorized, "unauthorized — allow this computer in trusted_clients or set an API key")
  assert.equal(M.parseResponse(u.stdout, u.exitCode).errorMessage, M.TEXT.unauthorized)
  assert.equal(M.parseResponse(u.stdout, u.exitCode, true).errorMessage, "API key rejected")
  assert.equal(M.parseActionResponse(u.stdout, u.exitCode).message, M.TEXT.unauthorized)
  assert.equal(M.parseActionResponse(u.stdout, u.exitCode, true).message, "API key rejected")
  const s = loadFixture("server-info-unauthorized.synthetic")
  assert.deepEqual(M.parseMoonrakerCheck(s.stdout, s.exitCode), { ok: false, message: M.TEXT.unauthorized, needsKey: true })
  assert.deepEqual(M.parseMoonrakerCheck(s.stdout, s.exitCode, true), { ok: false, message: "API key rejected" })
  const ok = loadFixture("server-info-voron")
  assert.deepEqual(M.parseMoonrakerCheck(ok.stdout, ok.exitCode, true), { ok: true, message: "" })
})

test("the base functions tolerate garbage", () => {
  for (const name of ["normalizeApiKey", "keyedRequest", "parseResponse", "parseActionResponse", "parseMoonrakerCheck"]) {
    for (const a of GARBAGE) for (const b of GARBAGE) assert.doesNotThrow(() => M[name](a, b, a), name)
  }
})


// ---- US1: a chave em todos os pedidos

const LAB = "http://lab.local#0"
const VORON = "http://voron.local#1"

function printingStatuses(p) {
  const f = loadFixture("printing")
  return { [LAB]: M.applyReading(M.initialStatus(LAB), M.parseResponse(f.stdout, f.exitCode), 1000),
    [VORON]: M.applyReading(M.initialStatus(VORON), M.parseResponse(f.stdout, f.exitCode), 1000) }
}

test("every request to a printer with a key carries it on stdin only", () => {
  const p = printers()
  const st = printingStatuses(p)
  const d = M.planDispatch(M.reconcileStatuses({}, p), p, 3000)
  const est = M.planEstimate(st, p, 3000)
  const down = {}
  for (const k of [LAB, VORON]) down[k] = Object.assign({}, st[k], { state: "error", klippyDownSince: 1 })
  const svc = M.planServiceInfo(down, p, 3000)
  const cmd = M.planCommand({}, p[0], st[LAB], "pause", 3000, 2000)
  const groups = { dispatch: d.requests, estimate: est.requests, service: svc.requests, command: [cmd.request] }
  for (const name in groups) {
    const lab = groups[name].find(r => r.key === LAB)
    assert.ok(lab, name)
    assert.equal(lab.stdin, "X-Api-Key: " + KEY + "\n", name)
    assert.ok(lab.args.includes("@-"), name)
    noKeyIn(lab.args, name + " args")
    const voron = groups[name].find(r => r.key === VORON)
    if (voron) {
      assert.equal(voron.stdin, undefined, name + ": no stdin field without a key")
      assert.ok(!voron.args.includes("@-"), name)
    }
  }
  // The web UI never gets the key.
  noKeyIn(M.planOpenWeb({}, p[0], 0).request, "web launch")
})

// ---- US1: a chave na conexão contínua

test("buildIdentifyMessage", () => {
  const m = JSON.parse(M.buildIdentifyMessage(1, KEY, "0.11.0"))
  assert.equal(m.method, "server.connection.identify")
  assert.equal(m.id, 1)
  assert.equal(m.params.client_name, "OmaKlippy")
  assert.equal(m.params.version, "0.11.0")
  assert.equal(m.params.type, "other")
  assert.equal(m.params.api_key, KEY)
  assert.equal(typeof m.params.url, "string")
})

function opened(p) {
  let lives = M.reconcileLives({}, p, 1000)
  lives = M.liveTick(lives, 1000).lives
  return M.liveOpened(lives, LAB, 1000)
}

test("with a key, the connection identifies before subscribing", () => {
  const p = printers()
  const lives = M.reconcileLives({}, p, 1000)
  assert.equal(lives[LAB].apiKey, KEY)
  assert.equal(lives[VORON].apiKey, undefined, "no key fields without a key (010 shape)")
  // Another key: a new connection.
  const changed = M.normalizePrinters([{ name: "Lab", address: "lab.local", apiKey: OTHER }, { name: "Voron", address: "voron.local" }])
  assert.equal(M.reconcileLives(lives, changed, 1000)[LAB].apiKey, OTHER)
  assert.notEqual(M.reconcileLives(lives, changed, 1000)[LAB], lives[LAB])
  const o = opened(p)
  assert.equal(o.actions.length, 1)
  const sent = JSON.parse(o.actions[0].text)
  assert.equal(sent.method, "server.connection.identify")
  assert.equal(sent.id, o.lives[LAB].identifyId)
  // Without a key: the 010 subscription right away.
  let v = M.liveTick(M.reconcileLives({}, p, 1000), 1000).lives
  const ov = M.liveOpened(v, VORON, 1000)
  assert.equal(JSON.parse(ov.actions[0].text).method, "printer.objects.subscribe")
  // Identify answered: subscribe.
  const okMsg = M.parseLiveMessage(fx("ws-identify-ok.synthetic").replace('"id":1', '"id":' + o.lives[LAB].identifyId))
  const ok = M.liveMessage(o.lives, LAB, okMsg, 1100)
  assert.equal(ok.actions.length, 1)
  assert.equal(JSON.parse(ok.actions[0].text).method, "printer.objects.subscribe")
  assert.equal(JSON.parse(ok.actions[0].text).id, ok.lives[LAB].subscribeId)
  assert.equal(ok.lives[LAB].identifyId, 0)
})

test("a rejected key leaves the printer on polling", () => {
  const o = opened(printers())
  const err = M.parseLiveMessage(fx("ws-identify-error.synthetic").replace('"id":1', '"id":' + o.lives[LAB].identifyId))
  const r = M.liveMessage(o.lives, LAB, err, 1100)
  assert.equal(r.lives[LAB].keyRejected, true)
  assert.deepEqual(r.actions, [])
  assert.equal(r.entered, false)
  assert.equal(r.lives[LAB].state, "open")
  // Klipper coming back does not subscribe with a rejected key.
  const ready = M.liveMessage(r.lives, LAB, M.parseLiveMessage('{"jsonrpc":"2.0","method":"notify_klippy_ready"}'), 1200)
  assert.deepEqual(ready.actions, [])
})

// ---- US2: nada que o plugin mostra traz a chave

test("panel, icon, actions, confirmations and notifications never carry the key", () => {
  const p = printers()
  const st = printingStatuses(p)
  const u = loadFixture("unauthorized")
  const refused = { [LAB]: M.applyReading(M.initialStatus(LAB), M.parseResponse(u.stdout, u.exitCode, true), 1000) }
  noKeyIn(M.buildPanelModel(p, st, LAB, 2000, {}, ""), "panel model")
  noKeyIn(M.buildPanelModel(p, refused, LAB, 2000, {}, ""), "refused panel model")
  assert.equal(M.buildPanelModel(p, refused, LAB, 2000, {}, "").selected.reason, "API key rejected")
  noKeyIn(M.detailFor(p[0], st[LAB], 2000), "detail")
  noKeyIn(M.buildActionsModel(p[0], st[LAB], null, 2000), "actions")
  noKeyIn(M.buildIconState(p, st, LAB), "icon")
  noKeyIn(M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), LAB, true, ""), "setup model")
  noKeyIn(M.confirmMessage("cancel", p[0].displayName, "x.gcode"), "confirmation")
  noKeyIn(M.buildNotification({ type: "complete", filename: "x.gcode" }, p[0].displayName), "notification")
  noKeyIn(M.tooltipLine(p[0], st[LAB]), "tooltip")
})

// ---- US3: gravação, formulários, busca e tela de cadastro

function raw() {
  return [{ name: "Voron", address: "voron.local", webUrl: "http://voron.local:81", foo: 1 }, { name: "Lab", address: "lab.local" }]
}

test("addPrinterToList and setPrinterApiKey keep everything else", () => {
  const add = M.addPrinterToList(raw(), "new.local", "New", " " + KEY)
  assert.deepEqual(add.list[2], { name: "New", address: "new.local", apiKey: KEY })
  assert.equal(M.addPrinterToList(raw(), "new.local", "", "a b").error, M.TEXT.invalidApiKey)
  assert.deepEqual(M.addPrinterToList(raw(), "new.local", "", "").list[2], { address: "new.local" })
  const set = M.setPrinterApiKey(raw(), 1, KEY)
  assert.equal(set.error, "")
  assert.deepEqual(set.list, [raw()[0], { name: "Lab", address: "lab.local", apiKey: KEY }])
  const cleared = M.setPrinterApiKey(set.list, 1, "")
  assert.deepEqual(cleared.list, raw())
  const bad = M.setPrinterApiKey(raw(), 1, "a b")
  assert.equal(bad.error, M.TEXT.invalidApiKey)
  assert.equal(bad.list, null)
  // Past invalid items, like removePrinterFromList.
  const junk = [raw()[0], { address: 5 }, raw()[1]]
  assert.deepEqual(M.setPrinterApiKey(junk, 1, KEY).list[2].apiKey, KEY)
  assert.deepEqual(M.setPrinterApiKey(junk, 1, KEY).list[1], { address: 5 })
  // The source is never touched.
  const src = raw(); M.setPrinterApiKey(src, 0, KEY); assert.deepEqual(src, raw())
})

test("the add-by-address form asks for the key when refused", () => {
  const c = M.submitForm(M.emptyForm(), raw(), "keyed.local", "Keyed", 3)
  assert.equal(c.request.stdin, undefined)
  const s = loadFixture("server-info-unauthorized.synthetic")
  const nk = M.acceptFormOutput(c.form, "check", c.form.seq, s.stdout, s.exitCode)
  assert.equal(nk.form.state, "needsKey")
  assert.equal(nk.form.message, "keyed.local needs an API key")
  assert.equal(M.checkingText(nk.form), "keyed.local needs an API key")
  // Check again, with the key: the check carries it.
  const again = M.submitForm(nk.form, raw(), "keyed.local", "Keyed", 3, KEY)
  assert.equal(again.form.state, "checking")
  assert.equal(again.request.stdin, "X-Api-Key: " + KEY + "\n")
  noKeyIn(again.request.args, "check args")
  noKeyIn(M.checkingText(again.form), "checking text")
  // A wrong key: rejected, the same Add anyway as an unreachable printer.
  const rej = M.acceptFormOutput(again.form, "check", again.form.seq, s.stdout, s.exitCode)
  assert.equal(rej.form.state, "unreachable")
  assert.equal(rej.form.message, "No printer answers at keyed.local: API key rejected")
  // The right key: saved with it (name given, so no hostname query).
  const ok = loadFixture("server-info-voron")
  const done = M.acceptFormOutput(again.form, "check", again.form.seq, ok.stdout, ok.exitCode)
  assert.equal(done.form.state, "saving")
  assert.equal(done.form.apiKey, KEY)
  // Without a name, the hostname query carries the key too.
  const unnamed = M.submitForm(M.emptyForm(), raw(), "keyed.local", "", 3, KEY)
  const naming = M.acceptFormOutput(unnamed.form, "check", unnamed.form.seq, ok.stdout, ok.exitCode)
  assert.equal(naming.request.stdin, "X-Api-Key: " + KEY + "\n")
  // Add anyway works from needsKey too.
  assert.equal(M.addAnyway(nk.form).state, "saving")
  assert.equal(M.submitForm(M.emptyForm(), raw(), "keyed.local", "", 3, "a b").form.message, M.TEXT.invalidApiKey)
})

test("the network check reports Moonrakers that need a key", () => {
  const out = "http://192.168.1.5:7125/server/info 401\nhttp://192.168.1.6:7125/server/info 200\nhttp://192.168.1.7:7125/server/info 000\n"
  assert.deepEqual(M.parseScan(out), ["192.168.1.6"])
  assert.deepEqual(M.parseScanNeedsKey(out), ["192.168.1.5"])
  let d = M.startDiscovery(M.emptyDiscovery(), 1000, 3).discovery
  d = M.acceptNets(d, 1, [{ iface: "eth0", prefix: "192.168.1.", self: "192.168.1.2" }], true).discovery
  d = M.acceptDiscoveryOutput(d, "scan", 1, "", out, 7, true, []).discovery
  const found = {}
  for (const f of d.found) found[f.ip] = f
  assert.equal(found["192.168.1.5"].needsKey, true)
  assert.equal(found["192.168.1.6"].needsKey, undefined)
  const m = M.buildSetupModel([], d, M.emptyForm(), "", true, "")
  assert.equal(m.results.find(r => r.ip === "192.168.1.5").needsKey, true)
  assert.equal(m.results.find(r => r.ip === "192.168.1.6").needsKey, false)
})

test("setup model and keyboard stops for the API key", () => {
  const p = printers()
  const m = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), LAB, true, "")
  assert.equal(m.hasKey, true)
  assert.equal(m.apiKeyHint, "…cdef")
  noKeyIn(m, "setup model")
  assert.deepEqual(M.setupCursorStops(m, false), ["search", "address", "name", "submit", "remove", "setKey", "removeKey", "back"])
  const editing = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), LAB, true, "", true)
  assert.deepEqual(M.setupCursorStops(editing, false), ["search", "address", "name", "submit", "remove", "setKey", "removeKey", "keyField", "saveKey", "back"])
  const noKey = M.buildSetupModel(p, M.emptyDiscovery(), M.emptyForm(), VORON, true, "")
  assert.equal(noKey.hasKey, false)
  assert.equal(noKey.apiKeyHint, "")
  assert.deepEqual(M.setupCursorStops(noKey, false), ["search", "address", "name", "submit", "remove", "setKey", "back"])
  // The form waiting for a key.
  const c = M.submitForm(M.emptyForm(), raw(), "keyed.local", "", 3)
  const s = loadFixture("server-info-unauthorized.synthetic")
  const nk = M.acceptFormOutput(c.form, "check", c.form.seq, s.stdout, s.exitCode).form
  const f = M.buildSetupModel(p, M.emptyDiscovery(), nk, "", true, "")
  assert.equal(f.formNeedsKey, true)
  assert.equal(f.showAddAnyway, true)
  assert.deepEqual(M.setupCursorStops(f, false), ["search", "address", "name", "submit", "formKey", "checkAgain", "addAnyway", "back"])
  assert.equal(M.confirmMessage("removeApiKey", "Lab"), "Remove the API key of Lab? It will need this computer in trusted_clients.")
  assert.equal(M.confirmLabel("removeApiKey"), "Remove")
})

test("the US3 functions tolerate garbage", () => {
  for (const name of ["setPrinterApiKey", "parseScanNeedsKey", "addPrinterToList", "submitForm", "acceptFormOutput", "buildSetupModel", "setupCursorStops"]) {
    for (const a of GARBAGE) for (const b of GARBAGE) assert.doesNotThrow(() => M[name](a, b, a, b, a, b, a), name)
  }
})

// ---- Correção pós-submissão: a gravação não passa por linha de comando

test("buildSaveEntry keeps every other setting and replaces only the printers", () => {
  const settings = { id: "io.github.brunorzm.omaklippy", refreshIntervalSec: 10, timeoutSec: 4, notifyPaused: "Off",
    printers: [{ name: "Lab", address: "lab.local" }] }
  const list = [{ name: "Lab", address: "lab.local", apiKey: KEY }]
  const entry = M.buildSaveEntry(settings, list)
  assert.deepEqual(entry, { refreshIntervalSec: 10, timeoutSec: 4, notifyPaused: "Off", printers: list })
  assert.equal("id" in entry, false)
  assert.equal(Array.isArray(entry), false)
  // A plain copy: changing it never touches the settings or the list.
  entry.printers[0].name = "x"
  assert.equal(list[0].name, "Lab")
  // Text printers (slice 001) are saved back as a list.
  assert.deepEqual(M.buildSaveEntry({ printers: JSON.stringify([{ address: "a.local" }]) }, [{ address: "a.local" }]).printers, [{ address: "a.local" }])
  for (const g of GARBAGE) assert.doesNotThrow(() => M.buildSaveEntry(g, g))
})

test("entryChanged tells a real change from a no-op save", () => {
  const settings = { refreshIntervalSec: 10, printers: [{ name: "Lab", address: "lab.local" }] }
  assert.equal(M.entryChanged(settings, M.buildSaveEntry(settings, settings.printers)), false)
  assert.equal(M.entryChanged(settings, M.buildSaveEntry(settings, [{ name: "Lab", address: "lab.local", apiKey: KEY }])), true)
  // The text form becomes a list: that is a change worth saving.
  const text = { printers: JSON.stringify([{ address: "a.local" }]) }
  assert.equal(M.entryChanged(text, M.buildSaveEntry(text, [{ address: "a.local" }])), true)
  for (const g of GARBAGE) assert.doesNotThrow(() => M.entryChanged(g, g))
})

test("no save path builds a command line any more", () => {
  assert.equal(M.buildSaveArgs, undefined)
  assert.equal(M.parseSaveResult, undefined)
  // Every argv the model can build for a printer with a key stays clean.
  const p = printers()
  const st = printingStatuses(p)
  const argvs = [
    ...M.planDispatch(M.reconcileStatuses({}, p), p, 3000).requests.map(r => r.args),
    ...M.planEstimate(st, p, 3000).requests.map(r => r.args),
    M.planCommand({}, p[0], st[LAB], "pause", 3000, 2000).request.args,
    M.planOpenWeb({}, p[0], 0).request.args,
    M.buildNotification({ type: "complete", filename: "x.gcode" }, p[0].displayName).args
  ]
  for (const a of argvs) noKeyIn(a, "argv " + a[0])
})
