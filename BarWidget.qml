pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Shared.js" as Shared

// 3D printer status for the bar: one icon, details in a panel on click.
//
// The widget owns the polling: every cycle Model.planDispatch picks which
// printers to ask, each request is a short-lived curl Process with its own
// guard timer, and Model.acceptResult decides what a result changes. The QML
// here only runs processes and timers; no status decision is made in it.
BarWidget {
  id: root
  moduleName: "io.github.brunorzm.omaklippy"

  readonly property var config: Model.readSettings(root.settings)
  // { [printerKey]: PrinterStatus }, always replaced, never mutated, so
  // bindings on it re-evaluate.
  property var statuses: ({})
  // { [printerKey]: PrinterCommands }: running pause/resume/cancel and
  // emergency-stop commands plus the last failure, replaced like statuses.
  property var commands: ({})
  // { [printerKey]: Watch }: this instance's view of each printer for the
  // notifications (Model.observe). Every instance keeps its own, so another
  // one can take over sending when this bar goes away.
  property var watches: ({})
  // This instance in Shared.state.registry; the first live one sends.
  property int instanceId: 0

  function syncConfig() {
    statuses = Model.reconcileStatuses(statuses, config.printers)
    syncLives()
    commands = Model.reconcileCommands(commands, config.printers)
    watches = Model.reconcileWatches(watches, config.printers)
    // A removed printer drops the manual choice for good, so it does not
    // come back if an entry with the same key is added later.
    if (selectedKey !== "" && Model.resolveSelection(selectedKey, config.printers, statuses) !== selectedKey)
      selectedKey = ""
    // Requests for printers that left the config are dropped; new ones are
    // asked right away instead of waiting a full interval.
    stopRequests(true)
    refresh()
  }

  function refresh() {
    dispatch("")
  }

  // onlyKey "" asks every printer; a key asks just that one (after a
  // printer command). Printers with a query in flight are skipped.
  function dispatch(onlyKey) {
    var plan = Model.planDispatch(statuses, config.printers, config.timeoutMs, onlyKey, Date.now())
    statuses = plan.statuses
    for (var i = 0; i < plan.requests.length; i++) {
      var r = plan.requests[i]
      requestComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, stdin: r.stdin || "", guardMs: config.timeoutMs + 1000 })
    }
    sideFetches()
  }

  // Lookups driven by the status itself, after a poll or a live update.
  function sideFetches() {
    // The slicer's estimate, once per print (Model.planEstimate).
    var est = Model.planEstimate(statuses, config.printers, config.timeoutMs)
    statuses = est.statuses
    for (var j = 0; j < est.requests.length; j++) {
      var e = est.requests[j]
      estimateComponent.createObject(requestHolder, { key: e.key, seq: e.seq, filename: e.filename, args: e.args, stdin: e.stdin || "", guardMs: config.timeoutMs + 1000 })
    }
    // The Klipper service's name, once per disconnection (Model.planServiceInfo).
    var svc = Model.planServiceInfo(statuses, config.printers, config.timeoutMs)
    statuses = svc.statuses
    for (var k = 0; k < svc.requests.length; k++) {
      var s = svc.requests[k]
      serviceInfoComponent.createObject(requestHolder, { key: s.key, seq: s.seq, args: s.args, stdin: s.stdin || "", guardMs: config.timeoutMs + 1000 })
    }
  }

  function acceptServiceInfo(key, seq, name) {
    statuses = Model.acceptServiceInfo(statuses, key, seq, name)
  }

  function acceptEstimate(key, seq, filename, seconds, layerCount) {
    statuses = Model.acceptEstimate(statuses, key, seq, filename, seconds, layerCount)
  }

  function accept(key, seq, reading) {
    var before = statuses
    statuses = Model.acceptResult(statuses, key, seq, reading, Date.now())
    if (statuses !== before) observe(key)
    // This answer may predate a command that finished meanwhile.
    if (statuses[key] && statuses[key].followUp === true) dispatch(key)
  }

  // ---- Notifications

  function observe(key) {
    var prot = Shared.state.protections
    var r = Model.observe(watches[key], statuses[key], Model.isProtected(prot, key, instanceId))
    Shared.state.protections = Model.releaseProtection(prot, key, statuses[key].requestedAt, instanceId, Shared.state.registry)
    var next = Object.assign({}, watches)
    next[key] = r.watch
    watches = next
    if (!Model.isLeader(Shared.state.registry, instanceId)) return
    var events = Model.filterEvents(r.events, config.notify)
    for (var i = 0; i < events.length; i++) sendNotification(key, events[i])
  }

  function displayNameOf(key) {
    for (var i = 0; i < config.printers.length; i++)
      if (config.printers[i].key === key) return config.printers[i].displayName
    return ""
  }

  function sendNotification(key, event) {
    var n = Model.buildNotification(event, displayNameOf(key))
    if (n) notifyComponent.createObject(requestHolder, { args: n.args, guardMs: Model.NOTIFY_TIMEOUT_SEC * 1000 })
  }

  function acceptNotify(result) {
    Shared.state.notify = { available: result.ok, message: result.message }
    refreshNotifyWarning()
  }

  // Shared.js is not reactive: the panel reads a copy, refreshed when it
  // opens, every 15 s while open, and after each send.
  property string notifyWarningText: ""
  function refreshNotifyWarning() {
    notifyWarningText = Model.notifyWarning(Shared.state.notify)
  }

  // A missing notify-send shows up in the panel before the first event.
  function probeNotify() {
    var n = config.notify
    if (!Model.isLeader(Shared.state.registry, instanceId)) return
    if (!(n.complete || n.failed || n.paused || n.lostContact)) return
    notifyComponent.createObject(requestHolder, { args: ["notify-send", "--version"], guardMs: Model.NOTIFY_TIMEOUT_SEC * 1000 })
  }

  function registerSelf() {
    var r = Model.registerInstance(Shared.state.registry)
    Shared.state.registry = r.registry
    instanceId = r.id
  }

  function unregisterSelf() {
    Shared.state.registry = Model.unregisterInstance(Shared.state.registry, instanceId)
  }

  // Sends one printer action. key is the printer the panel showed when the
  // user acted, so the target never shifts under a confirmation.
  function runAction(key, action) {
    var printer = null
    for (var i = 0; i < config.printers.length; i++)
      if (config.printers[i].key === key) printer = config.printers[i]
    var now = Date.now()
    var plan = Model.planCommand(commands, printer, statuses[key], action, config.timeoutMs, now)
    var r = plan.request
    if (!r || r.args.length === 0) return
    // Another bar (another monitor) may have just sent the same command.
    var claim = Model.claimSend(Shared.state.sends, key, action, now)
    if (!claim.ok) return
    Shared.state.sends = claim.sends
    commands = plan.commands
    // Its effect must not come back as a notification, whichever bar reads it.
    Shared.state.protections = Model.protectStart(Shared.state.protections, r.key)
    commandComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, stdin: r.stdin || "", guardMs: r.guardMs })
  }

  // Success or failure, the printer is asked again right away so the panel
  // shows what the command did without waiting for the next cycle.
  function acceptCommand(key, seq, result) {
    Shared.state.protections = Model.protectFinish(Shared.state.protections, key, Date.now())
    // A restarted Klipper service passes through 503 again while it starts:
    // count the disconnection anew so the button does not come straight back.
    var c = commands[key]
    var running = c && c.busy && c.busy.seq === seq ? c.busy : (c && c.estop && c.estop.seq === seq ? c.estop : null)
    if (running && !result.ok) Shared.state.sends = Model.releaseSend(Shared.state.sends, key, running.action)
    if (result.ok && running && running.action === "klipperRestart")
      statuses = Model.clearKlippyDown(statuses, key)
    commands = Model.acceptCommandResult(commands, key, seq, result)
    // A live printer shows the command's effect through its connection.
    var after = Model.afterCommand(statuses, key)
    statuses = after.statuses
    if (after.dispatch) dispatch(key)
  }

  // Opens the printer's web UI in the default browser. Nothing is sent to
  // the printer; the launcher runs in its own slot, beside any command.
  function openWebUi(key) {
    var printer = null
    for (var i = 0; i < config.printers.length; i++)
      if (config.printers[i].key === key) printer = config.printers[i]
    var plan = Model.planOpenWeb(commands, printer, Date.now())
    commands = plan.commands
    var r = plan.request
    if (r && r.args.length > 0)
      webLaunchComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, guardMs: r.guardMs })
  }

  // The panel closes only once the launcher exits cleanly, so a failure
  // can still be shown in it. No follow-up query: the printer did not change.
  function acceptWebLaunch(key, seq, result) {
    commands = Model.acceptCommandResult(commands, key, seq, result)
    if (result.ok && opened) close()
  }

  // Stops status queries, printer commands and web UI launches alike; all
  // live in requestHolder and carry their printer key.
  function stopRequests(onlyMissing) {
    var list = requestHolder.children
    for (var i = list.length - 1; i >= 0; i--) {
      // Notifications (key "") are not tied to a printer: a config change
      // must not cut one short.
      if (!onlyMissing || (list[i].key !== "" && !(list[i].key in statuses))) list[i].stop()
    }
  }

  // ---- Panel. Shape contract for shell summon/hide/toggle routing:
  //      Bar.findPanelWidget requires open/close/opened on the bar-widget root.
  property string selectedKey: ""
  property real now: Date.now()
  readonly property var panelModel: Model.buildPanelModel(config.printers, statuses, selectedKey, now, commands, notifyWarningText)
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  // Forwarded so this widget can stand in for the panel as the bar's popout
  // identity: Bar.requestPopout prefers closeForPopoutSwitch over close, and
  // KeyboardPanel reads popoutSwitchClosing back off its owner.
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  // Session-only: never written to shell.json.
  function selectPrinter(key) {
    selectedKey = String(key || "")
    commands = Model.clearFailures(commands)
  }

  function panelOpened() {
    now = Date.now()
    refreshNotifyWarning()
    refreshEditable()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()
  onSettingsChanged: injectPanel()
  onStatusesChanged: if (opened) now = Date.now()
  onConfigChanged: {
    syncConfig()
    applyPendingSelection()
  }
  Component.onCompleted: {
    registerSelf()
    syncConfig()
    probeNotify()
  }
  Component.onDestruction: {
    unregisterSelf()
    stopRequests(false)
    stopAll(discoveryHolder)
    stopAll(formHolder)
    stopAll(saveHolder)
  }

  Timer {
    interval: root.config.intervalMs
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Keeps "updated … ago" honest while the panel is open.
  Timer {
    interval: 15000
    repeat: true
    running: root.opened
    onTriggered: {
      root.now = Date.now()
      root.refreshNotifyWarning()
    }
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  Item {
    id: requestHolder
    visible: false
  }

  Component {
    id: requestComponent

    // One Moonraker query. Finishes once both the exit code and the full
    // stdout are in, or when the guard fires first; either way exactly one
    // result reaches Model.acceptResult.
    Item {
      id: request
      required property string key
      // "X-Api-Key: …" for a printer with an API key (slice 011), written to
      // curl's stdin ("-H @-") and closed at once; "" for the others.
      property string stdin: ""
      required property int seq
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false
      property bool exited: false
      property bool drained: false
      property int exitCode: -1
      property string output: ""

      function complete(reading) {
        if (finished) return
        finished = true
        guard.stop()
        proc.running = false
        root.accept(key, seq, reading)
        request.destroy()
      }

      function stop() {
        finished = true
        guard.stop()
        proc.running = false
        request.destroy()
      }

      function tryComplete() {
        if (exited && drained) complete(Model.parseResponse(output, exitCode, stdin !== ""))
      }

      Process {
        id: proc
        command: request.args
        stdinEnabled: request.stdin !== ""
        running: true
        onStarted: {
          request.launched = true
          if (request.stdin !== "") {
            write(request.stdin)
            stdinEnabled = false
          }
        }
        // A binary that cannot be executed never emits started/exited: the
        // Process just drops back to not running (checked on Quickshell with
        // a missing command). Report it as the missing-curl case instead of
        // waiting for the guard to call it a timeout.
        onRunningChanged: {
          if (!running && !request.launched && !request.finished)
            request.complete(Model.parseResponse("", -1))
        }
        stdout: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            request.output = String(text || "")
            request.drained = true
            request.tryComplete()
          }
        }
        onExited: function(exitCode) {
          request.exitCode = exitCode
          request.exited = true
          request.tryComplete()
        }
      }

      Timer {
        id: guard
        interval: request.guardMs
        running: true
        // Same outcome as curl giving up on its own (exit 28).
        onTriggered: request.complete(Model.parseResponse("", 28))
      }
    }
  }

  Component {
    id: estimateComponent

    // One metadata GET for the slicer's estimate. Same lifecycle as a status
    // query: exactly one result, from curl or from the guard.
    Item {
      id: fetch
      required property string key
      // "X-Api-Key: …" for a printer with an API key (slice 011), written to
      // curl's stdin ("-H @-") and closed at once; "" for the others.
      property string stdin: ""
      required property int seq
      required property string filename
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false
      property bool exited: false
      property bool drained: false
      property int exitCode: -1
      property string output: ""

      function complete(seconds, layerCount) {
        if (finished) return
        finished = true
        fetchGuard.stop()
        fetchProc.running = false
        root.acceptEstimate(key, seq, filename, seconds, layerCount)
        fetch.destroy()
      }

      function stop() {
        finished = true
        fetchGuard.stop()
        fetchProc.running = false
        fetch.destroy()
      }

      function tryComplete() {
        if (exited && drained) complete(Model.parseMetadataResponse(output, exitCode), Model.parseMetadataLayers(output, exitCode))
      }

      Process {
        id: fetchProc
        command: fetch.args
        stdinEnabled: fetch.stdin !== ""
        running: true
        onStarted: {
          fetch.launched = true
          if (fetch.stdin !== "") {
            write(fetch.stdin)
            stdinEnabled = false
          }
        }
        onRunningChanged: {
          if (!running && !fetch.launched && !fetch.finished) fetch.complete(null)
        }
        stdout: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            fetch.output = String(text || "")
            fetch.drained = true
            fetch.tryComplete()
          }
        }
        onExited: function(exitCode) {
          fetch.exitCode = exitCode
          fetch.exited = true
          fetch.tryComplete()
        }
      }

      Timer {
        id: fetchGuard
        interval: fetch.guardMs
        running: true
        onTriggered: fetch.complete(null)
      }
    }
  }

  Component {
    id: serviceInfoComponent

    // One GET /machine/system_info for the Klipper service's name. Same
    // lifecycle as the metadata fetch: exactly one result.
    Item {
      id: info
      required property string key
      // "X-Api-Key: …" for a printer with an API key (slice 011), written to
      // curl's stdin ("-H @-") and closed at once; "" for the others.
      property string stdin: ""
      required property int seq
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false
      property bool exited: false
      property bool drained: false
      property int exitCode: -1
      property string output: ""

      function complete(name) {
        if (finished) return
        finished = true
        infoGuard.stop()
        infoProc.running = false
        root.acceptServiceInfo(key, seq, name)
        info.destroy()
      }

      function stop() {
        finished = true
        infoGuard.stop()
        infoProc.running = false
        info.destroy()
      }

      function tryComplete() {
        if (exited && drained) complete(Model.parseServiceInfo(output, exitCode))
      }

      Process {
        id: infoProc
        command: info.args
        stdinEnabled: info.stdin !== ""
        running: true
        onStarted: {
          info.launched = true
          if (info.stdin !== "") {
            write(info.stdin)
            stdinEnabled = false
          }
        }
        onRunningChanged: {
          if (!running && !info.launched && !info.finished) info.complete(null)
        }
        stdout: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            info.output = String(text || "")
            info.drained = true
            info.tryComplete()
          }
        }
        onExited: function(exitCode) {
          info.exitCode = exitCode
          info.exited = true
          info.tryComplete()
        }
      }

      Timer {
        id: infoGuard
        interval: info.guardMs
        running: true
        onTriggered: info.complete(null)
      }
    }
  }

  Component {
    id: commandComponent

    // One printer action (POST). Same lifecycle as a query: exactly one
    // result reaches Model.acceptCommandResult, from curl or from the guard.
    Item {
      id: job
      required property string key
      // "X-Api-Key: …" for a printer with an API key (slice 011), written to
      // curl's stdin ("-H @-") and closed at once; "" for the others.
      property string stdin: ""
      required property int seq
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false
      property bool exited: false
      property bool drained: false
      property int exitCode: -1
      property string output: ""

      function complete(result) {
        if (finished) return
        finished = true
        commandGuard.stop()
        commandProc.running = false
        root.acceptCommand(key, seq, result)
        job.destroy()
      }

      // Cut short (config change, widget going away): no result comes, but
      // the protection it opened must still end.
      function stop() {
        finished = true
        commandGuard.stop()
        commandProc.running = false
        Shared.state.protections = Model.protectFinish(Shared.state.protections, key, Date.now())
        job.destroy()
      }

      function tryComplete() {
        if (exited && drained) complete(Model.parseActionResponse(output, exitCode, stdin !== ""))
      }

      Process {
        id: commandProc
        command: job.args
        stdinEnabled: job.stdin !== ""
        running: true
        onStarted: {
          job.launched = true
          if (job.stdin !== "") {
            write(job.stdin)
            stdinEnabled = false
          }
        }
        onRunningChanged: {
          if (!running && !job.launched && !job.finished)
            job.complete(Model.parseActionResponse("", -1))
        }
        stdout: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            job.output = String(text || "")
            job.drained = true
            job.tryComplete()
          }
        }
        onExited: function(exitCode) {
          job.exitCode = exitCode
          job.exited = true
          job.tryComplete()
        }
      }

      Timer {
        id: commandGuard
        interval: job.guardMs
        running: true
        onTriggered: job.complete(Model.parseActionResponse("", 28))
      }
    }
  }

  Component {
    id: webLaunchComponent

    // One omarchy-launch-browser run. It exits as soon as the browser's
    // systemd unit is up, so only a missing or hung launcher is caught here
    // (research R1). Exactly one result reaches acceptWebLaunch.
    Item {
      id: launch
      required property string key
      required property int seq
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false

      function complete(result) {
        if (finished) return
        finished = true
        launchGuard.stop()
        launchProc.running = false
        root.acceptWebLaunch(key, seq, result)
        launch.destroy()
      }

      function stop() {
        finished = true
        launchGuard.stop()
        launchProc.running = false
        launch.destroy()
      }

      Process {
        id: launchProc
        command: launch.args
        running: true
        onStarted: launch.launched = true
        onRunningChanged: {
          if (!running && !launch.launched && !launch.finished)
            launch.complete(Model.parseWebLaunchResult(-1, false))
        }
        onExited: function(exitCode) {
          launch.complete(Model.parseWebLaunchResult(exitCode, true))
        }
      }

      Timer {
        id: launchGuard
        interval: launch.guardMs
        running: true
        onTriggered: launch.complete(Model.parseWebLaunchResult(-2, true))
      }
    }
  }

  Component {
    id: notifyComponent

    // One notify-send run; exactly one result reaches acceptNotify.
    Item {
      id: note
      readonly property string key: ""
      required property var args
      required property int guardMs

      property bool finished: false
      property bool launched: false

      function complete(result) {
        if (finished) return
        finished = true
        noteGuard.stop()
        noteProc.running = false
        root.acceptNotify(result)
        note.destroy()
      }

      function stop() {
        finished = true
        noteGuard.stop()
        noteProc.running = false
        note.destroy()
      }

      Process {
        id: noteProc
        command: note.args
        running: true
        onStarted: note.launched = true
        onRunningChanged: {
          if (!running && !note.launched && !note.finished)
            note.complete(Model.parseNotifyResult(-1, false))
        }
        onExited: function(exitCode) {
          note.complete(Model.parseNotifyResult(exitCode, true))
        }
      }

      Timer {
        id: noteGuard
        interval: note.guardMs
        running: true
        onTriggered: note.complete(Model.parseNotifyResult(-2, true))
      }
    }
  }

  // ---- Printer setup (slice 009). The shell saves the list (Model.buildSaveArgs);
  //      the search and the add-by-address form are Model state machines whose
  //      requests run here as processes, each in its own holder so a config
  //      change (stopRequests) never cuts them short.
  property var discovery: Model.emptyDiscovery()
  property var form: Model.emptyForm()
  // { busy, message }: one save at a time; message is the last failure.
  property var saveState: ({ busy: false, message: "" })
  property int saveSeq: 0
  // The printer to select once the saved list comes back through settings,
  // and the one the running save adds (pendingSelectKey is cleared as soon
  // as the list arrives, which can be before the shell answers).
  property string pendingSelectKey: ""
  property string saveSelectKey: ""
  // false when this widget is on its bar more than once: the shell saves the
  // first entry, which may not be this one (research R1).
  property bool editable: true
  // The API key field of the selected printer is open (slice 011), and the
  // reason a key was not saved.
  property bool keyEditing: false
  property string keyMessage: ""
  readonly property var setupModel: Model.buildSetupModel(config.printers, discovery, form,
    panelModel.selected ? panelModel.selected.key : "", editable, saveState.message, keyEditing)

  // A successful save; selectKey is the added printer ("" after a removal).
  signal printersSaved(string selectKey)

  // The bar window this instance sits in: moduleWidgets lists every live
  // instance, one per monitor, so only those in the same window count.
  readonly property var hostWindow: Window.window

  function refreshEditable() {
    var items = root.bar && typeof root.bar.moduleWidgets === "function" ? root.bar.moduleWidgets(root.moduleName) : []
    var here = 0
    for (var i = 0; i < items.length; i++) if (items[i] && items[i].hostWindow === root.hostWindow) here++
    editable = here <= 1
  }

  function stopAll(holder) {
    var list = holder.children
    for (var i = list.length - 1; i >= 0; i--) list[i].stop()
  }

  function run(holder, sink, requests) {
    for (var i = 0; i < requests.length; i++) {
      var r = requests[i]
      // Nothing to run counts as a binary that never started, so the
      // machine still gets its one answer.
      if (r.args.length === 0) {
        acceptProcess(sink, r.kind, r.seq, r.ip || "", "", "", -1, false)
        continue
      }
      processComponent.createObject(holder, { sink: sink, kind: r.kind, seq: r.seq, ip: r.ip || "", args: r.args, stdin: r.stdin || "", guardMs: r.guardMs })
    }
  }

  // Every setup process ends here, exactly once.
  function acceptProcess(sink, kind, seq, ip, stdout, stderr, exitCode, launched) {
    if (sink === "discovery") {
      var d = Model.acceptDiscoveryOutput(discovery, kind, seq, ip, stdout, exitCode, launched, config.printers)
      discovery = d.discovery
      run(discoveryHolder, "discovery", d.requests)
      if (discovery.state !== "running") discoveryGuard.stop()
    } else if (sink === "form") {
      var f = Model.acceptFormOutput(form, kind, seq, stdout, exitCode)
      form = f.form
      if (f.request) run(formHolder, "form", [f.request])
      saveFormIfReady()
    } else if (sink === "save") {
      acceptSave(seq, Model.parseSaveResult(stdout, exitCode, launched, stderr))
    }
  }

  function startDiscovery() {
    if (!editable) return
    stopAll(discoveryHolder)
    var r = Model.startDiscovery(discovery, Date.now(), config.timeoutMs / 1000)
    discovery = r.discovery
    run(discoveryHolder, "discovery", r.requests)
    discoveryGuard.restart()
  }

  function cancelDiscovery() {
    stopAll(discoveryHolder)
    discoveryGuard.stop()
    if (discovery.state === "running") discovery = Model.cancelDiscovery(discovery)
  }

  // Closing the panel: the search stops and the form starts over next time.
  function resetSetup() {
    cancelDiscovery()
    stopAll(formHolder)
    form = Model.emptyForm()
    if (!saveState.busy) saveState = { busy: false, message: "" }
    keyEditing = false
    keyMessage = ""
  }

  function savePrinters(list, selectKey) {
    if (saveState.busy || !editable) return false
    saveSeq += 1
    pendingSelectKey = String(selectKey || "")
    saveSelectKey = pendingSelectKey
    saveState = { busy: true, message: "" }
    run(saveHolder, "save", [{ kind: "save", seq: saveSeq, args: Model.buildSaveArgs(list), guardMs: Model.SAVE_TIMEOUT_MS }])
    return true
  }

  function acceptSave(seq, result) {
    if (seq !== saveSeq) return
    saveState = { busy: false, message: result.ok ? "" : Model.fill(Model.TEXT.setup.saveFailed, result.message) }
    form = Model.formAfterSave(form, result.ok, "")
    if (!result.ok) {
      pendingSelectKey = ""
      return
    }
    // The new list may already be here (the shell tells the widgets before
    // its IPC answer arrives, as seen live) or come right after.
    applyPendingSelection()
    printersSaved(saveSelectKey)
  }

  function applyPendingSelection() {
    if (pendingSelectKey === "") return
    for (var i = 0; i < config.printers.length; i++) {
      if (config.printers[i].key === pendingSelectKey) {
        selectPrinter(pendingSelectKey)
        pendingSelectKey = ""
        return
      }
    }
  }

  function addFound(ip) {
    var found = null
    for (var i = 0; i < discovery.found.length; i++) if (discovery.found[i].ip === ip) found = discovery.found[i]
    if (!found || found.added) return
    var r = Model.addPrinterToList(Model.rawPrinters(root.settings), Model.foundAddress(found), found.name)
    if (r.error) saveState = { busy: false, message: Model.fill(Model.TEXT.setup.saveFailed, r.error) }
    else savePrinters(r.list, r.key)
  }

  function submitForm(address, name, apiKey) {
    if (!editable || form.state === "saving") return
    stopAll(formHolder)
    var r = Model.submitForm(form, Model.rawPrinters(root.settings), address, name, config.timeoutMs / 1000, apiKey || "")
    form = r.form
    if (r.request) run(formHolder, "form", [r.request])
  }

  function addAnyway() {
    form = Model.addAnyway(form)
    saveFormIfReady()
  }

  function saveFormIfReady() {
    if (form.state !== "saving") return
    var r = Model.addPrinterToList(Model.rawPrinters(root.settings), form.address, form.name, form.apiKey || "")
    if (r.error) form = Model.formAfterSave(form, false, r.error)
    else if (!savePrinters(r.list, r.key)) form = Model.formAfterSave(form, false, "")
  }

  // key is the printer the setup screen showed; its place in the list is
  // what the raw list is cut by.
  function removePrinter(key) {
    for (var i = 0; i < config.printers.length; i++) {
      if (config.printers[i].key === key) {
        savePrinters(Model.removePrinterFromList(Model.rawPrinters(root.settings), config.printers[i].order), "")
        return
      }
    }
  }

  // Sets (text) or removes ("") the API key of the printer key, through the
  // same save as adding and removing.
  function setApiKey(key, text) {
    for (var i = 0; i < config.printers.length; i++) {
      if (config.printers[i].key !== key) continue
      var r = Model.setPrinterApiKey(Model.rawPrinters(root.settings), config.printers[i].order, text)
      if (r.error) {
        keyMessage = r.error
        return
      }
      keyMessage = ""
      if (savePrinters(r.list, "")) keyEditing = false
      return
    }
  }

  function removeApiKey(key) {
    setApiKey(key, "")
  }

  // The 30 s guard of the search (Model.expireDiscovery).
  Timer {
    id: discoveryGuard
    interval: Model.DISCOVERY_TIMEOUT_MS + 100
    onTriggered: {
      root.discovery = Model.expireDiscovery(root.discovery, Date.now())
      if (root.discovery.state !== "running") root.stopAll(discoveryHolder)
    }
  }

  Item {
    id: discoveryHolder
    visible: false
  }

  Item {
    id: formHolder
    visible: false
  }

  Item {
    id: saveHolder
    visible: false
  }

  Component {
    id: processComponent

    // One setup process (search, form check or save). Collects stdout and
    // stderr, and hands exactly one result to acceptProcess: from the exit,
    // from a binary that never started (launched false) or from the guard
    // (exit code -2).
    Item {
      id: step
      required property string sink
      required property string kind
      required property int seq
      required property string ip
      required property var args
      required property int guardMs
      // "X-Api-Key: …" for a form check with an API key; "" otherwise.
      property string stdin: ""

      property bool finished: false
      property bool launched: false
      property bool exited: false
      property bool drainedOut: false
      property bool drainedErr: false
      property int exitCode: -1
      property string output: ""
      property string errors: ""

      function complete(exitCode, launched) {
        if (finished) return
        finished = true
        stepGuard.stop()
        stepProc.running = false
        root.acceptProcess(sink, kind, seq, ip, output, errors, exitCode, launched)
        step.destroy()
      }

      function stop() {
        finished = true
        stepGuard.stop()
        stepProc.running = false
        step.destroy()
      }

      function tryComplete() {
        if (exited && drainedOut && drainedErr) complete(exitCode, true)
      }

      Process {
        id: stepProc
        command: step.args
        stdinEnabled: step.stdin !== ""
        running: true
        onStarted: {
          step.launched = true
          if (step.stdin !== "") {
            write(step.stdin)
            stdinEnabled = false
          }
        }
        onRunningChanged: {
          if (!running && !step.launched && !step.finished) step.complete(-1, false)
        }
        stdout: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            step.output = String(text || "")
            step.drainedOut = true
            step.tryComplete()
          }
        }
        stderr: StdioCollector {
          waitForEnd: true
          onStreamFinished: {
            step.errors = String(text || "")
            step.drainedErr = true
            step.tryComplete()
          }
        }
        onExited: function(exitCode) {
          step.exitCode = exitCode
          step.exited = true
          step.tryComplete()
        }
      }

      Timer {
        id: stepGuard
        interval: step.guardMs
        running: true
        onTriggered: step.complete(-2, true)
      }
    }
  }

  // ---- Live status (slice 010): one connection per printer and per bar
  //      (LiveConnection.qml), driven by Model's live machine. A printer is
  //      polled only while it is not live.
  property var lives: ({})
  // "key|url" per connection: the Repeater model, changed only when the set
  // of connections does (lives itself changes with every message).
  property var liveIds: []
  // { key: LiveConnection } for the loaded connections; not reactive.
  property var liveItems: ({})
  // The QtWebSockets module is missing: polling only, with a notice.
  property bool liveUnavailable: false
  readonly property string liveWarningText: Model.liveWarning(liveUnavailable)

  function syncLives() {
    lives = Model.reconcileLives(lives, config.printers)
    var ids = []
    for (var key in lives) ids.push(key + "|" + lives[key].url)
    if (ids.join("\n") !== liveIds.join("\n")) liveIds = ids
  }

  function runLiveActions(actions) {
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i]
      var item = liveItems[a.key]
      if (!item) continue
      if (a.type === "open") {
        item.url = lives[a.key] ? lives[a.key].url : ""
        item.open()
      } else if (a.type === "send") item.send(a.text)
      else if (a.type === "ping") item.ping()
      else if (a.type === "close") item.stop()
    }
  }

  // The printer stopped being live: poll it at once instead of waiting.
  function leaveLive(key) {
    statuses = Model.leaveLive(statuses, key)
    dispatch(key)
  }

  function flushLive(key, force) {
    var f = Model.liveFlush(lives, key, force)
    lives = f.lives
    if (!f.reading) return
    var before = statuses
    statuses = Model.acceptLive(statuses, key, f.reading, Date.now())
    if (statuses !== before) observe(key)
    sideFetches()
  }

  function liveOpened(key) {
    var r = Model.liveOpened(lives, key, Date.now())
    lives = r.lives
    runLiveActions(r.actions)
  }

  function liveMessage(key, text) {
    var r = Model.liveMessage(lives, key, Model.parseLiveMessage(text), Date.now())
    lives = r.lives
    runLiveActions(r.actions)
    if (r.left) leaveLive(key)
    flushLive(key, false)
  }

  function livePong(key) {
    lives = Model.livePong(lives, key, Date.now()).lives
  }

  function liveClosed(key) {
    var r = Model.liveClosed(lives, key, Date.now())
    lives = r.lives
    if (r.left) leaveLive(key)
  }

  // Opens what is due, pings, gives up on silent connections and hands over
  // what arrived in the last second.
  Timer {
    interval: 1000
    repeat: true
    running: !root.liveUnavailable && root.liveIds.length > 0
    onTriggered: {
      var r = Model.liveTick(root.lives, Date.now())
      root.lives = r.lives
      root.runLiveActions(r.actions)
      for (var i = 0; i < r.left.length; i++) root.leaveLive(r.left[i])
      for (var key in root.lives) root.flushLive(key, true)
    }
  }

  Item {
    id: liveHolder
    visible: false

    Repeater {
      model: root.liveUnavailable ? [] : root.liveIds

      Loader {
        id: liveLoader
        required property string modelData
        readonly property string key: modelData.slice(0, modelData.lastIndexOf("|"))
        source: Qt.resolvedUrl("LiveConnection.qml")
        onStatusChanged: if (status === Loader.Error) root.liveUnavailable = true
        onLoaded: root.liveItems[key] = item
        Component.onDestruction: {
          if (root.liveItems[key] === item) delete root.liveItems[key]
        }

        Connections {
          target: liveLoader.item
          ignoreUnknownSignals: true
          function onOpened() { root.liveOpened(liveLoader.key) }
          function onMessage(text) { root.liveMessage(liveLoader.key, text) }
          function onPonged() { root.livePong(liveLoader.key) }
          function onClosed(reason) { root.liveClosed(liveLoader.key) }
        }
      }
    }
  }

  IpcHandler {
    target: "io.github.brunorzm.omaklippy"

    function refresh(): void { root.broadcast("refresh") }
  }

  readonly property var iconState: Model.buildIconState(config.printers, statuses, selectedKey)
  readonly property bool showProgress: iconState.progress !== null
  // Relative opacities for the progress rail: the empty track, and the fill
  // while paused so it reads apart from an active print.
  readonly property real trackOpacity: 0.25
  readonly property real pausedFillOpacity: 0.45

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    tooltipText: root.iconState.tooltip
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.LeftButton) root.toggle()
    }
    dimmed: root.iconState.mode === "offline"

    readonly property color markColor: root.iconState.mode === "error" ? activeColor : foreground

    iconComponent: Component {
      Item {
        OpticalGlyph {
          anchors.fill: parent
          anchors.bottomMargin: root.showProgress ? Style.space(3) : 0
          text: Model.PRINTER_GLYPH
          fontFamily: button.fontFamily
          fontSize: root.showProgress ? button.fontSize * 0.9 : button.fontSize
          color: button.markColor
        }

        // Error badge: themes may pick an urgent color close to the bar
        // foreground, so error also gets a shape of its own.
        Rectangle {
          visible: root.iconState.mode === "error"
          anchors.right: parent.right
          anchors.top: parent.top
          width: Math.max(3, Style.space(5))
          height: width
          radius: width / 2
          color: button.markColor
          border.width: Math.max(1, Style.space(1))
          border.color: Color.bar.background
        }

        // Pause marker, in the error badge's corner (the states never meet):
        // with little progress the dimmed rail alone reads like printing.
        // Like the badge, it sits on a plate of the bar's background so the
        // two bars stay apart from the glyph.
        Rectangle {
          id: pauseMark
          visible: root.iconState.mode === "paused"
          anchors.right: parent.right
          anchors.top: parent.top
          readonly property real pad: Math.max(1, Style.space(1))
          readonly property real barWidth: Math.max(1, Style.space(1.5))
          width: barWidth * 3 + pad * 2
          height: Math.max(3, Style.space(5)) + pad * 2
          color: Color.bar.background

          Row {
            anchors.centerIn: parent
            spacing: pauseMark.barWidth

            Repeater {
              model: 2

              Rectangle {
                width: pauseMark.barWidth
                height: pauseMark.height - pauseMark.pad * 2
                color: button.markColor
              }
            }
          }
        }

        Item {
          visible: root.showProgress
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.bottom: parent.bottom
          height: Math.max(1, Style.space(2))

          Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: Util.alpha(button.markColor, root.trackOpacity)
          }

          Rectangle {
            width: parent.width * Math.max(0, Math.min(1, root.iconState.progress || 0))
            height: parent.height
            radius: height / 2
            color: button.markColor
            opacity: root.iconState.mode === "paused" ? root.pausedFillOpacity : 1
          }
        }
      }
    }
  }
}
