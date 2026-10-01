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
  // Keyboard stops: the printer dropdown, then every button that can be
  // pressed now (Model.cursorStops). j/k/h/l walk them, Enter activates;
  // while the dropdown is open it owns the keys.
  // "main" (the selected printer) or "setup" (search, add, remove); the
  // empty panel always shows the setup screen.
  property string view: "main"
  readonly property bool inSetup: view === "setup" || panelModel.empty === true
  readonly property var setupModel: hostWidget && hostWidget.setupModel
    ? hostWidget.setupModel
    : Model.buildSetupModel([], null, null, "", true, "")
  readonly property bool fieldFocused: addressField.activeFocus || nameField.activeFocus
  readonly property var stops: Model.panelStops(panelModel, setupModel, inSetup)
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
    view = panelModel.empty ? "setup" : "main"
    cancelConfirm()
    // A menu left open by hide/summon would keep keyCatcher blocked.
    printerDropdown.close()
    root.controller.show()
  }

  function showView(name) {
    view = name
    cursorStop = ""
    cancelConfirm()
    keyCatcher.forceActiveFocus()
  }

  // Setup screen buttons; ids come from Model.setupCursorStops, and only one
  // that is a stop right now does anything.
  function activateSetup(id) {
    if (!hostWidget || stops.indexOf(id) < 0) return
    if (id === "search") hostWidget.startDiscovery()
    else if (id === "cancelSearch") hostWidget.cancelDiscovery()
    else if (id.indexOf("add:") === 0) hostWidget.addFound(id.slice(4))
    else if (id === "address") addressField.forceActiveFocus()
    else if (id === "name") nameField.forceActiveFocus()
    else if (id === "submit") submitForm()
    else if (id === "addAnyway") hostWidget.addAnyway()
    else if (id === "back") showView("main")
    else if (id === "remove" && setupModel.removeKey !== "") {
      // Back is preselected, as for the printer actions.
      confirm.selectedIndex = 0
      confirmKey = setupModel.removeKey
      confirmAction = "removePrinter"
    }
  }

  function submitForm() {
    if (hostWidget) hostWidget.submitForm(addressField.text, nameField.text)
    keyCatcher.forceActiveFocus()
  }

  // Escape outside a text field: a running search is cancelled first.
  function escapePressed() {
    if (inSetup && setupModel.searching && hostWidget) hostWidget.cancelDiscovery()
    else close()
  }

  // A printer added from the setup screen: back to the main screen, where
  // the widget selects it once the new list arrives.
  Connections {
    target: root.hostWidget
    ignoreUnknownSignals: true
    function onPrintersSaved(selectKey) {
      if (selectKey === "") return
      addressField.text = ""
      nameField.text = ""
      root.showView("main")
    }
  }

  // However the panel closes (Escape, a click outside, another panel), the
  // search stops and the form starts over.
  onOpenedChanged: if (!opened && hostWidget) hostWidget.resetSetup()

  function moveCursor(dx, dy) {
    cursorStop = Model.stepCursor(stops, cursorStop, (dx + dy) > 0 ? 1 : -1)
  }

  function activateCursor() {
    if (inSetup) activateSetup(cursorStop)
    else if (cursorStop === "printer") printerDropdown.open()
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
    if (id === "openSetup") {
      showView("setup")
      return
    }
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
    if (!hostWidget || key === "" || action === "") return
    if (action === "removePrinter") hostWidget.removePrinter(key)
    else hostWidget.runAction(key, action)
  }

  // Nothing is sent when the confirmation outlives its reason: another
  // printer got selected (by hand or automatically), or the action can no
  // longer be pressed (the print ended, another command started).
  function checkConfirm() {
    if (confirmAction === "") return
    if (confirmAction === "removePrinter") {
      if (!inSetup || setupModel.removeKey !== confirmKey) cancelConfirm()
      return
    }
    var button = buttonFor(confirmAction)
    if (selected.key !== confirmKey || !button || !button.enabled) cancelConfirm()
  }

  onPanelModelChanged: checkConfirm()
  onSetupModelChanged: checkConfirm()
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

  component SetupButton: Button {
    id: setupButton
    property string stopId: ""

    enabled: root.stops.indexOf(stopId) >= 0
    opacity: enabled || iconSpinning ? 1 : root.disabledOpacity
    bordered: true
    hasCursor: root.cursorStop !== "" && root.cursorStop === stopId
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    onClicked: root.activateSetup(stopId)
    onHovered: function(isHovered) {
      if (isHovered && setupButton.enabled) root.cursorStop = stopId
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
        // A focused text field owns every key until Escape or Enter.
        blocked: printerDropdown.popupOpen || root.confirmAction !== "" || root.fieldFocused
        onCloseRequested: root.escapePressed()
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

            Column {
              visible: !root.inSetup
              width: parent.width
              spacing: Style.space(12)

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

                // What the printer says it is doing ("Aquecendo a Camara"), in its own
                // words; only while there is a print (Model.detailFor).
                Text {
                  visible: (root.selected.messageText || "") !== ""
                  width: parent.width
                  textFormat: Text.PlainText
                  wrapMode: Text.WordWrap
                  text: root.selected.messageText || ""
                  color: root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }

                InfoRow {
                  label: Model.TEXT.panel.file
                  value: root.selected.filename || "—"
                }

                InfoRow {
                  label: Model.TEXT.panel.remaining
                  value: root.selected.remainingText || "—"
                }

                InfoRow {
                  visible: (root.selected.finishText || "") !== ""
                  label: Model.TEXT.panel.ends
                  value: root.selected.finishText || ""
                }

                InfoRow {
                  visible: (root.selected.layerText || "") !== ""
                  label: Model.TEXT.panel.layer
                  value: root.selected.layerText || ""
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
                foreground: root.foreground
              }

              // Printer actions for the selected printer (Model.buildActionsModel),
              // then Printers…, which is always there.
              Column {
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

                Item {
                  visible: root.actions.buttons.length > 0
                  width: parent.width
                  height: Style.space(12)
                }

                ActionButton {
                  width: parent.width
                  actionData: ({ id: "openSetup", label: Model.TEXT.setup.printers, glyph: Model.ACTION_GLYPHS.openSetup, enabled: true })
                }
              }

              // Informational, not an alert: the printers still work without it.
              Text {
                visible: (root.panelModel.notifyWarning || "") !== ""
                width: parent.width
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                text: root.panelModel.notifyWarning || ""
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
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

            // Setup screen (Model.buildSetupModel): search the network, add by
            // address, remove the selected printer.
            Column {
              visible: root.inSetup
              width: parent.width
              spacing: Style.space(10)

              PanelSectionHeader {
                text: Model.TEXT.setup.title
                foreground: root.foreground
                fontFamily: root.fontFamily
              }

              Row {
                visible: root.setupModel.editable
                width: parent.width
                spacing: Style.space(6)

                SetupButton {
                  width: root.setupModel.searching ? parent.width - cancelSearchButton.width - parent.spacing : parent.width
                  stopId: "search"
                  text: root.setupModel.searchLabel
                  iconText: root.setupModel.searching ? Model.ACTION_GLYPHS.busy : Model.ACTION_GLYPHS.search
                  iconSpinning: root.setupModel.searching
                }

                SetupButton {
                  id: cancelSearchButton
                  visible: root.setupModel.searching
                  stopId: "cancelSearch"
                  text: Model.TEXT.setup.cancel
                  iconText: Model.ACTION_GLYPHS.cancelSearch
                }
              }

              Repeater {
                model: root.setupModel.editable ? root.setupModel.results : []

                Item {
                  id: resultRow
                  required property var modelData
                  width: parent.width
                  implicitHeight: Math.max(resultText.implicitHeight, resultButton.implicitHeight)

                  Column {
                    id: resultText
                    anchors.left: parent.left
                    anchors.right: resultButton.left
                    anchors.rightMargin: Style.space(8)
                    anchors.verticalCenter: parent.verticalCenter

                    Text {
                      width: parent.width
                      elide: Text.ElideRight
                      textFormat: Text.PlainText
                      text: resultRow.modelData.name
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                    }

                    Text {
                      width: parent.width
                      elide: Text.ElideMiddle
                      textFormat: Text.PlainText
                      text: resultRow.modelData.address
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.caption
                    }
                  }

                  SetupButton {
                    id: resultButton
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    stopId: "add:" + resultRow.modelData.ip
                    text: resultRow.modelData.added ? Model.TEXT.setup.added : Model.TEXT.setup.add
                    iconText: resultRow.modelData.ready ? (resultRow.modelData.added ? "" : Model.ACTION_GLYPHS.add) : Model.ACTION_GLYPHS.busy
                    iconSpinning: !resultRow.modelData.ready
                  }
                }
              }

              Text {
                visible: root.setupModel.nothingFound && root.setupModel.editable
                width: parent.width
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                text: Model.TEXT.setup.nothingFound
                color: root.dim
              }

              Repeater {
                model: root.setupModel.notices

                Text {
                  required property string modelData
                  width: parent.width
                  textFormat: Text.PlainText
                  wrapMode: Text.WordWrap
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.caption
                  text: modelData
                  color: root.dim
                }
              }

              PanelSeparator {
                visible: root.setupModel.editable
                foreground: root.foreground
              }

              PanelSectionHeader {
                visible: root.setupModel.editable
                text: Model.TEXT.setup.addByAddress
                foreground: root.foreground
                fontFamily: root.fontFamily
              }

              // Network panel pattern: Enter in Address moves to Name, Enter in
              // Name adds, Escape gives the keys back to the panel cursor.
              TextField {
                id: addressField
                visible: root.setupModel.editable
                width: parent.width
                placeholderText: Model.TEXT.setup.addressHint
                foreground: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                hasCursor: root.cursorStop === "address"
                enabled: !root.setupModel.formBusy
                onAccepted: nameField.forceActiveFocus()
                Keys.onEscapePressed: keyCatcher.forceActiveFocus()
                onActiveFocusChanged: if (activeFocus) root.cursorStop = "address"
              }

              TextField {
                id: nameField
                visible: root.setupModel.editable
                width: parent.width
                placeholderText: Model.TEXT.setup.name
                foreground: root.foreground
                font.family: root.fontFamily
                font.pixelSize: Style.font.body
                hasCursor: root.cursorStop === "name"
                enabled: !root.setupModel.formBusy
                onAccepted: root.submitForm()
                Keys.onEscapePressed: keyCatcher.forceActiveFocus()
                onActiveFocusChanged: if (activeFocus) root.cursorStop = "name"
              }

              Row {
                visible: root.setupModel.editable
                width: parent.width
                spacing: Style.space(6)

                SetupButton {
                  stopId: "submit"
                  text: Model.TEXT.setup.add
                  iconText: root.setupModel.formBusy ? Model.ACTION_GLYPHS.busy : Model.ACTION_GLYPHS.add
                  iconSpinning: root.setupModel.formBusy
                }

                SetupButton {
                  visible: root.setupModel.showAddAnyway
                  stopId: "addAnyway"
                  text: Model.TEXT.setup.addAnyway
                }
              }

              Text {
                visible: root.setupModel.editable && root.setupModel.formText !== ""
                width: parent.width
                textFormat: Text.PlainText
                wrapMode: Text.WordWrap
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                text: root.setupModel.formText
                color: root.setupModel.formBusy ? root.dim : root.foreground
              }

              PanelSeparator {
                visible: root.setupModel.removeKey !== "" || root.setupModel.saveMessage !== "" || !root.panelModel.empty
                foreground: root.foreground
              }

              SetupButton {
                visible: root.setupModel.editable && root.setupModel.removeKey !== ""
                width: parent.width
                stopId: "remove"
                text: root.setupModel.removeLabel
                iconText: Model.ACTION_GLYPHS.remove
              }

              // Same look as a failed printer action.
              Row {
                visible: root.setupModel.saveMessage !== ""
                width: parent.width
                spacing: Style.space(6)

                Text {
                  id: saveGlyph
                  textFormat: Text.PlainText
                  text: Model.ACTION_GLYPHS.emergencyStop
                  color: root.urgent
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }

                Text {
                  width: parent.width - saveGlyph.width - parent.spacing
                  textFormat: Text.PlainText
                  wrapMode: Text.WordWrap
                  text: root.setupModel.saveMessage
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
              }

              SetupButton {
                visible: !root.panelModel.empty
                width: parent.width
                stopId: "back"
                text: Model.TEXT.setup.back
                iconText: Model.ACTION_GLYPHS.back
              }
            }
          }
        }

        ConfirmDialog {
          id: confirm
          anchors.fill: parent
          z: 10
          opened: root.confirmAction !== ""
          message: root.confirmAction === "removePrinter"
            ? Model.confirmMessage(root.confirmAction, root.setupModel.removeName)
            : Model.confirmMessage(root.confirmAction, root.selected.displayName, root.actions.filename)
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
