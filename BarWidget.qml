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
      requestComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, guardMs: config.timeoutMs + 1000 })
    }
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
    var plan = Model.planCommand(commands, printer, statuses[key], action, config.timeoutMs, Date.now())
    commands = plan.commands
    var r = plan.request
    if (r && r.args.length > 0) {
      // Its effect must not come back as a notification, whichever bar reads it.
      Shared.state.protections = Model.protectStart(Shared.state.protections, r.key)
      commandComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, guardMs: r.guardMs })
    }
  }

  // Success or failure, the printer is asked again right away so the panel
  // shows what the command did without waiting for the next cycle.
  function acceptCommand(key, seq, result) {
    Shared.state.protections = Model.protectFinish(Shared.state.protections, key, Date.now())
    commands = Model.acceptCommandResult(commands, key, seq, result)
    statuses = Model.requestFollowUp(statuses, key)
    dispatch(key)
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
  onConfigChanged: syncConfig()
  Component.onCompleted: {
    registerSelf()
    syncConfig()
    probeNotify()
  }
  Component.onDestruction: {
    unregisterSelf()
    stopRequests(false)
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
        if (exited && drained) complete(Model.parseResponse(output, exitCode))
      }

      Process {
        id: proc
        command: request.args
        running: true
        onStarted: request.launched = true
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
    id: commandComponent

    // One printer action (POST). Same lifecycle as a query: exactly one
    // result reaches Model.acceptCommandResult, from curl or from the guard.
    Item {
      id: job
      required property string key
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
        if (exited && drained) complete(Model.parseActionResponse(output, exitCode))
      }

      Process {
        id: commandProc
        command: job.args
        running: true
        onStarted: job.launched = true
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
