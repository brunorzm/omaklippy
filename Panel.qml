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
  property bool cursorActive: false
  property int cursorIndex: 0

  readonly property color foreground: bar ? bar.foreground : Color.foreground
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  function open() {
    if (hostWidget && hostWidget.panelOpened) hostWidget.panelOpened()
    cursorActive = false
    root.controller.show()
  }

  function selectedRowIndex() {
    for (var i = 0; i < rows.length; i++) if (rows[i].selected) return i
    return 0
  }

  function moveCursor(dy) {
    if (rows.length === 0) return
    if (!cursorActive) {
      cursorActive = true
      cursorIndex = selectedRowIndex()
      return
    }
    cursorIndex = Math.max(0, Math.min(rows.length - 1, cursorIndex + dy))
  }

  function selectRow(index) {
    if (index < 0 || index >= rows.length || !hostWidget) return
    hostWidget.selectPrinter(rows[index].key)
  }

  function close() {
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

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(column.implicitHeight, Style.space(560))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onMoveRequested: function(dx, dy) { root.moveCursor(dy) }
      onActivateRequested: if (root.cursorActive) root.selectRow(root.cursorIndex)
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
            meta: root.panelModel.empty ? "nenhuma impressora configurada" : root.selected.metaText
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
            visible: root.panelModel.empty
            width: parent.width
            spacing: Style.space(6)

            Text {
              width: parent.width
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              text: "Cadastre uma impressora com:"
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
              label: "Arquivo"
              value: root.selected.filename || "—"
            }

            InfoRow {
              label: "Restante"
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
              label: "Bico"
              value: root.selected.nozzleText || "—"
            }

            InfoRow {
              label: "Mesa"
              value: root.selected.bedText || "—"
            }
          }

          PanelSeparator {
            visible: root.rows.length > 0
            foreground: root.foreground
          }

          Column {
            visible: root.rows.length > 0
            width: parent.width
            spacing: Style.space(4)

            PanelSectionHeader {
              text: "IMPRESSORAS"
              foreground: root.foreground
              fontFamily: root.fontFamily
            }

            Repeater {
              model: root.rows

              CursorSurface {
                id: printerRow
                required property var modelData
                required property int index

                width: parent.width
                implicitHeight: Math.max(rowName.implicitHeight, rowState.implicitHeight) + Style.spacing.rowPaddingX
                foreground: root.foreground
                current: modelData.selected
                hasCursor: root.cursorActive && root.cursorIndex === index

                MouseArea {
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onContainsMouseChanged: if (containsMouse) { root.cursorActive = true; root.cursorIndex = printerRow.index }
                  onClicked: root.selectRow(printerRow.index)
                }

                Text {
                  id: rowName
                  anchors.left: parent.left
                  anchors.right: rowState.left
                  anchors.leftMargin: Style.space(10)
                  anchors.rightMargin: Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  elide: Text.ElideRight
                  textFormat: Text.PlainText
                  text: printerRow.modelData.displayName
                  color: root.foreground
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.body
                }

                Text {
                  id: rowState
                  anchors.right: parent.right
                  anchors.rightMargin: Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  textFormat: Text.PlainText
                  text: printerRow.modelData.stateLabel + (printerRow.modelData.percentText ? " " + printerRow.modelData.percentText : "")
                  color: printerRow.modelData.state === "error" ? root.urgent : root.dim
                  font.family: root.fontFamily
                  font.pixelSize: Style.font.bodySmall
                }
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
    }
  }
}
