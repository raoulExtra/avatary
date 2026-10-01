import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "peter.omavatar"

  readonly property var emotions: ["neutral", "thinking", "happy", "concerned"]
  property int emotionIndex: 0

  function sendEmotion() {
    if (sendProc.running) return
    sendProc.command = ["oma-avatar", "emotion", emotions[emotionIndex]]
    sendProc.running = true
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  Process {
    id: sendProc
    running: false
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰚩"
    slotSize: Style.bar.statusSlot
    fontSize: Style.font.caption
    tooltipText: "Omavatar: " + root.emotions[root.emotionIndex]
    onPressed: {
      root.sendEmotion()
      root.emotionIndex = (root.emotionIndex + 1) % root.emotions.length
    }
  }
}
