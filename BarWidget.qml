pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

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

  function syncConfig() {
    statuses = Model.reconcileStatuses(statuses, config.printers)
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
    var plan = Model.planDispatch(statuses, config.printers, config.timeoutMs)
    statuses = plan.statuses
    for (var i = 0; i < plan.requests.length; i++) {
      var r = plan.requests[i]
      requestComponent.createObject(requestHolder, { key: r.key, seq: r.seq, args: r.args, guardMs: config.timeoutMs + 1000 })
    }
  }

  function accept(key, seq, reading) {
    statuses = Model.acceptResult(statuses, key, seq, reading, Date.now())
  }

  function stopRequests(onlyMissing) {
    var list = requestHolder.children
    for (var i = list.length - 1; i >= 0; i--) {
      if (!onlyMissing || !(list[i].key in statuses)) list[i].stop()
    }
  }

  // ---- Panel. Shape contract for shell summon/hide/toggle routing:
  //      Bar.findPanelWidget requires open/close/opened on the bar-widget root.
  property string selectedKey: ""
  property real now: Date.now()
  readonly property var panelModel: Model.buildPanelModel(config.printers, statuses, selectedKey, now)
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
  }

  function panelOpened() {
    now = Date.now()
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
  Component.onCompleted: syncConfig()
  Component.onDestruction: stopRequests(false)

  Timer {
    interval: root.config.intervalMs
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.refresh()
  }

  // Keeps "atualizado há …" honest while the panel is open.
  Timer {
    interval: 15000
    repeat: true
    running: root.opened
    onTriggered: root.now = Date.now()
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
        onTriggered: request.complete({ reachable: false, errorMessage: "sem resposta (tempo limite)" })
      }
    }
  }

  IpcHandler {
    target: "io.github.brunorzm.omaklippy"

    function refresh(): void { root.broadcast("refresh") }
  }

  readonly property var iconState: Model.buildIconState(config.printers, statuses)
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
