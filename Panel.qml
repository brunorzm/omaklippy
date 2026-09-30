pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Details for the selected printer. Loaded by BarWidget.qml, which owns the
// polling and hands over a ready Model.buildPanelModel result; nothing here
// computes state.
Panel {
  id: root
  moduleName: "io.github.brunorzm.omaklippy"
  manageIpc: false

  property var anchorItem: null
  // The bar tracks the widget mounted in its slot (BarWidget.qml), not this
  // nested panel, so popout coordination and panel switching go through it.
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property var panelModel: hostWidget && hostWidget.panelModel
    ? hostWidget.panelModel
    : ({ empty: true, selected: null, showJob: false, rows: [] })
  readonly property var selected: panelModel.selected || ({})

  readonly property var rows: panelModel.rows || []
  readonly property var actions: panelModel.actions || ({ buttons: [], primary: [], emergency: null, web: null, failureText: "", filename: "" })
  readonly property bool showActions: actions.buttons.length > 0 || actions.failureText !== ""
  // Keyboard stops: the printer dropdown, then every button that can be
  // pressed now (Model.cursorStops). j/k/h/l walk them, Enter activates;
  // while the dropdown is open it owns the keys.
  readonly property var stops: Model.cursorStops(panelModel)
  property string cursorStop: ""
  // Action waiting for confirmation, and the printer it was asked for: the
  // command goes to that printer even if the selection moves meanwhile
  // (the dialog then closes, see checkConfirm).
  property string confirmAction: ""
  property string confirmKey: ""
  // A button that cannot be pressed right now reads as dimmed.
  readonly property real disabledOpacity: 0.45
  // Same tint the native ConfirmDialog gives its destructive button.
  readonly property real emergencyFillAlpha: 0.22

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  function open() {
    if (hostWidget && hostWidget.panelOpened) hostWidget.panelOpened()
    cursorStop = ""
    cancelConfirm()
    // A menu left open by hide/summon would keep keyCatcher blocked.
    printerDropdown.close()
    root.controller.show()
  }

  function moveCursor(dx, dy) {
    cursorStop = Model.stepCursor(stops, cursorStop, (dx + dy) > 0 ? 1 : -1)
  }

  function activateCursor() {
    if (cursorStop === "printer") printerDropdown.open()
    else if (cursorStop !== "") activate(cursorStop)
  }

  function buttonFor(id) {
    var list = actions.buttons
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
    return null
  }

  // Clicks and Enter end here. Only a button that can be pressed now does
  // anything, and an action that needs confirmation is ignored until its
  // confirmation text exists.
  function activate(id) {
    var button = buttonFor(id)
    if (!button || stops.indexOf(id) < 0 || !hostWidget) return
    // Nothing goes to the printer: the widget opens its web UI and closes
    // the panel once the browser is on its way.
    if (id === "openWebUi") {
      hostWidget.openWebUi(selected.key)
      return
    }
    if (!button.confirm) {
      hostWidget.runAction(selected.key, id)
      return
    }
    if (Model.confirmLabel(id) === "") return
    // Back is preselected on every open, so Enter right away never confirms.
    confirm.selectedIndex = 0
    confirmKey = selected.key
    confirmAction = id
  }

  function cancelConfirm() {
    confirmAction = ""
    confirmKey = ""
  }

  function acceptConfirm() {
    var key = confirmKey
    var action = confirmAction
    cancelConfirm()
    if (hostWidget && key !== "" && action !== "") hostWidget.runAction(key, action)
  }

  // Nothing is sent when the confirmation outlives its reason: another
  // printer got selected (by hand or automatically), or the action can no
  // longer be pressed (the print ended, another command started).
  function checkConfirm() {
    if (confirmAction === "") return
    var button = buttonFor(confirmAction)
    if (selected.key !== confirmKey || !button || !button.enabled) cancelConfirm()
  }

  onPanelModelChanged: checkConfirm()
  // A button that went busy or away drops the keyboard highlight.
  onStopsChanged: if (cursorStop !== "" && stops.indexOf(cursorStop) < 0) cursorStop = ""

  function close() {
    cancelConfirm()
    printerDropdown.close()
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  component InfoRow: Item {
    id: infoRow
    property string label: ""
    property string value: ""

    width: parent ? parent.width : 0
    implicitHeight: Math.max(labelText.implicitHeight, valueText.implicitHeight)

    Text {
      id: labelText
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: infoRow.label
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    Text {
      id: valueText
      anchors.right: parent.right
      anchors.left: labelText.right
      anchors.leftMargin: Style.space(12)
      anchors.verticalCenter: parent.verticalCenter
      horizontalAlignment: Text.AlignRight
      elide: Text.ElideMiddle
      textFormat: Text.PlainText
      text: infoRow.value
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }
  }

  component ActionButton: Button {
    id: actionButton
    property var actionData: ({})

    text: actionData.label || ""
    iconText: actionData.busy ? Model.ACTION_GLYPHS.busy : (actionData.glyph || "")
    iconSpinning: actionData.busy === true
    enabled: actionData.enabled === true
    opacity: enabled || actionData.busy ? 1 : root.disabledOpacity
    bordered: true
    hasCursor: root.cursorStop !== "" && root.cursorStop === actionData.id
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    onClicked: root.activate(actionData.id)
    onHovered: function(isHovered) {
      if (isHovered && actionButton.enabled) root.cursorStop = actionData.id
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))

    // Keys the blocked keyCatcher leaves unaccepted bubble up here while the
    // confirmation is open; everything goes to the dialog, Escape included,
    // so it closes the dialog and not the panel.
    Item {
      id: confirmKeys
      anchors.fill: parent
      Keys.onPressed: function(event) {
        if (root.confirmAction === "") return
        confirm.handleKey(event)
        event.accepted = true
      }

      PanelKeyCatcher {
        id: keyCatcher
        anchors.fill: parent
        blocked: printerDropdown.popupOpen || root.confirmAction !== ""
        onCloseRequested: root.close()
        onMoveRequested: function(dx, dy) { root.moveCursor(dx, dy) }
        onActivateRequested: root.activateCursor()
        onTabRequested: function(direction) { root.switchPanel(direction) }

        Flickable {
          id: scroll
          anchors.fill: parent
          contentWidth: width
          contentHeight: column.implicitHeight
          clip: true
          boundsBehavior: Flickable.StopAtBounds
          flickableDirection: Flickable.VerticalFlick
          interactive: contentHeight > height
          ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

          Column {
            id: column
            width: scroll.width
            spacing: Style.space(12)

            PanelHero {
              width: parent.width
              title: root.panelModel.empty ? "OmaKlippy" : root.selected.displayName
              meta: root.panelModel.empty ? Model.TEXT.noPrinters : root.selected.metaText
              foreground: root.foreground
              fontFamily: root.fontFamily
              iconOpacity: root.selected.state === "offline" || root.panelModel.empty ? 0.5 : 1.0
              iconComponent: Component {
                Text {
                  textFormat: Text.PlainText
                  text: Model.PRINTER_GLYPH
                  color: root.selected.state === "error" ? root.urgent : root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.display
                }
              }
            }

            Dropdown {
              id: printerDropdown
              visible: root.rows.length > 0
              width: parent.width
              label: Model.TEXT.panel.printer
              fontFamily: root.fontFamily
              options: root.panelModel.options || []
              value: root.selected.key || ""
              hasCursor: root.cursorStop === "printer"
              onHovered: function(isHovered) { if (isHovered) root.cursorStop = "printer" }
              onChanged: function(key) { if (root.hostWidget) root.hostWidget.selectPrinter(key) }
            }

            Column {
              visible: root.panelModel.empty
              width: parent.width
              spacing: Style.space(6)

              Text {
                width: parent.width
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                text: Model.TEXT.panel.addPrinterWith
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }

              TextEdit {
                width: parent.width
                readOnly: true
                selectByMouse: true
                wrapMode: TextEdit.WrapAnywhere
                textFormat: TextEdit.PlainText
                text: Model.setupCommand()
                color: root.foreground
                selectionColor: Color.accent
                selectedTextColor: Color.background
                font.family: root.fontFamily
                font.pixelSize: Style.font.bodySmall
              }
            }

            Text {
              visible: !root.panelModel.empty && root.selected.reason !== ""
              width: parent.width
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              text: root.selected.reason || ""
              color: root.selected.state === "error" ? root.urgent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.bodySmall
            }

            PanelSeparator {
              visible: root.panelModel.showJob
              foreground: root.foreground
            }

            Column {
              visible: root.panelModel.showJob
              width: parent.width
              spacing: Style.space(8)

              Item {
                width: parent.width
                implicitHeight: percentText.implicitHeight

                Item {
                  id: progressTrack
                  anchors.left: parent.left
                  anchors.right: percentText.left
                  anchors.rightMargin: Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  height: Math.max(2, Style.space(4))

                  Rectangle {
                    anchors.fill: parent
                    radius: height / 2
                    color: Util.alpha(root.foreground, 0.2)
                  }

                  Rectangle {
                    width: parent.width * Math.max(0, Math.min(1, (root.selected.percent || 0) / 100))
                    height: parent.height
                    radius: height / 2
                    color: root.foreground
                    opacity: root.selected.state === "paused" ? 0.45 : 1
                  }
                }

                Text {
                  id: percentText
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: root.selected.percent === null || root.selected.percent === undefined ? "—" : root.selected.percent + "%"
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }
              }

              InfoRow {
                label: Model.TEXT.panel.file
                value: root.selected.filename || "—"
              }

              InfoRow {
                label: Model.TEXT.panel.remaining
                value: root.selected.remainingText || "—"
              }
            }

            PanelSeparator {
              visible: root.selected.showTemps === true
              foreground: root.foreground
            }

            Column {
              visible: root.selected.showTemps === true
              width: parent.width
              spacing: Style.space(8)

              InfoRow {
                label: Model.TEXT.panel.nozzle
                value: root.selected.nozzleText || "—"
              }

              InfoRow {
                label: Model.TEXT.panel.bed
                value: root.selected.bedText || "—"
              }
            }

            PanelSeparator {
              visible: root.showActions
              foreground: root.foreground
            }

            // Printer actions for the selected printer (Model.buildActionsModel).
            Column {
              visible: root.showActions
              width: parent.width
              spacing: Style.space(8)

              Row {
                id: primaryRow
                visible: root.actions.primary.length > 0
                width: parent.width
                spacing: Style.space(6)

                readonly property real cellWidth: root.actions.primary.length > 0
                  ? (width - spacing * (root.actions.primary.length - 1)) / root.actions.primary.length
                  : 0

                Repeater {
                  model: root.actions.primary

                  ActionButton {
                    required property var modelData
                    width: primaryRow.cellWidth
                    actionData: modelData
                  }
                }
              }

              // Kept apart from Cancel and filled with the theme's alert color, so
              // it is never hit by accident. The label stays in the foreground
              // color: themes whose urgent is a grey (Solitude) would otherwise
              // make an available stop look disabled.
              Item {
                visible: emergencyButton.visible && primaryRow.visible
                width: parent.width
                height: Style.space(12)
              }

              ActionButton {
                id: emergencyButton
                visible: root.actions.emergency !== null
                width: parent.width
                actionData: root.actions.emergency || ({})
                background: enabled ? Util.alpha(root.urgent, root.emergencyFillAlpha) : "transparent"
              }

              // The printer's web UI, in every state, on its own row after the
              // stop and kept apart from it the same way Cancel is.
              Item {
                visible: webButton.visible && (emergencyButton.visible || primaryRow.visible)
                width: parent.width
                height: Style.space(12)
              }

              ActionButton {
                id: webButton
                visible: !!root.actions.web
                width: parent.width
                actionData: root.actions.web || ({})
              }

              // The reason in the foreground color (a grey urgent, as on Solitude, would
              // be hard to read), flagged by an alert glyph in the urgent color.
              Row {
                visible: root.actions.failureText !== ""
                width: parent.width
                spacing: Style.space(6)

                Text {
                  id: failureGlyph
                  textFormat: Text.PlainText
                  text: Model.ACTION_GLYPHS.emergencyStop
                  color: root.urgent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  width: parent.width - failureGlyph.width - parent.spacing
                  textFormat: Text.PlainText
                  wrapMode: Text.WordWrap
                  text: root.actions.failureText
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
              }
            }

            Text {
              visible: !root.panelModel.empty && (root.selected.freshnessText || "") !== ""
              width: parent.width
              textFormat: Text.PlainText
              text: root.selected.freshnessText || ""
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        ConfirmDialog {
          id: confirm
          anchors.fill: parent
          z: 10
          opened: root.confirmAction !== ""
          message: Model.confirmMessage(root.confirmAction, root.selected.displayName, root.actions.filename)
          cancelText: Model.TEXT.confirm.back
          confirmText: Model.confirmLabel(root.confirmAction)
          foreground: root.foreground
          fontFamily: root.fontFamily
          onCanceled: root.cancelConfirm()
          onConfirmed: root.acceptConfirm()
        }
      }
    }
  }
}
