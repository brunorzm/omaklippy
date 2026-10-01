import QtQuick
import QtWebSockets

// One live connection to a printer's Moonraker. Kept apart and loaded by a
// Loader so a missing QtWebSockets module only turns live updates off: the
// Loader then reports an error and the widget polls as before. No decisions
// here; Model.js drives it through BarWidget.qml.
Item {
  id: root
  property string url: ""

  signal opened()
  signal message(string text)
  signal ponged()
  // Once per connection: closed by the printer, failed to open or errored.
  signal closed(string reason)

  property bool reported: false

  function open() {
    reported = false
    socket.active = false
    socket.url = root.url
    socket.active = true
  }

  function send(text) {
    if (socket.status === WebSocket.Open) socket.sendTextMessage(text)
  }

  function ping() {
    if (socket.status === WebSocket.Open) socket.ping("")
  }

  // Closing on purpose reports nothing.
  function stop() {
    reported = true
    socket.active = false
  }

  function report(reason) {
    if (reported) return
    reported = true
    root.closed(reason)
  }

  WebSocket {
    id: socket
    active: false
    onStatusChanged: function(status) {
      if (status === WebSocket.Open) root.opened()
      else if (status === WebSocket.Error) root.report(socket.errorString)
      else if (status === WebSocket.Closed) root.report("closed")
    }
    onTextMessageReceived: function(text) { root.message(text) }
    onPong: function(elapsedTime, payload) { root.ponged() }
  }

  Component.onDestruction: stop()
}
