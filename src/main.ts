
import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { CommandLine } from "./ui/CommandLine"
import { StatusBar } from "./ui/StatusBar"
import { Menu } from "./ui/Menu"

const canvas = document.getElementById("c") as HTMLCanvasElement
const viewer = new Viewer(canvas)
const app = new App(viewer)

const cmdLine = new CommandLine()
const statusBar = new StatusBar()
const menu = new Menu((cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = app.execute(cmd)
  cmdLine.print(typeof res === 'string' ? res : "")
})

// Correct initial sizing and handle resize
viewer.resize()
window.addEventListener("resize", () => viewer.resize())

viewer.render()

let lastMouseX = 0
let lastMouseY = 0

// Update coordinate display on mouse move
window.addEventListener("mousemove", (e) => {
  lastMouseX = e.clientX
  lastMouseY = e.clientY
  const worldPt = viewer.screenToWorld(e.clientX, e.clientY)
  statusBar.updateCoordinates(worldPt.x, worldPt.y)
  app.move(e.clientX, e.clientY)
})

// Global keyboard shortcuts for commands
window.addEventListener("keydown", (e) => {
  // Ignore if typing in the command line
  if (document.activeElement?.id === "cmd") return

  // Only handle if a command is active
  if (app.cmd.active) {
    const key = e.key.toLowerCase()
    if (key === 'c' || key === 'u') {
      const res = app.inputText(key.toUpperCase())
      if (typeof res === 'string') {
        cmdLine.print(res)
      }
      // Force preview update to the current mouse position
      app.move(lastMouseX, lastMouseY)
    }
  }
})

cmdLine.onCommand((val) => {
  const cleanVal = val.trim().toUpperCase()

  if (cleanVal === "MENU") {
    menu.goToRoot()
    cmdLine.print("Returned to root menu.")
    return
  }

  let res = app.inputText(cleanVal)
  if (!res || typeof res === 'string' && res.startsWith("Unknown")) {
    res = app.execute(cleanVal)
  }
  
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
})

// simple click input
window.addEventListener("click",(e)=>{
  // Only handle clicks inside the viewport
  if (e.target !== canvas) return

  const res = app.click(e.clientX, e.clientY)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
})
