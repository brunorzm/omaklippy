// Pure logic for OmaKlippy: settings, Moonraker request/response handling,
// status derivation and the view models for the bar icon and the panel.
// No Quickshell objects, no clock, no I/O — QML passes `now` in and runs the
// processes; Node runs the same file under `node --test`. Every function
// tolerates malformed input and never throws.

// nf-md-printer_3d from the bar's Nerd Font.
var PRINTER_GLYPH = "\u{f042b}"

// Every text the user sees, in one place.
var TEXT = {
  states: { printing: "printing", paused: "paused", idle: "idle", error: "error", offline: "offline" },
  invalidAddress: "invalid address",
  hostNotFound: "host not found",
  connectionRefused: "connection refused",
  noResponseTimeout: "no response (timeout)",
  noResponse: "no response",
  networkError: "network error (curl %1)",
  curlNotFound: "curl not found",
  unauthorized: "unauthorized — allow this computer in trusted_clients",
  unexpectedResponse: "unexpected response",
  klipperState: "Klipper: %1",
  unknown: "unknown",
  printError: "print error",
  waitingFirstResponse: "waiting for first response",
  noPrinters: "no printers configured",
  noPrintersTooltip: "OmaKlippy — no printers configured",
  updatedAgo: "updated %1 ago",
  noResponseFor: "no response for %1",
  setupPrinterName: "My printer",
  panel: {
    addPrinterWith: "Add a printer with:",
    file: "File",
    remaining: "Remaining",
    nozzle: "Nozzle",
    bed: "Bed",
    printer: "Printer"
  },
  actions: { pause: "Pause", resume: "Resume", cancel: "Cancel", emergencyStop: "Emergency stop" },
  confirm: {
    back: "Back",
    cancelPrint: "Cancel print",
    stop: "Stop",
    cancelMessage: "Cancel the print \"%1\" on %2?",
    cancelMessageNoFile: "Cancel the current print on %1?",
    emergencyMessage: "Emergency stop %1? Klipper will shut down until a firmware restart."
  },
  actionFailed: "%1 failed: %2",
  commandTimeout: "no response (timeout) — check the printer before trying again"
}

// %1 and %2 are replaced in one pass, so a value that itself contains "%2"
// (a file name, say) is never substituted again.
function fill(template, a, b) {
  var values = [a, b]
  return String(template).replace(/%([12])/g, function(match, n) {
    var v = values[Number(n) - 1]
    return v === undefined ? match : String(v)
  })
}

var DEFAULT_INTERVAL_SEC = 5
var DEFAULT_TIMEOUT_SEC = 3

// Printer actions: Moonraker endpoint, whether the panel asks first, and the
// slot a running command takes. The emergency stop has a slot of its own so
// it stays available while a slow pause/resume/cancel macro runs.
var ACTIONS = {
  pause: { path: "/printer/print/pause", confirm: false, slot: "busy" },
  resume: { path: "/printer/print/resume", confirm: false, slot: "busy" },
  cancel: { path: "/printer/print/cancel", confirm: true, slot: "busy" },
  emergencyStop: { path: "/printer/emergency_stop", confirm: true, slot: "estop" }
}

// Nerd Font glyphs from the bar's icon font.
var ACTION_GLYPHS = {
  pause: "\u{f03e4}",          // nf-md-pause
  resume: "\u{f040a}",         // nf-md-play
  cancel: "\u{f04db}",         // nf-md-stop
  emergencyStop: "\u{f0028}",  // nf-md-alert_octagon
  busy: "\u{f0772}"            // nf-md-loading
}

// Macros behind pause/resume/cancel can park, wait for moves and reheat, so
// commands get far more time than a status query (whose maximum is 30 s).
var COMMAND_TIMEOUT_SEC = 60

var QUERY_PATH = "/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status" +
  "&extruder=temperature,target&heater_bed=temperature,target"

// ---- Helpers

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function finiteOrNull(value) {
  return typeof value === "number" && isFinite(value) ? value : null
}

function stringOr(value, fallback) {
  return typeof value === "string" ? value : fallback
}

function clampInt(value, min, max, fallback) {
  var n = typeof value === "number" ? value : (typeof value === "string" && value.trim() !== "" ? Number(value) : NaN)
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function copy(obj) {
  var out = {}
  for (var k in obj) out[k] = obj[k]
  return out
}

// ---- Settings

// The printers list arrives in more than one shape: QML hands shell.json
// arrays over as array-like sequences (Array.isArray is false), `omarchy bar
// set` without --json stores a JSON string, and with --json a one-item list
// is flattened into the bare object by the IPC argument parser.
function toList(value, parseString) {
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    if (!parseString) return []
    var parsed = null
    try { parsed = JSON.parse(value) } catch (e) { return [] }
    return toList(parsed, false)
  }
  if (value !== null && typeof value === "object") {
    if (typeof value.length === "number") return Array.prototype.slice.call(value)
    if (typeof value.address === "string") return [value]
  }
  return []
}

function readSettings(settings) {
  var s = settings !== null && typeof settings === "object" ? settings : {}
  return {
    printers: normalizePrinters(toList(s.printers, true)),
    intervalMs: clampInt(s.refreshIntervalSec, 2, 3600, DEFAULT_INTERVAL_SEC) * 1000,
    timeoutMs: clampInt(s.timeoutSec, 1, 30, DEFAULT_TIMEOUT_SEC) * 1000
  }
}

// Accepts host, host:port and http(s)://host[:port][/path]; returns the base
// URL without a trailing slash, or "" when the address cannot be used.
function normalizeAddress(text) {
  if (typeof text !== "string") return ""
  var t = text.trim()
  if (t === "" || /\s/.test(t)) return ""
  var scheme = "http"
  var m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/.exec(t)
  if (m) {
    scheme = m[1].toLowerCase()
    if (scheme !== "http" && scheme !== "https") return ""
    t = m[2]
  }
  var slash = t.indexOf("/")
  var hostPort = slash < 0 ? t : t.slice(0, slash)
  var path = slash < 0 ? "" : t.slice(slash).replace(/\/+$/, "")
  var hp = /^([A-Za-z0-9._-]+)(?::(\d+))?$/.exec(hostPort)
  if (!hp) return ""
  if (hp[2] !== undefined) {
    var port = Number(hp[2])
    if (port < 1 || port > 65535) return ""
  }
  return scheme + "://" + hostPort + path
}

function hostOf(baseUrl) {
  var m = /^https?:\/\/([^/]+)/.exec(baseUrl || "")
  return m ? m[1] : ""
}

function normalizePrinters(list) {
  list = toList(list, false)
  var out = []
  for (var i = 0; i < list.length; i++) {
    var item = list[i]
    if (item === null || typeof item !== "object" || typeof item.address !== "string") continue
    var order = out.length
    var baseUrl = normalizeAddress(item.address)
    var name = stringOr(item.name, "").trim()
    out.push({
      key: baseUrl + "#" + order,
      order: order,
      name: name,
      address: item.address,
      baseUrl: baseUrl,
      invalidReason: baseUrl === "" ? TEXT.invalidAddress : "",
      displayName: name !== "" ? name : (baseUrl !== "" ? hostOf(baseUrl) : item.address.trim())
    })
  }
  return disambiguateNames(out)
}

// Printers sharing a name (ignoring case and surrounding spaces) show their
// host[:port] too, so the panel can tell them apart.
function disambiguateNames(printers) {
  var list = toList(printers, false)
  var counts = {}
  for (var i = 0; i < list.length; i++) {
    var n = stringOr(list[i] && list[i].name, "").trim().toLowerCase()
    if (n !== "") counts[n] = (counts[n] || 0) + 1
  }
  var out = []
  for (var j = 0; j < list.length; j++) {
    var p = list[j]
    if (p === null || typeof p !== "object") continue
    var key = stringOr(p.name, "").trim().toLowerCase()
    if (key !== "" && counts[key] > 1) {
      var q = copy(p)
      var where = p.baseUrl ? hostOf(p.baseUrl) : stringOr(p.address, "").trim()
      q.displayName = p.name.trim() + " (" + where + ")"
      out.push(q)
    } else {
      out.push(p)
    }
  }
  return out
}

// ---- Request

function buildQueryUrl(baseUrl) {
  return baseUrl + QUERY_PATH
}

function buildCurlArgs(url, timeoutSec) {
  var t = String(timeoutSec)
  return ["curl", "-sS", "--connect-timeout", t, "--max-time", t,
    "-H", "Accept: application/json", "-w", "\n%{http_code}", url]
}

function isAction(action) {
  return typeof action === "string" && ACTIONS.hasOwnProperty(action)
}

function buildActionArgs(baseUrl, action, connectTimeoutSec) {
  if (typeof baseUrl !== "string" || baseUrl === "" || !isAction(action)) return []
  var c = Math.max(1, Math.ceil(finiteOrNull(connectTimeoutSec) || DEFAULT_TIMEOUT_SEC))
  return ["curl", "-sS", "-X", "POST", "--connect-timeout", String(c), "--max-time", String(COMMAND_TIMEOUT_SEC),
    "-H", "Accept: application/json", "-w", "\n%{http_code}", baseUrl + ACTIONS[action].path]
}

// ---- Response

function emptyReading() {
  return {
    reachable: true,
    httpStatus: 0,
    errorMessage: "",
    klippyState: "",
    klippyMessage: "",
    printState: "",
    printMessage: "",
    progress: null,
    printDuration: null,
    filename: "",
    nozzle: null,
    bed: null
  }
}

function heater(obj) {
  if (!isObject(obj)) return null
  var current = finiteOrNull(obj.temperature)
  var target = finiteOrNull(obj.target)
  if (current === null) return null
  return { current: current, target: target === null ? 0 : target }
}

var CURL_OFFLINE_MESSAGES = {
  3: TEXT.invalidAddress,
  6: TEXT.hostNotFound,
  7: TEXT.connectionRefused,
  28: TEXT.noResponseTimeout
}

// stdout is the raw curl output: body, "\n", then the %{http_code} line.
// The curl exit code is checked first (the code line reads 000 without a
// response), then the HTTP status. Shared by status queries and actions;
// errorMessage is empty only for a usable 1xx–3xx answer.
function readTransport(stdout, exitCode) {
  var exit = typeof exitCode === "number" ? exitCode : -1
  var t = { reachable: true, httpStatus: 0, errorMessage: "", data: null }

  if (exit === -1 || exit === 127) {
    t.errorMessage = TEXT.curlNotFound
    return t
  }
  if (exit !== 0) {
    t.reachable = false
    t.errorMessage = CURL_OFFLINE_MESSAGES[exit] || fill(TEXT.networkError, exit)
    return t
  }

  var text = typeof stdout === "string" ? stdout : ""
  var cut = text.lastIndexOf("\n")
  var body = cut < 0 ? "" : text.slice(0, cut)
  var code = Number(cut < 0 ? text.trim() : text.slice(cut + 1).trim())
  t.httpStatus = isFinite(code) ? code : 0

  try { t.data = JSON.parse(body) } catch (e) { t.data = null }

  if (t.httpStatus === 401 || t.httpStatus === 403) {
    t.errorMessage = TEXT.unauthorized
  } else if (t.httpStatus >= 400 || t.httpStatus === 0) {
    var message = isObject(t.data) && isObject(t.data.error) ? stringOr(t.data.error.message, "") : ""
    t.errorMessage = message || ("HTTP " + t.httpStatus)
  }
  return t
}

function parseResponse(stdout, exitCode) {
  var r = emptyReading()
  var t = readTransport(stdout, exitCode)
  r.reachable = t.reachable
  r.httpStatus = t.httpStatus
  if (t.errorMessage) {
    r.errorMessage = t.errorMessage
    return r
  }
  var data = t.data
  if (!(isObject(data) && isObject(data.result) && isObject(data.result.status))) {
    r.errorMessage = TEXT.unexpectedResponse
    return r
  }

  var st = data.result.status
  var wh = isObject(st.webhooks) ? st.webhooks : {}
  var ps = isObject(st.print_stats) ? st.print_stats : {}
  var sd = isObject(st.virtual_sdcard) ? st.virtual_sdcard : {}
  var ds = isObject(st.display_status) ? st.display_status : {}
  r.klippyState = stringOr(wh.state, "")
  r.klippyMessage = stringOr(wh.state_message, "")
  r.printState = stringOr(ps.state, "")
  r.printMessage = stringOr(ps.message, "")
  r.filename = stringOr(ps.filename, "")
  r.printDuration = finiteOrNull(ps.print_duration)
  r.progress = finiteOrNull(sd.progress)
  if (r.progress === null) r.progress = finiteOrNull(ds.progress)
  r.nozzle = heater(st.extruder)
  r.bed = heater(st.heater_bed)
  return r
}

// Any 2xx is success: the body is not checked, the next status query shows
// what really happened. A timeout may still mean the printer is running the
// command, so it gets a message of its own and is never retried.
function parseActionResponse(stdout, exitCode) {
  if (exitCode === 28) return { ok: false, message: TEXT.commandTimeout }
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage) return { ok: false, message: tidyMessage(t.errorMessage) }
  if (t.httpStatus >= 200 && t.httpStatus < 300) return { ok: true, message: "" }
  return { ok: false, message: "HTTP " + t.httpStatus }
}

function deriveState(reading) {
  var r = isObject(reading) ? reading : {}
  if (r.reachable === false) return { state: "offline", reason: stringOr(r.errorMessage, "") }
  if (r.errorMessage) return { state: "error", reason: r.errorMessage }
  if (r.klippyState !== "ready") {
    return { state: "error", reason: r.klippyMessage || fill(TEXT.klipperState, r.klippyState || TEXT.unknown) }
  }
  if (r.printState === "printing") return { state: "printing", reason: "" }
  if (r.printState === "paused") return { state: "paused", reason: "" }
  if (r.printState === "error") return { state: "error", reason: r.printMessage || TEXT.printError }
  return { state: "idle", reason: "" }
}

function hasJob(state) {
  return state === "printing" || state === "paused"
}

function computePercent(state, progress) {
  if (!hasJob(state) || finiteOrNull(progress) === null) return null
  return Math.min(99, Math.floor(Math.min(1, Math.max(0, progress)) * 100))
}

function estimateRemaining(state, progress, printDuration) {
  if (!hasJob(state)) return null
  var p = finiteOrNull(progress)
  var d = finiteOrNull(printDuration)
  if (p === null || d === null || p < 0.01 || d <= 0) return null
  return Math.max(0, d / p - d)
}

function stateLabel(state) {
  return TEXT.states.hasOwnProperty(state) ? TEXT.states[state] : TEXT.states.offline
}

// ---- Status

function initialStatus(key) {
  return {
    key: key,
    state: "offline",
    reason: TEXT.waitingFirstResponse,
    percent: null,
    remainingSec: null,
    filename: "",
    nozzle: null,
    bed: null,
    lastSeenAt: null,
    offlineSince: null,
    pending: false,
    seq: 0,
    followUp: false
  }
}

function applyReading(prev, reading, now) {
  var base = isObject(prev) ? copy(prev) : initialStatus("")
  var r = isObject(reading) ? reading : { reachable: false, errorMessage: TEXT.noResponse }
  var d = deriveState(r)
  base.state = d.state
  base.reason = d.reason
  if (d.state === "offline") {
    base.percent = null
    base.remainingSec = null
    base.filename = ""
    base.nozzle = null
    base.bed = null
    base.offlineSince = base.state === "offline" && isObject(prev) && prev.state === "offline" && prev.offlineSince !== null && prev.offlineSince !== undefined
      ? prev.offlineSince : now
    return base
  }
  base.percent = computePercent(d.state, r.progress)
  base.remainingSec = estimateRemaining(d.state, r.progress, r.printDuration)
  base.filename = stringOr(r.filename, "")
  base.nozzle = r.nozzle || null
  base.bed = r.bed || null
  base.offlineSince = null
  if (r.httpStatus > 0) base.lastSeenAt = now
  return base
}

// ---- Polling engine: every state decision the widget makes about its
//      requests lives here, the QML only runs what these return.

function reconcileStatuses(statuses, printers) {
  var prev = isObject(statuses) ? statuses : {}
  var list = Array.isArray(printers) ? printers : []
  var next = {}
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (prev[p.key]) {
      next[p.key] = prev[p.key]
    } else {
      var s = initialStatus(p.key)
      if (p.invalidReason) s.reason = p.invalidReason
      next[p.key] = s
    }
  }
  return next
}

// onlyKey (optional) limits the dispatch to one printer: the fresh query
// right after a printer command.
function planDispatch(statuses, printers, timeoutMs, onlyKey) {
  var next = copy(isObject(statuses) ? statuses : {})
  var only = typeof onlyKey === "string" && onlyKey !== "" ? onlyKey : ""
  var list = Array.isArray(printers) ? printers : []
  var timeoutSec = Math.max(1, Math.ceil((finiteOrNull(timeoutMs) || DEFAULT_TIMEOUT_SEC * 1000) / 1000))
  var requests = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    var s = next[p.key]
    if (!isObject(p) || (only !== "" && p.key !== only)) continue
    if (!s || p.invalidReason || s.pending) continue
    var updated = copy(s)
    updated.seq = (s.seq || 0) + 1
    updated.pending = true
    updated.followUp = false
    next[p.key] = updated
    requests.push({ key: p.key, seq: updated.seq, args: buildCurlArgs(buildQueryUrl(p.baseUrl), timeoutSec) })
  }
  return { statuses: next, requests: requests }
}

// A printer command just finished: its effect must show without waiting for
// the next cycle. With a query already in flight (it may have read the state
// from before the command), mark the printer so the widget asks again as
// soon as that query returns; otherwise the caller dispatches right away.
function requestFollowUp(statuses, key) {
  if (!isObject(statuses)) return statuses
  var s = statuses[key]
  if (!isObject(s) || s.pending !== true || s.followUp === true) return statuses
  var next = copy(statuses)
  var marked = copy(s)
  marked.followUp = true
  next[key] = marked
  return next
}

function acceptResult(statuses, key, seq, reading, now) {
  if (!isObject(statuses)) return statuses
  var s = statuses[key]
  if (!s || s.pending !== true || s.seq !== seq) return statuses
  var next = copy(statuses)
  var applied = applyReading(s, reading, now)
  applied.pending = false
  next[key] = applied
  return next
}

// ---- Printer commands: what may be sent now and what a result changes.
//      commands is { [printerKey]: PrinterCommands }, replaced, never mutated.

var ACTIONS_BY_STATE = {
  printing: ["pause", "cancel", "emergencyStop"],
  paused: ["resume", "cancel", "emergencyStop"],
  idle: ["emergencyStop"]
}

function availableActions(state) {
  return typeof state === "string" && ACTIONS_BY_STATE.hasOwnProperty(state) ? ACTIONS_BY_STATE[state].slice() : []
}

function emptyCommands() {
  return { busy: null, estop: null, failure: null, seq: 0 }
}

function commandsFor(commands, key) {
  var c = isObject(commands) ? commands[key] : null
  return isObject(c) ? c : emptyCommands()
}

// Returns { commands, request }; request is null (and commands the same
// object) whenever the action may not be sent right now.
function planCommand(commands, printer, status, action, timeoutMs, now) {
  var refused = { commands: commands, request: null }
  if (!isObject(printer) || typeof printer.key !== "string" || printer.invalidReason || !printer.baseUrl) return refused
  if (!isAction(action)) return refused
  var state = isObject(status) ? status.state : ""
  if (availableActions(state).indexOf(action) < 0) return refused
  var cur = commandsFor(commands, printer.key)
  var slot = ACTIONS[action].slot
  if (cur.estop) return refused
  if (slot === "busy" && cur.busy) return refused

  var entry = copy(cur)
  entry.seq = (finiteOrNull(cur.seq) || 0) + 1
  entry[slot] = { action: action, seq: entry.seq, startedAt: finiteOrNull(now) || 0 }
  entry.failure = null
  var next = copy(isObject(commands) ? commands : {})
  next[printer.key] = entry
  var connectSec = Math.max(1, Math.ceil((finiteOrNull(timeoutMs) || DEFAULT_TIMEOUT_SEC * 1000) / 1000))
  return {
    commands: next,
    request: {
      key: printer.key,
      seq: entry.seq,
      action: action,
      args: buildActionArgs(printer.baseUrl, action, connectSec),
      guardMs: (COMMAND_TIMEOUT_SEC + 1) * 1000
    }
  }
}

function acceptCommandResult(commands, key, seq, result) {
  if (!isObject(commands) || !isObject(commands[key])) return commands
  var cur = commands[key]
  var slot = ""
  if (isObject(cur.busy) && cur.busy.seq === seq) slot = "busy"
  else if (isObject(cur.estop) && cur.estop.seq === seq) slot = "estop"
  if (slot === "") return commands
  var action = cur[slot].action
  var entry = copy(cur)
  entry[slot] = null
  if (isObject(result) && result.ok === true) {
    entry.failure = null
  } else {
    var reason = isObject(result) ? stringOr(result.message, "") : ""
    entry.failure = { action: action, message: fill(TEXT.actionFailed, TEXT.actions[action] || action, reason || TEXT.noResponse) }
  }
  var next = copy(commands)
  next[key] = entry
  return next
}

// Switching printers in the panel drops every shown failure (the one a
// running command may still produce lands on its own printer later).
function clearFailures(commands) {
  if (!isObject(commands)) return commands
  var next = null
  for (var k in commands) {
    if (isObject(commands[k]) && commands[k].failure) {
      if (!next) next = copy(commands)
      var entry = copy(commands[k])
      entry.failure = null
      next[k] = entry
    }
  }
  return next || commands
}

function reconcileCommands(commands, printers) {
  if (!isObject(commands)) return commands
  var list = Array.isArray(printers) ? printers : []
  var keep = {}
  for (var i = 0; i < list.length; i++) if (isObject(list[i])) keep[list[i].key] = true
  var next = {}
  var removed = false
  for (var k in commands) {
    if (keep[k]) next[k] = commands[k]
    else removed = true
  }
  return removed ? next : commands
}

// ---- View models

var STATE_PRIORITY = { error: 0, printing: 1, paused: 2, offline: 3, idle: 4 }

function statusFor(printer, statusesByKey) {
  var s = isObject(statusesByKey) ? statusesByKey[printer.key] : null
  if (printer.invalidReason) {
    var invalid = s ? copy(s) : initialStatus(printer.key)
    invalid.state = "offline"
    invalid.reason = printer.invalidReason
    return invalid
  }
  return s || initialStatus(printer.key)
}

// The printer the bar icon stands for: most urgent state, then the first
// registered. Returns { printer, status } or null.
function pickHighlighted(printers, statusesByKey) {
  var list = Array.isArray(printers) ? printers : []
  var best = null
  for (var i = 0; i < list.length; i++) {
    var status = statusFor(list[i], statusesByKey)
    var rank = STATE_PRIORITY[status.state]
    if (rank === undefined) rank = STATE_PRIORITY.offline
    if (best === null || rank < best.rank) best = { printer: list[i], status: status, rank: rank }
  }
  return best ? { printer: best.printer, status: best.status } : null
}

function summaryLine(printer, status) {
  var line = printer.displayName + " — " + stateLabel(status.state)
  if (hasJob(status.state) && status.percent !== null && status.percent !== undefined) line += " " + status.percent + "%"
  return line
}

// The icon stands for the printer picked in the panel during this session,
// or, without a (still valid) pick, for the most relevant one.
function buildIconState(printers, statusesByKey, selectedKey) {
  var list = Array.isArray(printers) ? printers : []
  var top = null
  if (typeof selectedKey === "string" && selectedKey !== "") {
    for (var i = 0; i < list.length; i++) {
      if (list[i].key === selectedKey) top = { printer: list[i], status: statusFor(list[i], statusesByKey) }
    }
  }
  if (!top) top = pickHighlighted(list, statusesByKey)
  if (!top) return { mode: "empty", progress: null, tooltip: TEXT.noPrintersTooltip }
  var st = top.status
  var progress = hasJob(st.state) && finiteOrNull(st.percent) !== null ? st.percent / 100 : null
  return { mode: st.state, progress: progress, tooltip: summaryLine(top.printer, st) }
}

// The command the empty panel suggests. printers goes without --json: the
// IPC argument parser behind `omarchy bar set` splits JSON lists.
function setupCommand() {
  return "omarchy bar set io.github.brunorzm.omaklippy printers " +
    "'[{\"name\":\"" + TEXT.setupPrinterName + "\",\"address\":\"192.168.1.50\"}]'"
}

// ---- Formatting

function formatTemp(t) {
  if (!isObject(t) || finiteOrNull(t.current) === null) return "—"
  var current = Math.round(t.current)
  var target = finiteOrNull(t.target)
  return target !== null && target > 0 ? current + "/" + Math.round(target) + " °C" : current + " °C"
}

function formatDuration(sec) {
  var s = finiteOrNull(sec)
  if (s === null || s < 0) return "—"
  if (s < 60) return "<1m"
  var minutes = Math.floor(s / 60)
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  if (h === 0) return m + "m"
  return h + "h " + (m < 10 ? "0" : "") + m + "m"
}

function formatElapsed(ms) {
  var t = finiteOrNull(ms)
  if (t === null || t < 60000) return "<1 min"
  if (t < 3600000) return Math.floor(t / 60000) + " min"
  return Math.floor(t / 3600000) + " h"
}

// Klipper hard-wraps its messages: keep blank-line paragraphs, join the
// lines inside each one and collapse runs of spaces.
function tidyMessage(text) {
  if (typeof text !== "string") return ""
  var paragraphs = text.split(/\n\s*\n/)
  var out = []
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].replace(/\s+/g, " ").trim()
    if (p !== "") out.push(p)
  }
  return out.join("\n\n")
}

// ---- Panel

function resolveSelection(selectedKey, printers, statusesByKey) {
  var list = Array.isArray(printers) ? printers : []
  if (typeof selectedKey === "string" && selectedKey !== "") {
    for (var i = 0; i < list.length; i++) if (list[i].key === selectedKey) return selectedKey
  }
  var top = pickHighlighted(list, statusesByKey)
  return top ? top.printer.key : ""
}

function detailFor(printer, status, now) {
  var job = hasJob(status.state)
  var meta = stateLabel(status.state)
  if (job && status.percent !== null && status.percent !== undefined) meta += " · " + status.percent + "%"
  var freshness = ""
  if (status.state === "offline") {
    if (finiteOrNull(status.offlineSince) !== null) freshness = fill(TEXT.noResponseFor, formatElapsed(now - status.offlineSince))
  } else if (finiteOrNull(status.lastSeenAt) !== null) {
    freshness = fill(TEXT.updatedAgo, formatElapsed(now - status.lastSeenAt))
  }
  return {
    key: printer.key,
    displayName: printer.displayName,
    state: status.state,
    stateLabel: stateLabel(status.state),
    metaText: meta,
    reason: tidyMessage(status.reason),
    percent: job ? status.percent : null,
    filename: job ? (status.filename || "") : "",
    remainingText: job ? formatDuration(status.remainingSec) : "",
    nozzleText: formatTemp(status.nozzle),
    bedText: formatTemp(status.bed),
    showTemps: status.state !== "offline" && (!!status.nozzle || !!status.bed),
    freshnessText: freshness
  }
}

// The action buttons for one printer. enabled is exactly "planCommand would
// send it now"; failureText shows even when no button does (a printer that
// went offline after the failure).
function buildActionsModel(printer, status, printerCommands) {
  var model = { buttons: [], primary: [], emergency: null, failureText: "", filename: "" }
  if (!isObject(printer) || !isObject(status)) return model
  var pc = isObject(printerCommands) ? printerCommands : emptyCommands()
  var wrapped = {}
  wrapped[printer.key] = pc
  var ids = availableActions(status.state)
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i]
    var running = (isObject(pc.busy) && pc.busy.action === id) || (isObject(pc.estop) && pc.estop.action === id)
    var button = {
      id: id,
      label: TEXT.actions[id],
      glyph: ACTION_GLYPHS[id],
      confirm: ACTIONS[id].confirm,
      urgent: id === "emergencyStop",
      busy: running,
      enabled: planCommand(wrapped, printer, status, id, DEFAULT_TIMEOUT_SEC * 1000, 0).request !== null
    }
    model.buttons.push(button)
    if (id === "emergencyStop") model.emergency = button
    else model.primary.push(button)
  }
  model.failureText = isObject(pc.failure) ? stringOr(pc.failure.message, "") : ""
  model.filename = stringOr(status.filename, "")
  return model
}

// Confirmation texts; "" means the action asks nothing (the panel then
// refuses to open a confirmation for it).
function confirmMessage(action, displayName, filename) {
  var name = stringOr(displayName, "")
  var file = stringOr(filename, "")
  if (action === "cancel")
    return file !== "" ? fill(TEXT.confirm.cancelMessage, file, name) : fill(TEXT.confirm.cancelMessageNoFile, name)
  if (action === "emergencyStop") return fill(TEXT.confirm.emergencyMessage, name)
  return ""
}

function confirmLabel(action) {
  if (action === "cancel") return TEXT.confirm.cancelPrint
  if (action === "emergencyStop") return TEXT.confirm.stop
  return ""
}

// Keyboard stops of the panel, in reading order: the printer dropdown, then
// every button that can be pressed right now.
function cursorStops(panelModel) {
  var stops = []
  if (!isObject(panelModel)) return stops
  if (Array.isArray(panelModel.options) && panelModel.options.length > 0) stops.push("printer")
  var a = isObject(panelModel.actions) ? panelModel.actions : {}
  var primary = Array.isArray(a.primary) ? a.primary : []
  for (var i = 0; i < primary.length; i++) if (primary[i].enabled) stops.push(primary[i].id)
  if (isObject(a.emergency) && a.emergency.enabled) stops.push(a.emergency.id)
  return stops
}

function stepCursor(stops, current, delta) {
  var list = Array.isArray(stops) ? stops : []
  if (list.length === 0) return ""
  var at = list.indexOf(current)
  if (at < 0) return list[0]
  var step = finiteOrNull(delta) || 0
  return list[Math.max(0, Math.min(list.length - 1, at + (step > 0 ? 1 : step < 0 ? -1 : 0)))]
}

function buildPanelModel(printers, statusesByKey, selectedKey, now, commandsByKey) {
  var list = Array.isArray(printers) ? printers : []
  if (list.length === 0) {
    return { empty: true, selected: null, showJob: false, rows: [], options: [], actions: buildActionsModel(null, null, null) }
  }
  var key = resolveSelection(selectedKey, list, statusesByKey)
  var printer = list[0]
  for (var i = 0; i < list.length; i++) if (list[i].key === key) printer = list[i]
  var selectedStatus = statusFor(printer, statusesByKey)
  var selected = detailFor(printer, selectedStatus, finiteOrNull(now) || 0)
  var rows = []
  if (list.length > 1) {
    for (var j = 0; j < list.length; j++) {
      var st = statusFor(list[j], statusesByKey)
      rows.push({
        key: list[j].key,
        displayName: list[j].displayName,
        state: st.state,
        stateLabel: stateLabel(st.state),
        percentText: hasJob(st.state) && finiteOrNull(st.percent) !== null ? st.percent + "%" : "",
        optionLabel: summaryLine(list[j], st),
        selected: list[j].key === key
      })
    }
  }
  // The printer dropdown takes { value, label } items.
  var options = []
  for (var k = 0; k < rows.length; k++) options.push({ value: rows[k].key, label: rows[k].optionLabel })
  var commands = isObject(commandsByKey) ? commandsByKey[printer.key] : null
  return { empty: false, selected: selected, showJob: hasJob(selected.state), rows: rows, options: options,
    actions: buildActionsModel(printer, selectedStatus, commands) }
}

if (typeof module !== "undefined") {
  module.exports = {
    PRINTER_GLYPH: PRINTER_GLYPH,
    TEXT: TEXT,
    ACTIONS: ACTIONS,
    ACTION_GLYPHS: ACTION_GLYPHS,
    COMMAND_TIMEOUT_SEC: COMMAND_TIMEOUT_SEC,
    fill: fill,
    readSettings: readSettings,
    normalizeAddress: normalizeAddress,
    normalizePrinters: normalizePrinters,
    disambiguateNames: disambiguateNames,
    buildQueryUrl: buildQueryUrl,
    buildCurlArgs: buildCurlArgs,
    parseResponse: parseResponse,
    deriveState: deriveState,
    computePercent: computePercent,
    estimateRemaining: estimateRemaining,
    stateLabel: stateLabel,
    initialStatus: initialStatus,
    applyReading: applyReading,
    reconcileStatuses: reconcileStatuses,
    planDispatch: planDispatch,
    acceptResult: acceptResult,
    pickHighlighted: pickHighlighted,
    buildIconState: buildIconState,
    formatTemp: formatTemp,
    formatDuration: formatDuration,
    formatElapsed: formatElapsed,
    resolveSelection: resolveSelection,
    buildPanelModel: buildPanelModel,
    setupCommand: setupCommand,
    tidyMessage: tidyMessage,
    availableActions: availableActions,
    buildActionArgs: buildActionArgs,
    parseActionResponse: parseActionResponse,
    emptyCommands: emptyCommands,
    planCommand: planCommand,
    acceptCommandResult: acceptCommandResult,
    reconcileCommands: reconcileCommands,
    clearFailures: clearFailures,
    requestFollowUp: requestFollowUp,
    buildActionsModel: buildActionsModel,
    confirmMessage: confirmMessage,
    confirmLabel: confirmLabel,
    cursorStops: cursorStops,
    stepCursor: stepCursor
  }
}
