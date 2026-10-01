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
  panel: {
    file: "File",
    remaining: "Remaining",
    nozzle: "Nozzle",
    bed: "Bed",
    printer: "Printer",
    ends: "Ends",
    layer: "Layer"
  },
  finish: {
    tomorrow: "tomorrow %1",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  },
  actions: { pause: "Pause", resume: "Resume", cancel: "Cancel", emergencyStop: "Emergency stop", openWebUi: "Open web UI", firmwareRestart: "Restart firmware",
    klipperRestart: "Restart Klipper" },
  confirm: {
    back: "Back",
    cancelPrint: "Cancel print",
    stop: "Stop",
    cancelMessage: "Cancel the print \"%1\" on %2?",
    cancelMessageNoFile: "Cancel the current print on %1?",
    emergencyMessage: "Emergency stop %1? Klipper will shut down until a firmware restart.",
    restart: "Restart",
    restartMessage: "Restart the firmware on %1? Klipper and the printer's boards will restart.",
    klipperMessage: "Restart the Klipper service on %1? It will start again on the printer's computer.",
    remove: "Remove",
    removeMessage: "Remove %1 from the list? You can add it again later."
  },
  setup: {
    printers: "Printers…",
    title: "Printers",
    search: "Search network",
    searching: "Searching… %1 found",
    cancel: "Cancel",
    back: "Back",
    add: "Add",
    added: "Added",
    nothingFound: "No printers found on the network.",
    addByAddress: "Add by address",
    address: "Address",
    name: "Name (optional)",
    addressHint: "voron.local or 192.168.1.50",
    checking: "Checking %1…",
    addAnyway: "Add anyway",
    alreadyAdded: "%1 is already in the list",
    noMoonraker: "No printer answers at %1: %2",
    notMoonraker: "not a Moonraker answer",
    remove: "Remove %1",
    mdnsUnavailable: "Network announcements unavailable (avahi not found): searched by address only.",
    scanUnavailable: "Could not read the local networks (ip not found): searched by announcements only.",
    notEditable: "OmaKlippy is on this bar more than once: edit the printers in shell.json.",
    saveFailed: "Could not save the printers: %1",
    shellNotFound: "omarchy-shell not found",
    shellNoAnswer: "no answer from the shell"
  },
  actionFailed: "%1 failed: %2",
  left: "%1 left",
  plusWarmUp: "%1 + warm-up",
  warmingUp: "warming up",
  commandTimeout: "no response (timeout) — check the printer before trying again",
  launcherNotFound: "omarchy-launch-browser not found",
  launcherExitCode: "browser launcher exited with code %1",
  launcherTimeout: "no answer from the browser launcher",
  notify: {
    completeTitle: "Print complete",
    failedTitle: "Print failed",
    pausedTitle: "Print paused",
    lostTitle: "Printer not responding",
    withFile: "%1 — %2",
    failedBody: "%1: %2",
    lostBody: "%1 stopped answering during a print",
    fileSuffix: " (%1)",
    unavailable: "Notifications unavailable: %1",
    notFound: "notify-send not found",
    serviceUnavailable: "notification service unavailable (exit %1)",
    timeout: "no answer from notify-send"
  }
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
  emergencyStop: { path: "/printer/emergency_stop", confirm: true, slot: "estop" },
  firmwareRestart: { path: "/printer/firmware_restart", confirm: true, slot: "busy" },
  klipperRestart: { path: "/machine/services/restart", confirm: true, slot: "busy" }
}

// The Klipper service's name when the printer does not tell (Moonraker's
// default for a single install).
var DEFAULT_KLIPPER_SERVICE = "klipper"

// Nerd Font glyphs from the bar's icon font.
var ACTION_GLYPHS = {
  pause: "\u{f03e4}",          // nf-md-pause
  resume: "\u{f040a}",         // nf-md-play
  cancel: "\u{f04db}",         // nf-md-stop
  emergencyStop: "\u{f0028}",  // nf-md-alert_octagon
  busy: "\u{f0772}",           // nf-md-loading
  openWebUi: "\u{f03cc}",      // nf-md-open_in_new
  firmwareRestart: "\u{f0709}", // nf-md-restart
  klipperRestart: "\u{f0450}",  // nf-md-reload
  openSetup: "\u{f0493}",       // nf-md-cog
  search: "\u{f0349}",          // nf-md-magnify
  cancelSearch: "\u{f0156}",    // nf-md-close
  add: "\u{f0415}",             // nf-md-plus
  remove: "\u{f01b4}",          // nf-md-delete
  back: "\u{f004d}"             // nf-md-arrow_left
}

// Macros behind pause/resume/cancel can park, wait for moves and reheat, so
// commands get far more time than a status query (whose maximum is 30 s).
var COMMAND_TIMEOUT_SEC = 60

// Moonraker answers 503 while Klipper is not connected to it. A firmware
// restart passes through that for a couple of seconds (2 s on the Voron), so
// the Klipper service restart is offered only once it lasts this long.
var KLIPPY_DOWN_OFFER_MS = 15000

// Opening the web UI: the launcher answers in well under a second (research
// R1); a hung one is given up on after this long.
var WEB_LAUNCH_TIMEOUT_SEC = 10
// Moonraker's own port; the web UI (Mainsail/Fluidd) sits on the host's
// default port instead.
var MOONRAKER_DEFAULT_PORT = 7125

// Notifications: a printing printer that misses this many answers in a row
// is reported as not responding; notify-send gets this long to exit.
var NOTIFY_LOST_AFTER = 3
var NOTIFY_TIMEOUT_SEC = 10
var NOTIFY_APP_NAME = "OmaKlippy"
var NOTIFY_ICON = "printer"

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

// Notification switches are "On"/"Off" enums in the schema (there is no
// boolean type); a hand-edited false works too. Anything else means on.
function switchOn(value) {
  if (value === false) return false
  return !(typeof value === "string" && value.trim().toLowerCase() === "off")
}

function readSettings(settings) {
  var s = settings !== null && typeof settings === "object" ? settings : {}
  return {
    notify: {
      complete: switchOn(s.notifyComplete),
      failed: switchOn(s.notifyFailed),
      paused: switchOn(s.notifyPaused),
      lostContact: switchOn(s.notifyLostContact)
    },
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

// The web UI of a printer whose Moonraker address is baseUrl: the same URL,
// minus Moonraker's default port.
function deriveWebUrl(baseUrl) {
  if (typeof baseUrl !== "string" || baseUrl === "") return ""
  var m = /^(https?:\/\/[^/:]+):(\d+)(\/.*)?$/.exec(baseUrl)
  if (m && Number(m[2]) === MOONRAKER_DEFAULT_PORT) return m[1] + (m[3] || "")
  return baseUrl
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
    // An informed web address wins as typed (even on port 7125); an invalid
    // one only hides the button. Without it, the web UI is derived.
    var webText = stringOr(item.webUrl, "").trim()
    out.push({
      key: baseUrl + "#" + order,
      order: order,
      name: name,
      address: item.address,
      baseUrl: baseUrl,
      webUrl: webText !== "" ? normalizeAddress(webText) : deriveWebUrl(baseUrl),
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

// ---- Slicer estimate: GET /server/files/metadata once per print.

function buildMetadataArgs(baseUrl, filename, timeoutSec) {
  if (typeof baseUrl !== "string" || baseUrl === "" || typeof filename !== "string" || filename === "") return []
  return buildCurlArgs(baseUrl + "/server/files/metadata?filename=" + encodeURIComponent(filename), timeoutSec)
}

// The slicer's total print time in seconds, or null when the file has no
// metadata, the printer did not answer or the answer makes no sense.
function parseMetadataResponse(stdout, exitCode) {
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage || t.httpStatus < 200 || t.httpStatus >= 300) return null
  var res = isObject(t.data) && isObject(t.data.result) ? t.data.result : null
  var sec = res ? finiteOrNull(res.estimated_time) : null
  return sec !== null && sec > 0 ? sec : null
}

// The file's layer count from the same metadata answer, or null.
function parseMetadataLayers(stdout, exitCode) {
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage || t.httpStatus < 200 || t.httpStatus >= 300) return null
  var res = isObject(t.data) && isObject(t.data.result) ? t.data.result : null
  return res ? layerNumber(res.layer_count, 1) : null
}

// Returns { statuses, requests }: one metadata fetch for each printer with a
// print whose file has no estimate yet (a failed fetch counts: no retry
// within the same print).
function planEstimate(statuses, printers, timeoutMs) {
  var list = Array.isArray(printers) ? printers : []
  var src = isObject(statuses) ? statuses : {}
  var timeoutSec = Math.max(1, Math.ceil((finiteOrNull(timeoutMs) || DEFAULT_TIMEOUT_SEC * 1000) / 1000))
  var next = null
  var requests = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!isObject(p) || p.invalidReason || !p.baseUrl) continue
    var st = src[p.key]
    if (!isObject(st) || !hasJob(st.state)) continue
    var file = stringOr(st.filename, "")
    if (file === "" || (isObject(st.estimate) && st.estimate.filename === file)) continue
    var seq = (isObject(st.estimate) ? finiteOrNull(st.estimate.seq) || 0 : 0) + 1
    if (!next) next = copy(src)
    var updated = copy(st)
    updated.estimate = { filename: file, seconds: null, layerCount: null, pending: true, seq: seq }
    next[p.key] = updated
    requests.push({ key: p.key, seq: seq, filename: file, args: buildMetadataArgs(p.baseUrl, file, timeoutSec) })
  }
  return { statuses: next || statuses, requests: requests }
}

function acceptEstimate(statuses, key, seq, filename, seconds, layerCount) {
  if (!isObject(statuses) || !isObject(statuses[key])) return statuses
  var e = statuses[key].estimate
  if (!isObject(e) || e.pending !== true || e.seq !== seq || e.filename !== filename) return statuses
  var next = copy(statuses)
  var st = copy(statuses[key])
  var sec = finiteOrNull(seconds)
  st.estimate = { filename: e.filename, seconds: sec !== null && sec > 0 ? sec : null,
    layerCount: layerNumber(layerCount, 1), pending: false, seq: e.seq }
  next[key] = st
  return next
}

function isAction(action) {
  return typeof action === "string" && ACTIONS.hasOwnProperty(action)
}

// service is only read by klipperRestart: the systemd unit to restart, sent
// as a query argument (Moonraker reads those on POST too).
function buildActionArgs(baseUrl, action, connectTimeoutSec, service) {
  if (typeof baseUrl !== "string" || baseUrl === "" || !isAction(action)) return []
  var c = Math.max(1, Math.ceil(finiteOrNull(connectTimeoutSec) || DEFAULT_TIMEOUT_SEC))
  var url = baseUrl + ACTIONS[action].path
  if (action === "klipperRestart")
    url += "?service=" + encodeURIComponent(stringOr(service, "") || DEFAULT_KLIPPER_SERVICE)
  return ["curl", "-sS", "-X", "POST", "--connect-timeout", String(c), "--max-time", String(COMMAND_TIMEOUT_SEC),
    "-H", "Accept: application/json", "-w", "\n%{http_code}", url]
}

// ---- Klipper service name: GET /machine/system_info once per disconnection.

function buildServiceInfoArgs(baseUrl, timeoutSec) {
  if (typeof baseUrl !== "string" || baseUrl === "") return []
  return buildCurlArgs(baseUrl + "/machine/system_info", timeoutSec)
}

// instance_ids.klipper (klipper-1 and so on when several instances are
// installed), or null when the printer did not tell.
function parseServiceInfo(stdout, exitCode) {
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage || t.httpStatus < 200 || t.httpStatus >= 300) return null
  var res = isObject(t.data) && isObject(t.data.result) ? t.data.result : null
  var info = res && isObject(res.system_info) ? res.system_info : null
  var ids = info && isObject(info.instance_ids) ? info.instance_ids : null
  return ids ? stringOr(ids.klipper, "") || null : null
}

// Returns { statuses, requests }: one lookup for each printer whose Klipper is
// disconnected and whose service name is not known or being asked yet.
function planServiceInfo(statuses, printers, timeoutMs) {
  var list = Array.isArray(printers) ? printers : []
  var src = isObject(statuses) ? statuses : {}
  var timeoutSec = Math.max(1, Math.ceil((finiteOrNull(timeoutMs) || DEFAULT_TIMEOUT_SEC * 1000) / 1000))
  var next = null
  var requests = []
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!isObject(p) || p.invalidReason || !p.baseUrl) continue
    var st = src[p.key]
    if (!isObject(st) || finiteOrNull(st.klippyDownSince) === null || st.klipperService) continue
    if (!next) next = copy(src)
    var updated = copy(st)
    updated.klipperService = { name: null, pending: true, seq: 1 }
    next[p.key] = updated
    requests.push({ key: p.key, seq: 1, args: buildServiceInfoArgs(p.baseUrl, timeoutSec) })
  }
  return { statuses: next || statuses, requests: requests }
}

function acceptServiceInfo(statuses, key, seq, name) {
  if (!isObject(statuses) || !isObject(statuses[key])) return statuses
  var svc = statuses[key].klipperService
  if (!isObject(svc) || svc.pending !== true || svc.seq !== seq) return statuses
  var next = copy(statuses)
  var st = copy(statuses[key])
  st.klipperService = { name: stringOr(name, "") || null, pending: false, seq: seq }
  next[key] = st
  return next
}

// ---- Response

// A whole layer number no smaller than min, or null.
function layerNumber(value, min) {
  var n = finiteOrNull(value)
  return n !== null && n === Math.floor(n) && n >= min ? n : null
}

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
    displayMessage: "",
    currentLayer: null,
    totalLayer: null,
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
  r.displayMessage = stringOr(ds.message, "").trim()
  // Only when the slicer writes SET_PRINT_STATS_INFO; the Voron leaves it empty.
  var info = isObject(ps.info) ? ps.info : {}
  r.currentLayer = layerNumber(info.current_layer, 0)
  r.totalLayer = layerNumber(info.total_layer, 1)
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

// "12/62" from the printer's current layer over its total, or the file's;
// nothing when the printer does not report the current layer.
function layerTextOf(status) {
  var current = layerNumber(status.currentLayer, 0)
  if (current === null) return ""
  var total = layerNumber(status.totalLayer, 1)
  if (total === null && isObject(status.estimate)) total = layerNumber(status.estimate.layerCount, 1)
  return total === null ? "" : Math.min(current, total) + "/" + total
}

// A print that has not extruded anything yet (heat-soak, homing, leveling):
// Klipper only starts print_duration at the first extrusion. The slicer's
// time does not include this phase and its length is unknown, so no clock
// time can be promised yet.
function isWarmingUp(status) {
  return isObject(status) && hasJob(status.state) && finiteOrNull(status.printDuration) === 0
}

// The remaining time the panel (and the tooltip) show for a status.
function remainingOf(status) {
  if (!isObject(status)) return null
  return blendRemaining(status.remainingSec, isObject(status.estimate) ? status.estimate.seconds : null,
    status.printDuration, status.progress)
}

// Remaining time from the slicer's estimate and the progress-based one: the
// slicer alone at first, the progress more and more as the print advances.
// Once the print outlasts the slicer, only the progress counts; nothing
// usable → null ("—"), never zero.
function blendRemaining(progressRemaining, slicerTotal, printDuration, progress) {
  var P = finiteOrNull(progressRemaining)
  var E = finiteOrNull(slicerTotal)
  var R = P
  if (E !== null && E > 0) {
    var S = E - Math.max(0, finiteOrNull(printDuration) || 0)
    if (S > 0) {
      var w = Math.min(1, Math.max(0, finiteOrNull(progress) || 0))
      R = P === null ? S : (1 - w) * S + w * P
    }
  }
  return R !== null && R > 0 ? R : null
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
    followUp: false,
    printState: "",
    requestedAt: null,
    klippyState: "",
    message: "",
    progress: null,
    printDuration: null,
    estimate: null,
    currentLayer: null,
    totalLayer: null,
    klippyDownSince: null,
    klipperService: null
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
    base.estimate = null
    base.printState = ""
    base.klippyState = ""
    base.message = ""
    base.progress = null
    base.printDuration = null
    base.currentLayer = null
    base.totalLayer = null
    base.klippyDownSince = null
    forgetFailedService(base)
    base.offlineSince = base.state === "offline" && isObject(prev) && prev.state === "offline" && prev.offlineSince !== null && prev.offlineSince !== undefined
      ? prev.offlineSince : now
    return base
  }
  base.percent = computePercent(d.state, r.progress)
  base.remainingSec = estimateRemaining(d.state, r.progress, r.printDuration)
  base.filename = stringOr(r.filename, "")
  base.nozzle = r.nozzle || null
  base.bed = r.bed || null
  base.printState = stringOr(r.printState, "")
  base.klippyState = stringOr(r.klippyState, "")
  base.message = stringOr(r.displayMessage, "")
  base.progress = hasJob(d.state) ? finiteOrNull(r.progress) : null
  base.printDuration = finiteOrNull(r.printDuration)
  base.currentLayer = layerNumber(r.currentLayer, 0)
  base.totalLayer = layerNumber(r.totalLayer, 1)
  // The slicer's estimate belongs to this print: gone once it ends or the
  // file changes, so the next print fetches it again.
  if (!hasJob(d.state) || !isObject(base.estimate) || base.estimate.filename !== base.filename) base.estimate = null
  base.offlineSince = null
  if (r.httpStatus === 503) {
    var since = isObject(prev) ? finiteOrNull(prev.klippyDownSince) : null
    base.klippyDownSince = since !== null ? since : now
  } else {
    base.klippyDownSince = null
    forgetFailedService(base)
  }
  if (r.httpStatus > 0) base.lastSeenAt = now
  return base
}

// A service name lookup that failed is tried again on the next disconnection;
// a known name stays for the session (it does not change).
function forgetFailedService(status) {
  var svc = status.klipperService
  if (isObject(svc) && svc.pending !== true && !svc.name) status.klipperService = null
}

function clearKlippyDown(statuses, key) {
  if (!isObject(statuses) || !isObject(statuses[key]) || statuses[key].klippyDownSince === null) return statuses
  var next = copy(statuses)
  var st = copy(statuses[key])
  st.klippyDownSince = null
  next[key] = st
  return next
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
// right after a printer command. now (optional) is stamped as requestedAt, so
// a reading can be told apart from one that left before a command answered.
function planDispatch(statuses, printers, timeoutMs, onlyKey, now) {
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
    updated.requestedAt = finiteOrNull(now)
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

// A firmware restart only helps when Klipper itself is down (emergency stop,
// MCU fault) or refused its config. Not while it is starting, not when the
// Klippy service is disconnected from Moonraker (503, klippyState empty) and
// not for a failed print with Klipper ready.
function canRestartFirmware(status) {
  if (!isObject(status) || status.state !== "error") return false
  return status.klippyState === "shutdown" || status.klippyState === "error"
}

// Klipper not connected to Moonraker (503) for KLIPPY_DOWN_OFFER_MS or more:
// only its service restart can help. Without a clock (now) it is never offered.
function canRestartKlipper(status, now) {
  if (!isObject(status) || status.state !== "error") return false
  var since = finiteOrNull(status.klippyDownSince)
  var t = finiteOrNull(now)
  return since !== null && t !== null && t - since >= KLIPPY_DOWN_OFFER_MS
}

// The actions a printer offers now: the per-state table plus the firmware
// and service restarts, which depend on Klipper's own state as well.
function actionsFor(status, now) {
  if (!isObject(status)) return []
  var ids = availableActions(status.state)
  if (canRestartFirmware(status)) ids.push("firmwareRestart")
  if (canRestartKlipper(status, now)) ids.push("klipperRestart")
  return ids
}

function emptyCommands() {
  return { busy: null, estop: null, web: null, failure: null, seq: 0 }
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
  if (actionsFor(status, now).indexOf(action) < 0) return refused
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
      args: buildActionArgs(printer.baseUrl, action, connectSec,
        isObject(status.klipperService) ? status.klipperService.name : ""),
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
  else if (isObject(cur.web) && cur.web.seq === seq) slot = "web"
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

// ---- Opening the web UI: no request to the printer, just the desktop's
//      browser launcher, tracked in its own slot so it never waits on (or
//      holds up) a printer command.

function buildWebLaunchArgs(url) {
  if (typeof url !== "string" || url === "") return []
  return ["omarchy-launch-browser", url]
}

// exitCode -2 is the guard timer; launched false means the binary never ran.
function parseWebLaunchResult(exitCode, launched) {
  if (launched === false) return { ok: false, message: TEXT.launcherNotFound }
  if (exitCode === 0) return { ok: true, message: "" }
  if (exitCode === -2) return { ok: false, message: TEXT.launcherTimeout }
  return { ok: false, message: fill(TEXT.launcherExitCode, exitCode) }
}

function planOpenWeb(commands, printer, now) {
  var refused = { commands: commands, request: null }
  if (!isObject(printer) || typeof printer.key !== "string" || typeof printer.webUrl !== "string" || printer.webUrl === "") return refused
  var cur = commandsFor(commands, printer.key)
  if (cur.web) return refused
  var entry = copy(cur)
  entry.seq = (finiteOrNull(cur.seq) || 0) + 1
  entry.web = { action: "openWebUi", seq: entry.seq, startedAt: finiteOrNull(now) || 0 }
  entry.failure = null
  var next = copy(isObject(commands) ? commands : {})
  next[printer.key] = entry
  return {
    commands: next,
    request: { key: printer.key, seq: entry.seq, args: buildWebLaunchArgs(printer.webUrl), guardMs: WEB_LAUNCH_TIMEOUT_SEC * 1000 }
  }
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

// ---- Notifications: what a new reading means, compared with the last
//      answered one. Every widget instance keeps its own watches; only the
//      leader (the first live instance) sends.

function emptyWatch() {
  return { seeded: false, last: null, silent: 0, lostNotified: false }
}

function heaterOn(h) {
  return isObject(h) && (finiteOrNull(h.target) || 0) > 0
}

function snapshotOf(status) {
  return {
    state: status.state,
    printState: stringOr(status.printState, ""),
    filename: stringOr(status.filename, ""),
    heating: heaterOn(status.nozzle) || heaterOn(status.bed)
  }
}

// Klipper restarting (a FIRMWARE_RESTART, say) reads as an error but is not
// a failure.
function isFailure(status) {
  return status.state === "error" && status.klippyState !== "startup"
}

function eventsFor(last, status) {
  var events = []
  var file = stringOr(status.filename, "") || last.filename
  if (hasJob(last.state)) {
    if (status.printState === "complete" && status.state !== "error") events.push({ type: "complete", filename: file })
    else if (isFailure(status)) events.push({ type: "failed", filename: file, reason: stringOr(status.reason, "") })
    else if (last.state === "printing" && status.state === "paused") events.push({ type: "paused", filename: file })
  } else if (last.state === "idle" && last.heating && isFailure(status)) {
    events.push({ type: "failed", filename: "", reason: stringOr(status.reason, "") })
  }
  return events
}

// Returns { watch, events }. The first answered reading only seeds the watch;
// readings without an answer count towards "not responding" once a print was
// running. protectedNow drops the events (a panel action caused them) but the
// watch still moves on.
function observe(watch, status, protectedNow) {
  var w = isObject(watch) ? watch : emptyWatch()
  if (!isObject(status) || typeof status.state !== "string") return { watch: w, events: [] }
  var events = []
  var next = copy(w)
  if (status.state === "offline") {
    if (!w.seeded) return { watch: w, events: [] }
    next.silent = (finiteOrNull(w.silent) || 0) + 1
    if (next.silent >= NOTIFY_LOST_AFTER && !w.lostNotified && isObject(w.last) && hasJob(w.last.state)) {
      events.push({ type: "lostContact", filename: w.last.filename })
      next.lostNotified = true
    }
  } else {
    if (w.seeded && isObject(w.last)) events = eventsFor(w.last, status)
    next.seeded = true
    next.last = snapshotOf(status)
    next.silent = 0
    next.lostNotified = false
  }
  return { watch: next, events: protectedNow === true ? [] : events }
}

function reconcileWatches(watches, printers) {
  if (!isObject(watches)) return {}
  var list = Array.isArray(printers) ? printers : []
  var keep = {}
  for (var i = 0; i < list.length; i++) if (isObject(list[i])) keep[list[i].key] = true
  var next = {}
  var removed = false
  for (var k in watches) {
    if (keep[k]) next[k] = watches[k]
    else removed = true
  }
  return removed ? next : watches
}

function filterEvents(events, prefs) {
  var list = Array.isArray(events) ? events : []
  var p = isObject(prefs) ? prefs : {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    var e = list[i]
    if (isObject(e) && p[e.type] !== false) out.push(e)
  }
  return out
}

function buildNotification(event, displayName) {
  if (!isObject(event)) return null
  var name = stringOr(displayName, "")
  var file = stringOr(event.filename, "")
  var suffix = file !== "" ? fill(TEXT.notify.fileSuffix, file) : ""
  var urgency, title, body
  if (event.type === "complete") {
    urgency = "normal"; title = TEXT.notify.completeTitle
    body = file !== "" ? fill(TEXT.notify.withFile, name, file) : name
  } else if (event.type === "paused") {
    urgency = "normal"; title = TEXT.notify.pausedTitle
    body = file !== "" ? fill(TEXT.notify.withFile, name, file) : name
  } else if (event.type === "failed") {
    urgency = "critical"; title = TEXT.notify.failedTitle
    body = fill(TEXT.notify.failedBody, name, stringOr(event.reason, "") || TEXT.unknown) + suffix
  } else if (event.type === "lostContact") {
    urgency = "critical"; title = TEXT.notify.lostTitle
    body = fill(TEXT.notify.lostBody, name) + suffix
  } else {
    return null
  }
  return { urgency: urgency, title: title, body: body,
    args: ["notify-send", "-a", NOTIFY_APP_NAME, "-u", urgency, "-i", NOTIFY_ICON, title, body] }
}

// exitCode -2 is the guard timer; launched false means the binary never ran.
function parseNotifyResult(exitCode, launched) {
  if (launched === false) return { ok: false, message: TEXT.notify.notFound }
  if (exitCode === 0) return { ok: true, message: "" }
  if (exitCode === -2) return { ok: false, message: TEXT.notify.timeout }
  return { ok: false, message: fill(TEXT.notify.serviceUnavailable, exitCode) }
}

function notifyWarning(notifyState) {
  if (!isObject(notifyState) || notifyState.available !== false) return ""
  return fill(TEXT.notify.unavailable, stringOr(notifyState.message, "") || TEXT.unknown)
}

// ---- Widget instances sharing the shell (one per bar). The registry lives
//      in Shared.js; these only compute its next value.

function emptyRegistry() {
  return { instances: [], next: 1 }
}

function registerInstance(reg) {
  var r = isObject(reg) && Array.isArray(reg.instances) ? reg : emptyRegistry()
  var id = finiteOrNull(r.next) || 1
  return { registry: { instances: r.instances.concat([id]), next: id + 1 }, id: id }
}

function unregisterInstance(reg, id) {
  if (!isObject(reg) || !Array.isArray(reg.instances) || reg.instances.indexOf(id) < 0) return reg
  return { instances: reg.instances.filter(function(i) { return i !== id }), next: reg.next }
}

function isLeader(reg, id) {
  return isObject(reg) && Array.isArray(reg.instances) && reg.instances.length > 0 && reg.instances[0] === id
}

// ---- Panel actions must not notify their own effect. A command (from any
//      instance) protects its printer until every instance has read it once
//      with a query that left after the answer: each bar polls on its own
//      clock, so one bar reading late must not free another's older query.

// ---- One send per command across bars: every bar keeps its own commands,
//      so the shared registry (Shared.state.sends) stops a second bar from
//      sending the same command to the same printer right after the first.

var SEND_DEDUP_MS = 5000

function claimSend(sends, key, action, now) {
  var src = isObject(sends) ? sends : {}
  var t = finiteOrNull(now)
  var last = src[key]
  if (t !== null && isObject(last) && last.action === action && t - last.at < SEND_DEDUP_MS)
    return { sends: sends, ok: false }
  var next = copy(src)
  next[key] = { action: action, at: t !== null ? t : 0 }
  return { sends: next, ok: true }
}

// A failed command may be retried at once.
function releaseSend(sends, key, action) {
  if (!isObject(sends) || !isObject(sends[key]) || sends[key].action !== action) return sends
  var next = copy(sends)
  delete next[key]
  return next
}

function protectStart(prot, key) {
  var next = copy(isObject(prot) ? prot : {})
  var cur = isObject(next[key]) ? next[key] : { pending: 0, answeredAt: null }
  next[key] = { pending: (finiteOrNull(cur.pending) || 0) + 1, answeredAt: cur.answeredAt, released: {} }
  return next
}

function protectFinish(prot, key, now) {
  if (!isObject(prot) || !isObject(prot[key])) return prot
  var cur = prot[key]
  var next = copy(prot)
  next[key] = { pending: Math.max(0, (finiteOrNull(cur.pending) || 0) - 1), answeredAt: finiteOrNull(now), released: {} }
  return next
}

function isProtected(prot, key, id) {
  if (!isObject(prot) || !isObject(prot[key])) return false
  var released = isObject(prot[key].released) ? prot[key].released : {}
  return released[id] !== true
}

function releaseProtection(prot, key, requestedAt, id, registry) {
  if (!isObject(prot) || !isObject(prot[key])) return prot
  var cur = prot[key]
  var asked = finiteOrNull(requestedAt)
  var answered = finiteOrNull(cur.answeredAt)
  if (cur.pending !== 0 || asked === null || answered === null || asked < answered) return prot
  var released = copy(isObject(cur.released) ? cur.released : {})
  released[id] = true
  var instances = isObject(registry) && Array.isArray(registry.instances) ? registry.instances : [id]
  var all = true
  for (var i = 0; i < instances.length; i++) if (released[instances[i]] !== true) all = false
  var next = copy(prot)
  if (all) delete next[key]
  else next[key] = { pending: cur.pending, answeredAt: cur.answeredAt, released: released }
  return next
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

// The icon's tooltip: the summary line plus, while there is a print, how much
// is left (the Printer menu keeps the plain summary line).
function tooltipLine(printer, status) {
  if (!isObject(printer) || !isObject(status)) return ""
  var line = summaryLine(printer, status)
  if (isWarmingUp(status)) return line + " · " + TEXT.warmingUp
  var remaining = hasJob(status.state) ? remainingOf(status) : null
  return remaining !== null ? line + " · " + fill(TEXT.left, formatDuration(remaining)) : line
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
  return { mode: st.state, progress: progress, tooltip: tooltipLine(top.printer, st) }
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

function pad2(n) {
  return (n < 10 ? "0" : "") + n
}

// When a print ends, on the computer's clock: "16:52" today, "tomorrow
// 02:10", "Sat 08:00" within the week, "7 Oct 08:00" beyond. Always 24 h
// (the user's bar clock is HH:mm even with a 12 h locale).
function formatFinish(finishMs, nowMs) {
  var f = finiteOrNull(finishMs)
  var n = finiteOrNull(nowMs)
  if (f === null || n === null) return ""
  var end = new Date(Math.round(f / 60000) * 60000)
  var today = new Date(n)
  var clock = pad2(end.getHours()) + ":" + pad2(end.getMinutes())
  var startOf = function(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  var days = Math.round((startOf(end) - startOf(today)) / 86400000)
  if (days <= 0) return clock
  if (days === 1) return fill(TEXT.finish.tomorrow, clock)
  if (days <= 6) return TEXT.finish.days[end.getDay()] + " " + clock
  return end.getDate() + " " + TEXT.finish.months[end.getMonth()] + " " + clock
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
  if (!isObject(printer)) printer = { key: "", displayName: "" }
  if (!isObject(status)) status = initialStatus(printer.key)
  var job = hasJob(status.state)
  var remaining = job ? remainingOf(status) : null
  var warmUp = isWarmingUp(status)
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
    // A finished print leaves its last message behind (the Voron keeps
    // "Imprimindo"), so it only shows while there is a print.
    messageText: job ? stringOr(status.message, "") : "",
    remainingText: !job ? "" : (warmUp && remaining !== null ? fill(TEXT.plusWarmUp, formatDuration(remaining)) : formatDuration(remaining)),
    layerText: job ? layerTextOf(status) : "",
    finishText: job && !warmUp && remaining !== null ? formatFinish(finiteOrNull(now) + remaining * 1000, now) : "",
    nozzleText: formatTemp(status.nozzle),
    bedText: formatTemp(status.bed),
    showTemps: status.state !== "offline" && (!!status.nozzle || !!status.bed),
    freshnessText: freshness
  }
}

// The action buttons for one printer. enabled is exactly "planCommand (or
// planOpenWeb) would send it now"; failureText shows even when no button does
// (a printer that went offline after the failure). Open web UI shows in every
// state as long as the printer has a web address, always last.
function buildActionsModel(printer, status, printerCommands, now) {
  var model = { buttons: [], primary: [], emergency: null, web: null, failureText: "", filename: "" }
  if (!isObject(printer) || !isObject(status)) return model
  var pc = isObject(printerCommands) ? printerCommands : emptyCommands()
  var wrapped = {}
  wrapped[printer.key] = pc
  var t = finiteOrNull(now)
  var ids = actionsFor(status, t === null ? undefined : t)
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
      enabled: planCommand(wrapped, printer, status, id, DEFAULT_TIMEOUT_SEC * 1000, t === null ? 0 : t).request !== null
    }
    model.buttons.push(button)
    if (id === "emergencyStop") model.emergency = button
    else model.primary.push(button)
  }
  if (typeof printer.webUrl === "string" && printer.webUrl !== "") {
    model.web = {
      id: "openWebUi",
      label: TEXT.actions.openWebUi,
      glyph: ACTION_GLYPHS.openWebUi,
      confirm: false,
      urgent: false,
      busy: isObject(pc.web),
      enabled: planOpenWeb(wrapped, printer, 0).request !== null
    }
    model.buttons.push(model.web)
  }
  model.failureText = isObject(pc.failure) ? stringOr(pc.failure.message, "") : ""
  model.filename = stringOr(status.filename, "")
  return model
}

// Slicer file names rarely have spaces, and the native dialog only wraps at
// word boundaries, so a long name ran past its border (seen on the Voron). A
// zero-width space after "_", "-" and "." gives it places to break.
function breakable(text) {
  return text.replace(/([_.\-])/g, "$1\u200B")
}

// Confirmation texts; "" means the action asks nothing (the panel then
// refuses to open a confirmation for it).
function confirmMessage(action, displayName, filename) {
  var name = stringOr(displayName, "")
  var file = breakable(stringOr(filename, ""))
  if (action === "cancel")
    return file !== "" ? fill(TEXT.confirm.cancelMessage, file, name) : fill(TEXT.confirm.cancelMessageNoFile, name)
  if (action === "emergencyStop") return fill(TEXT.confirm.emergencyMessage, name)
  if (action === "firmwareRestart") return fill(TEXT.confirm.restartMessage, name)
  if (action === "klipperRestart") return fill(TEXT.confirm.klipperMessage, name)
  if (action === "removePrinter") return fill(TEXT.confirm.removeMessage, name)
  return ""
}

function confirmLabel(action) {
  if (action === "cancel") return TEXT.confirm.cancelPrint
  if (action === "emergencyStop") return TEXT.confirm.stop
  if (action === "firmwareRestart" || action === "klipperRestart") return TEXT.confirm.restart
  if (action === "removePrinter") return TEXT.confirm.remove
  return ""
}

// Keyboard stops of the panel, in reading order: the printer dropdown, then
// every button that can be pressed right now, Open web UI last.
function cursorStops(panelModel) {
  var stops = []
  if (!isObject(panelModel)) return stops
  if (Array.isArray(panelModel.options) && panelModel.options.length > 0) stops.push("printer")
  var a = isObject(panelModel.actions) ? panelModel.actions : {}
  var primary = Array.isArray(a.primary) ? a.primary : []
  for (var i = 0; i < primary.length; i++) if (primary[i].enabled) stops.push(primary[i].id)
  if (isObject(a.emergency) && a.emergency.enabled) stops.push(a.emergency.id)
  if (isObject(a.web) && a.web.enabled) stops.push(a.web.id)
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

function buildPanelModel(printers, statusesByKey, selectedKey, now, commandsByKey, notifyWarningText) {
  var list = Array.isArray(printers) ? printers : []
  var warning = stringOr(notifyWarningText, "")
  if (list.length === 0) {
    return { empty: true, selected: null, showJob: false, rows: [], options: [], actions: buildActionsModel(null, null, null),
      notifyWarning: warning }
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
    actions: buildActionsModel(printer, selectedStatus, commands, now), notifyWarning: warning }
}

// ---- Printer setup (slice 009): the list the shell saves, the network
//      search and the add-by-address form. The shell writes its own config
//      (omarchy-shell … setBarWidget); the plugin writes no file.

var PLUGIN_ID = "io.github.brunorzm.omaklippy"
var DISCOVERY_TIMEOUT_MS = 30000
var SAVE_TIMEOUT_MS = 5000
var NETS_TIMEOUT_MS = 3000
var MDNS_TIMEOUT_MS = 6000
var SCAN_TIMEOUT_MS = 20000
var REVERSE_TIMEOUT_MS = 3000
var SCAN_PARALLEL = 64

// Interfaces that are not the local network: loopback, VPNs, containers and
// bridges. A printer is never behind one of them.
var IGNORED_IFACES = /^(lo|tailscale|wg|tun|tap|docker|br-|veth|virbr|zt)/

function isIPv4(text) {
  var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(typeof text === "string" ? text : "")
  if (!m) return false
  for (var i = 1; i <= 4; i++) if (Number(m[i]) > 255) return false
  return true
}

function timeoutSecOf(value) {
  return clampInt(value, 1, 30, DEFAULT_TIMEOUT_SEC)
}

// The host alone (no port), lowercased: what tells two addresses of the same
// printer apart from two printers.
function bareHost(baseUrl) {
  return hostOf(baseUrl).replace(/:\d+$/, "").toLowerCase()
}

function isListItem(item) {
  return item !== null && typeof item === "object" && typeof item.address === "string"
}

// The printers list exactly as the settings hold it (not normalized), so a
// save keeps webUrl, names and any field the plugin does not know.
function rawPrinters(settings) {
  var s = settings !== null && typeof settings === "object" ? settings : {}
  return toList(s.printers, true).slice()
}

// Returns { list, key, error }: list is the new raw list (null on error) and
// key the new printer's normalized key (baseUrl#order), known before saving.
function addPrinterToList(raw, address, name) {
  var src = toList(raw, false)
  var text = typeof address === "string" ? address.trim() : ""
  var baseUrl = normalizeAddress(text)
  if (baseUrl === "") return { list: null, key: "", error: TEXT.invalidAddress }
  var current = normalizePrinters(src)
  for (var i = 0; i < current.length; i++) {
    // The same host on another port is the same printer: Mainsail's nginx
    // passes the API on port 80 to Moonraker's 7125.
    if (current[i].baseUrl !== "" && bareHost(current[i].baseUrl) === bareHost(baseUrl))
      return { list: null, key: "", error: fill(TEXT.setup.alreadyAdded, text) }
  }
  var item = {}
  var label = typeof name === "string" ? name.trim() : ""
  if (label !== "") item.name = label
  item.address = text
  var list = src.slice()
  list.push(item)
  return { list: list, key: baseUrl + "#" + current.length, error: "" }
}

// order is the printer's place among the accepted items (normalizePrinters
// skips entries without a text address); anything else stays as it was.
function removePrinterFromList(raw, order) {
  var src = toList(raw, false)
  var out = []
  var seen = 0
  for (var i = 0; i < src.length; i++) {
    if (isListItem(src[i])) {
      if (seen === order) { seen++; continue }
      seen++
    }
    out.push(src[i])
  }
  return out
}

// The space before the JSON is required: qs ipc (Quickshell 0.3.1) splits an
// argument that starts with "[" into several, and the shell's JSON.parse
// ignores the space (research R1).
function buildSaveArgs(list) {
  var items = toList(list, false)
  var json = "[]"
  try { json = JSON.stringify(items) } catch (e) { json = "[]" }
  return ["omarchy-shell", "shell", "setBarWidget", PLUGIN_ID, "printers", " " + json, "{}"]
}

// omarchy-shell exits 0 even when the shell refuses, so the answer text
// decides. exitCode -2 is the guard timer; launched false, a missing binary.
function parseSaveResult(stdout, exitCode, launched, stderr) {
  if (launched === false) return { ok: false, message: TEXT.setup.shellNotFound }
  if (exitCode === -2) return { ok: false, message: TEXT.setup.shellNoAnswer }
  var out = typeof stdout === "string" ? stdout.trim() : ""
  if (out === "ok") return { ok: true, message: "" }
  if (out !== "") return { ok: false, message: tidyMessage(out) }
  var err = typeof stderr === "string" ? tidyMessage(stderr) : ""
  if (err !== "") return { ok: false, message: err }
  return { ok: false, message: typeof exitCode === "number" && exitCode !== 0 ? "exit " + exitCode : TEXT.setup.shellNoAnswer }
}

// ---- Search: local networks, announcements, the network check, names.

function buildNetsArgs() {
  return ["ip", "-j", "-4", "addr", "show"]
}

// One /24 per directly connected IPv4 network (bigger ones are searched only
// around this computer), without VPNs, containers or bridges.
function parseLocalNets(stdout, exitCode) {
  if (exitCode !== 0 || typeof stdout !== "string") return []
  var data = null
  try { data = JSON.parse(stdout) } catch (e) { return [] }
  if (!Array.isArray(data)) return []
  var out = []
  var seen = {}
  for (var i = 0; i < data.length; i++) {
    var iface = data[i]
    if (!isObject(iface) || typeof iface.ifname !== "string" || IGNORED_IFACES.test(iface.ifname)) continue
    var addrs = Array.isArray(iface.addr_info) ? iface.addr_info : []
    for (var j = 0; j < addrs.length; j++) {
      var a = addrs[j]
      if (!isObject(a) || (a.family !== undefined && a.family !== "inet") || a.scope !== "global") continue
      var len = finiteOrNull(a.prefixlen)
      if (len === null || len < 16 || len > 30 || !isIPv4(a.local)) continue
      var prefix = a.local.slice(0, a.local.lastIndexOf(".") + 1)
      if (seen[prefix]) continue
      seen[prefix] = true
      out.push({ iface: iface.ifname, prefix: prefix, self: a.local })
    }
  }
  return out
}

function buildMdnsArgs() {
  return ["avahi-browse", "-rtp", "_moonraker._tcp"]
}

// avahi's parseable output escapes characters as \DDD (decimal) and others
// as \c: "My\032Printer" is "My Printer".
function unescapeAvahi(text) {
  return String(text).replace(/\\(\d{3}|.)/g, function(match, code) {
    return code.length === 3 ? String.fromCharCode(Number(code)) : code
  })
}

// "=" lines are resolved services:
// =;iface;IPv4;name;_moonraker._tcp;local;host.local;ip;port;txt
function parseMdns(stdout) {
  if (typeof stdout !== "string") return []
  var lines = stdout.split("\n")
  var out = []
  var seen = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split(";")
    if (f.length < 9 || f[0] !== "=" || f[2] !== "IPv4" || !isIPv4(f[7]) || seen[f[7]]) continue
    var port = clampInt(f[8], 1, 65535, MOONRAKER_DEFAULT_PORT)
    seen[f[7]] = true
    out.push({ name: unescapeAvahi(f[3]), host: unescapeAvahi(f[6]), ip: f[7], port: port })
  }
  return out
}

// One curl for every address of every network: one process for the shell
// to watch, 64 connections at a time, only GETs of Moonraker's info.
function buildScanArgs(nets) {
  var list = toList(nets, false)
  var targets = []
  for (var i = 0; i < list.length; i++) {
    var n = list[i]
    if (!isObject(n) || typeof n.prefix !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.$/.test(n.prefix)) continue
    for (var h = 1; h <= 254; h++) {
      var ip = n.prefix + h
      if (ip !== n.self) targets.push("-o", "/dev/null", "http://" + ip + ":" + MOONRAKER_DEFAULT_PORT + "/server/info")
    }
  }
  if (targets.length === 0) return []
  return ["curl", "-s", "--parallel", "--parallel-max", String(SCAN_PARALLEL), "--connect-timeout", "1", "--max-time", "2",
    "-w", "%{url} %{http_code}\n"].concat(targets)
}

// curl's exit code is that of the last address, even when others answered,
// so only the lines count.
function parseScan(stdout) {
  if (typeof stdout !== "string") return []
  var lines = stdout.split("\n")
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var m = /^https?:\/\/(\d+\.\d+\.\d+\.\d+)(?::\d+)?\/\S*\s+200\s*$/.exec(lines[i])
    if (m && isIPv4(m[1]) && out.indexOf(m[1]) < 0) out.push(m[1])
  }
  return out
}

function buildReverseArgs(ip) {
  return ["avahi-resolve", "-a", String(ip)]
}

// "192.168.1.110\tvoron.local" → "voron.local"; anything else → "".
function parseReverse(stdout, exitCode) {
  if (exitCode !== 0 || typeof stdout !== "string") return ""
  var f = stdout.split("\n")[0].split("\t")
  if (f.length < 2 || !isIPv4(f[0].trim())) return ""
  var host = f[1].trim()
  return /^[A-Za-z0-9._-]+$/.test(host) ? host : ""
}

function buildHostnameArgs(baseUrl, timeoutSec) {
  if (typeof baseUrl !== "string" || baseUrl === "") return []
  return buildCurlArgs(baseUrl + "/printer/info", timeoutSecOf(timeoutSec))
}

// The name the printer's computer gives itself (fails while Klipper is
// disconnected: the name then comes from the network).
function parseHostname(stdout, exitCode) {
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage || t.httpStatus < 200 || t.httpStatus >= 300) return ""
  var res = isObject(t.data) && isObject(t.data.result) ? t.data.result : null
  return res ? stringOr(res.hostname, "").trim() : ""
}

function parseMoonrakerCheck(stdout, exitCode) {
  var t = readTransport(stdout, exitCode)
  if (t.errorMessage) return { ok: false, message: tidyMessage(t.errorMessage) }
  var res = isObject(t.data) && isObject(t.data.result) ? t.data.result : null
  if (t.httpStatus >= 200 && t.httpStatus < 300 && res &&
      (typeof res.klippy_state === "string" || typeof res.moonraker_version === "string"))
    return { ok: true, message: "" }
  return { ok: false, message: TEXT.setup.notMoonraker }
}

// ---- Search state machine. Every accept* returns { discovery, requests };
//      the widget runs the requests (each with kind, seq, ip, args, guardMs)
//      and hands each result back. Answers of another search are ignored.

function emptyDiscovery() {
  return { state: "idle", seq: 0, startedAt: null, timeoutSec: DEFAULT_TIMEOUT_SEC, waiting: {}, found: [],
    mdnsUnavailable: false, scanUnavailable: false }
}

function isDiscovery(d) {
  return isObject(d) && Array.isArray(d.found) && isObject(d.waiting)
}

function startDiscovery(d, now, timeoutSec) {
  var seq = (isDiscovery(d) ? finiteOrNull(d.seq) || 0 : 0) + 1
  return {
    discovery: { state: "running", seq: seq, startedAt: finiteOrNull(now), timeoutSec: timeoutSecOf(timeoutSec),
      waiting: { nets: 1, mdns: 1 }, found: [], mdnsUnavailable: false, scanUnavailable: false },
    requests: [
      { kind: "nets", seq: seq, ip: "", args: buildNetsArgs(), guardMs: NETS_TIMEOUT_MS },
      { kind: "mdns", seq: seq, ip: "", args: buildMdnsArgs(), guardMs: MDNS_TIMEOUT_MS }
    ]
  }
}

function accepting(d, seq) {
  return isDiscovery(d) && d.state === "running" && d.seq === seq
}

function unchanged(d) {
  return { discovery: d, requests: [] }
}

// Counts one answer of the given kind and ends the search once nothing is
// left to wait for.
function settle(d, kind, extra) {
  var waiting = copy(d.waiting)
  var n = (finiteOrNull(waiting[kind]) || 0) - 1 + (extra || 0)
  if (n > 0) waiting[kind] = n
  else delete waiting[kind]
  var next = copy(d)
  next.waiting = waiting
  return next
}

function isFoundAdded(found, printers) {
  if (!isObject(found)) return false
  var list = Array.isArray(printers) ? printers : []
  var ip = stringOr(found.ip, "").toLowerCase()
  var host = stringOr(found.address, "").toLowerCase()
  for (var i = 0; i < list.length; i++) {
    var p = list[i]
    if (!isObject(p) || !p.baseUrl) continue
    var h = bareHost(p.baseUrl)
    if (h !== "" && (h === ip || h === host)) return true
  }
  return false
}

// Preferred address: the name on the network, the announced host, the IP.
// Name: what the printer calls itself, the announced name, the network name
// without ".local", the IP.
function completeFound(f, printers) {
  var out = copy(f)
  out.address = f.reverse || f.mdnsHost || f.ip
  var short = out.address !== f.ip ? out.address.replace(/\.local$/i, "") : ""
  out.name = f.hostname || f.mdnsName || short || f.ip
  out.added = isFoundAdded(out, printers)
  return out
}

function sortFound(list) {
  return list.slice().sort(function(a, b) {
    var x = a.name.toLowerCase()
    var y = b.name.toLowerCase()
    if (x !== y) return x < y ? -1 : 1
    return a.ip < b.ip ? -1 : (a.ip > b.ip ? 1 : 0)
  })
}

// Adds candidates (by IP) from one source; a new IP gets a reverse lookup and
// a /printer/info each.
function addCandidates(d, source, candidates, printers) {
  var found = d.found.slice()
  var requests = []
  var asked = 0
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i]
    var at = -1
    for (var j = 0; j < found.length; j++) if (found[j].ip === c.ip) at = j
    var f
    if (at < 0) {
      f = { ip: c.ip, port: c.port || MOONRAKER_DEFAULT_PORT, sources: [source], mdnsName: "", mdnsHost: "",
        reverse: "", hostname: "", pending: 2 }
      requests.push({ kind: "reverse", seq: d.seq, ip: c.ip, args: buildReverseArgs(c.ip), guardMs: REVERSE_TIMEOUT_MS })
      requests.push({ kind: "hostname", seq: d.seq, ip: c.ip,
        args: buildHostnameArgs("http://" + c.ip + ":" + f.port, d.timeoutSec), guardMs: (d.timeoutSec + 1) * 1000 })
      asked += 2
    } else {
      f = copy(found[at])
      if (f.sources.indexOf(source) < 0) f.sources = f.sources.concat([source]).sort()
    }
    if (source === "mdns") {
      if (!f.mdnsName) f.mdnsName = stringOr(c.name, "")
      if (!f.mdnsHost) f.mdnsHost = stringOr(c.host, "")
      if (c.port) f.port = c.port
    }
    f = completeFound(f, printers)
    if (at < 0) found.push(f)
    else found[at] = f
  }
  var next = copy(d)
  next.found = sortFound(found)
  if (asked > 0) {
    next.waiting = copy(d.waiting)
    next.waiting.names = (finiteOrNull(next.waiting.names) || 0) + asked
  }
  return { discovery: next, requests: requests }
}

function acceptNets(d, seq, nets, launched) {
  if (!accepting(d, seq)) return unchanged(d)
  var list = toList(nets, false)
  var args = launched === false ? [] : buildScanArgs(list)
  if (args.length === 0) {
    var none = settle(d, "nets")
    none.scanUnavailable = true
    return { discovery: discoveryDone(none), requests: [] }
  }
  var next = settle(d, "nets")
  next.waiting.scan = 1
  return { discovery: next, requests: [{ kind: "scan", seq: seq, ip: "", args: args, guardMs: SCAN_TIMEOUT_MS }] }
}

function acceptMdns(d, seq, list, launched, printers) {
  if (!accepting(d, seq)) return unchanged(d)
  var next = settle(d, "mdns")
  if (launched === false) {
    next.mdnsUnavailable = true
    return { discovery: discoveryDone(next), requests: [] }
  }
  var items = toList(list, false).filter(function(c) { return isObject(c) && isIPv4(c.ip) })
  var r = addCandidates(next, "mdns", items, printers)
  return { discovery: discoveryDone(r.discovery), requests: r.requests }
}

function acceptScan(d, seq, ips, printers) {
  if (!accepting(d, seq)) return unchanged(d)
  var items = toList(ips, false).filter(isIPv4).map(function(ip) { return { ip: ip } })
  var r = addCandidates(settle(d, "scan"), "scan", items, printers)
  return { discovery: discoveryDone(r.discovery), requests: r.requests }
}

function acceptName(d, seq, ip, field, value, printers) {
  if (!accepting(d, seq)) return unchanged(d)
  var at = -1
  for (var i = 0; i < d.found.length; i++) if (d.found[i].ip === ip) at = i
  if (at < 0 || !(d.found[at].pending > 0)) return unchanged(d)
  var f = copy(d.found[at])
  f[field] = stringOr(value, "").trim()
  f.pending = f.pending - 1
  var next = settle(d, "names")
  next.found = d.found.slice()
  next.found[at] = completeFound(f, printers)
  next.found = sortFound(next.found)
  return { discovery: discoveryDone(next), requests: [] }
}

function acceptReverse(d, seq, ip, host, printers) {
  return acceptName(d, seq, ip, "reverse", host, printers)
}

function acceptHostname(d, seq, ip, name, printers) {
  return acceptName(d, seq, ip, "hostname", name, printers)
}

// One process result, as the widget gets it, through the right parser.
function acceptDiscoveryOutput(d, kind, seq, ip, stdout, exitCode, launched, printers) {
  if (kind === "nets") return acceptNets(d, seq, parseLocalNets(stdout, exitCode), launched)
  if (kind === "mdns") return acceptMdns(d, seq, parseMdns(stdout), launched, printers)
  if (kind === "scan") return acceptScan(d, seq, parseScan(stdout), printers)
  if (kind === "reverse") return acceptReverse(d, seq, ip, parseReverse(stdout, exitCode), printers)
  if (kind === "hostname") return acceptHostname(d, seq, ip, parseHostname(stdout, exitCode), printers)
  return unchanged(d)
}

// The caller stops the search's processes.
function cancelDiscovery(d) {
  var next = isDiscovery(d) ? copy(d) : emptyDiscovery()
  next.state = "idle"
  next.found = []
  next.waiting = {}
  return next
}

function finishFound(found) {
  return found.map(function(f) {
    if (!(f.pending > 0)) return f
    var g = copy(f)
    g.pending = 0
    return g
  })
}

// The 30 s guard: the search ends with what it has.
function expireDiscovery(d, now) {
  if (!isDiscovery(d) || d.state !== "running") return d
  var t = finiteOrNull(now)
  var since = finiteOrNull(d.startedAt)
  if (t === null || since === null || t - since < DISCOVERY_TIMEOUT_MS) return d
  var next = copy(d)
  next.state = "done"
  next.waiting = {}
  next.found = finishFound(d.found)
  return next
}

function discoveryDone(d) {
  if (!isDiscovery(d) || d.state !== "running") return d
  for (var k in d.waiting) if (d.waiting[k] > 0) return d
  var next = copy(d)
  next.state = "done"
  next.waiting = {}
  return next
}

// What a found printer is saved as: its address with the port it answered
// on (the network check only asks Moonraker's own port).
function foundAddress(found) {
  if (!isObject(found) || typeof found.address !== "string" || found.address === "") return ""
  return found.address + ":" + clampInt(found.port, 1, 65535, MOONRAKER_DEFAULT_PORT)
}

// ---- Add by address: editing → checking → (naming) → saving, or
//      unreachable (the reason and Add anyway). Every step that runs a
//      process returns it as { kind, seq, args, guardMs }.

function emptyForm() {
  return { state: "editing", address: "", name: "", baseUrl: "", message: "", seq: 0, timeoutSec: DEFAULT_TIMEOUT_SEC }
}

function isForm(f) {
  return isObject(f) && typeof f.state === "string"
}

function submitForm(form, raw, address, name, timeoutSec) {
  var f = isForm(form) ? form : emptyForm()
  var text = typeof address === "string" ? address.trim() : ""
  var label = typeof name === "string" ? name.trim() : ""
  var check = addPrinterToList(raw, text, label)
  var next = copy(f)
  next.address = text
  next.name = label
  if (check.error) {
    next.state = "editing"
    next.message = check.error
    return { form: next, request: null }
  }
  var t = timeoutSecOf(timeoutSec)
  next.state = "checking"
  next.message = ""
  next.baseUrl = normalizeAddress(text)
  next.seq = (finiteOrNull(f.seq) || 0) + 1
  next.timeoutSec = t
  return { form: next, request: { kind: "check", seq: next.seq, ip: "", args: buildCurlArgs(next.baseUrl + "/server/info", t),
    guardMs: (t + 1) * 1000 } }
}

function hostName(form) {
  return bareHost(form.baseUrl) || form.address
}

function acceptCheck(form, seq, result) {
  if (!isForm(form) || form.state !== "checking" || form.seq !== seq) return { form: form, request: null }
  var next = copy(form)
  if (!isObject(result) || result.ok !== true) {
    next.state = "unreachable"
    next.message = fill(TEXT.setup.noMoonraker, form.address, (isObject(result) && stringOr(result.message, "")) || TEXT.noResponse)
    return { form: next, request: null }
  }
  if (form.name !== "") {
    next.state = "saving"
    return { form: next, request: null }
  }
  next.state = "naming"
  return { form: next, request: { kind: "formHostname", seq: seq, ip: "", args: buildHostnameArgs(form.baseUrl, form.timeoutSec),
    guardMs: (form.timeoutSec + 1) * 1000 } }
}

function acceptFormHostname(form, seq, hostname) {
  if (!isForm(form) || form.state !== "naming" || form.seq !== seq) return form
  var next = copy(form)
  next.state = "saving"
  next.name = stringOr(hostname, "").trim() || hostName(form)
  return next
}

function addAnyway(form) {
  if (!isForm(form) || form.state !== "unreachable") return form
  var next = copy(form)
  next.state = "saving"
  next.message = ""
  if (next.name === "") next.name = hostName(form)
  return next
}

function acceptFormOutput(form, kind, seq, stdout, exitCode) {
  if (kind === "check") return acceptCheck(form, seq, parseMoonrakerCheck(stdout, exitCode))
  if (kind === "formHostname") return { form: acceptFormHostname(form, seq, parseHostname(stdout, exitCode)), request: null }
  return { form: form, request: null }
}

// The form once the shell answered a save: cleared on success, back to
// editing (the typed text kept) with the reason otherwise.
function formAfterSave(form, ok, message) {
  if (!isForm(form) || form.state !== "saving") return form
  if (ok === true) return emptyForm()
  var next = copy(form)
  next.state = "editing"
  next.message = stringOr(message, "")
  return next
}

function checkingText(form) {
  if (!isForm(form)) return ""
  if (form.state === "checking" || form.state === "naming" || form.state === "saving") return fill(TEXT.setup.checking, form.address)
  return stringOr(form.message, "")
}

// ---- Setup screen

function buildSetupModel(printers, discovery, form, selectedKey, editable, saveMessage) {
  var list = Array.isArray(printers) ? printers : []
  var d = isDiscovery(discovery) ? discovery : emptyDiscovery()
  var f = isForm(form) ? form : emptyForm()
  var canEdit = editable !== false
  var searching = d.state === "running"
  var results = []
  for (var i = 0; i < d.found.length; i++) {
    var x = d.found[i]
    if (!isObject(x)) continue
    results.push({ ip: x.ip, name: x.name, address: x.address, added: isFoundAdded(x, list), ready: !(x.pending > 0) })
  }
  var notices = []
  if (!canEdit) notices.push(TEXT.setup.notEditable)
  if (d.mdnsUnavailable) notices.push(TEXT.setup.mdnsUnavailable)
  if (d.scanUnavailable) notices.push(TEXT.setup.scanUnavailable)
  var removeKey = ""
  var removeName = ""
  if (typeof selectedKey === "string" && selectedKey !== "") {
    for (var j = 0; j < list.length; j++) {
      if (isObject(list[j]) && list[j].key === selectedKey) { removeKey = list[j].key; removeName = list[j].displayName }
    }
  }
  return {
    searching: searching,
    foundCount: results.length,
    searchLabel: searching ? fill(TEXT.setup.searching, results.length) : TEXT.setup.search,
    results: results,
    notices: notices,
    nothingFound: d.state === "done" && results.length === 0,
    removeKey: removeKey,
    removeName: removeName,
    removeLabel: removeKey !== "" ? fill(TEXT.setup.remove, removeName) : "",
    editable: canEdit,
    formState: f.state,
    formText: checkingText(f),
    formBusy: f.state === "checking" || f.state === "naming" || f.state === "saving",
    showAddAnyway: f.state === "unreachable",
    saveMessage: stringOr(saveMessage, "")
  }
}

// Keyboard stops of the setup screen, in reading order. Result buttons are
// "add:<ip>"; only a printer that can be added now is a stop.
function setupCursorStops(setupModel, empty) {
  var m = isObject(setupModel) ? setupModel : {}
  var stops = []
  if (m.editable !== false) {
    stops.push(m.searching ? "cancelSearch" : "search")
    var results = Array.isArray(m.results) ? m.results : []
    for (var i = 0; i < results.length; i++) {
      if (isObject(results[i]) && !results[i].added && results[i].ready) stops.push("add:" + results[i].ip)
    }
    stops.push("address", "name", "submit")
    if (m.showAddAnyway) stops.push("addAnyway")
    if (m.removeKey) stops.push("remove")
  }
  if (empty !== true) stops.push("back")
  return stops
}

// The panel's keyboard stops for the screen it shows: the main screen ends
// with Printers…; the empty panel always shows the setup screen.
function panelStops(panelModel, setupModel, inSetup) {
  var empty = !isObject(panelModel) || panelModel.empty !== false
  if (inSetup === true || empty) return setupCursorStops(setupModel, empty)
  return cursorStops(panelModel).concat(["openSetup"])
}

if (typeof module !== "undefined") {
  module.exports = {
    PRINTER_GLYPH: PRINTER_GLYPH,
    TEXT: TEXT,
    ACTIONS: ACTIONS,
    ACTION_GLYPHS: ACTION_GLYPHS,
    COMMAND_TIMEOUT_SEC: COMMAND_TIMEOUT_SEC,
    NOTIFY_LOST_AFTER: NOTIFY_LOST_AFTER,
    NOTIFY_TIMEOUT_SEC: NOTIFY_TIMEOUT_SEC,
    emptyWatch: emptyWatch,
    observe: observe,
    reconcileWatches: reconcileWatches,
    filterEvents: filterEvents,
    buildNotification: buildNotification,
    parseNotifyResult: parseNotifyResult,
    notifyWarning: notifyWarning,
    emptyRegistry: emptyRegistry,
    registerInstance: registerInstance,
    unregisterInstance: unregisterInstance,
    isLeader: isLeader,
    protectStart: protectStart,
    protectFinish: protectFinish,
    isProtected: isProtected,
    releaseProtection: releaseProtection,
    WEB_LAUNCH_TIMEOUT_SEC: WEB_LAUNCH_TIMEOUT_SEC,
    deriveWebUrl: deriveWebUrl,
    buildWebLaunchArgs: buildWebLaunchArgs,
    parseWebLaunchResult: parseWebLaunchResult,
    planOpenWeb: planOpenWeb,
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
    detailFor: detailFor,
    formatFinish: formatFinish,
    tooltipLine: tooltipLine,
    parseMetadataLayers: parseMetadataLayers,
    buildMetadataArgs: buildMetadataArgs,
    parseMetadataResponse: parseMetadataResponse,
    planEstimate: planEstimate,
    acceptEstimate: acceptEstimate,
    blendRemaining: blendRemaining,
    tidyMessage: tidyMessage,
    availableActions: availableActions,
    KLIPPY_DOWN_OFFER_MS: KLIPPY_DOWN_OFFER_MS,
    clearKlippyDown: clearKlippyDown,
    SEND_DEDUP_MS: SEND_DEDUP_MS,
    claimSend: claimSend,
    releaseSend: releaseSend,
    canRestartKlipper: canRestartKlipper,
    buildServiceInfoArgs: buildServiceInfoArgs,
    parseServiceInfo: parseServiceInfo,
    planServiceInfo: planServiceInfo,
    acceptServiceInfo: acceptServiceInfo,
    canRestartFirmware: canRestartFirmware,
    actionsFor: actionsFor,
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
    rawPrinters: rawPrinters,
    addPrinterToList: addPrinterToList,
    removePrinterFromList: removePrinterFromList,
    buildSaveArgs: buildSaveArgs,
    parseSaveResult: parseSaveResult,
    buildNetsArgs: buildNetsArgs,
    parseLocalNets: parseLocalNets,
    buildMdnsArgs: buildMdnsArgs,
    parseMdns: parseMdns,
    buildScanArgs: buildScanArgs,
    parseScan: parseScan,
    buildReverseArgs: buildReverseArgs,
    parseReverse: parseReverse,
    buildHostnameArgs: buildHostnameArgs,
    parseHostname: parseHostname,
    parseMoonrakerCheck: parseMoonrakerCheck,
    emptyDiscovery: emptyDiscovery,
    startDiscovery: startDiscovery,
    acceptNets: acceptNets,
    acceptMdns: acceptMdns,
    acceptScan: acceptScan,
    acceptReverse: acceptReverse,
    acceptHostname: acceptHostname,
    acceptDiscoveryOutput: acceptDiscoveryOutput,
    cancelDiscovery: cancelDiscovery,
    expireDiscovery: expireDiscovery,
    discoveryDone: discoveryDone,
    isFoundAdded: isFoundAdded,
    foundAddress: foundAddress,
    emptyForm: emptyForm,
    submitForm: submitForm,
    acceptCheck: acceptCheck,
    acceptFormHostname: acceptFormHostname,
    addAnyway: addAnyway,
    acceptFormOutput: acceptFormOutput,
    checkingText: checkingText,
    formAfterSave: formAfterSave,
    panelStops: panelStops,
    buildSetupModel: buildSetupModel,
    setupCursorStops: setupCursorStops,
    DISCOVERY_TIMEOUT_MS: DISCOVERY_TIMEOUT_MS,
    SAVE_TIMEOUT_MS: SAVE_TIMEOUT_MS,
    stepCursor: stepCursor
  }
}
