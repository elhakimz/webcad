import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { CommandLine } from "./ui/CommandLine"
import { StatusBar } from "./ui/StatusBar"
import { Menu } from "./ui/Menu"
import { MainMenuScreen } from "./ui/MainMenuScreen"
import { OpenCascadeService } from "./core/io/OpenCascadeService"

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

// Main Menu Logic
const mainMenu = new MainMenuScreen(() => {
  // Callback when 'Begin a NEW drawing' is selected
  document.getElementById('drawing-editor')!.style.display = 'block';
  viewer.resize();
  viewer.render();

  // Focus command line after transition
  const cmdInput = document.getElementById('cmd') as HTMLInputElement;
  cmdInput.focus();
});

// Initialize CAD Engine
mainMenu.setEnabled(false);
mainMenu.setStatus("Loading CAD Kernel (OpenCascade.js)...");

OpenCascadeService.getInstance().init()
  .then(() => {
    mainMenu.setStatus("");
    mainMenu.setEnabled(true);
  })
  .catch((err) => {
    mainMenu.setStatus("Failed to load CAD Kernel.");
    console.error(err);
  });

let lastMouseX = 0
let lastMouseY = 0

function updatePrompt() {
  const activeCmd = app.cmd.active;
  if (activeCmd && activeCmd.getPrompt) {
    cmdLine.setPrompt(activeCmd.getPrompt());
  } else {
    cmdLine.setPrompt("Command:");
  }
}

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
  if (document.activeElement?.id === "cmd" || document.activeElement?.id === "main-menu-input") return
  if (e.ctrlKey || e.altKey || e.metaKey) return

  // Only handle if a command is active
  if (app.cmd.active) {
    const key = e.key.toLowerCase()
    const isLetter = key.length === 1 && key >= 'a' && key <= 'z'
    const isAction = key === 'enter' || key === 'escape'
    
    if (isLetter || isAction) {
      if (key === 'escape') {
        cmdLine.print("*Cancel*")
        app.cmd.clearActive()
        viewer.setPreview(null)
        viewer.setHelpers(null)
        viewer.render()
        updatePrompt()
        return
      }

      const inputVal = key === 'enter' ? "" : key.toUpperCase()
      if (inputVal !== "") {
        cmdLine.print(`Command: ${inputVal}`)
      }
      
      const res = app.inputText(inputVal)
      if (typeof res === 'string') {
        cmdLine.print(res)
      }
      // Force preview update to the current mouse position
      app.move(lastMouseX, lastMouseY)
      updatePrompt()
    }
  }
})

cmdLine.onCommand((val) => {
  const cleanVal = val.trim().toUpperCase()

  if (cleanVal === "MENU") {
    menu.goToRoot()
    cmdLine.print("Returned to root menu.")
    updatePrompt()
    return
  }

  if (cleanVal === "QUIT" || cleanVal === "EXIT") {
    document.getElementById('drawing-editor')!.style.display = 'none';
    menu.goToRoot();
    mainMenu.show();
    return;
  }

  let res = app.inputText(cleanVal)
  if (!res || typeof res === 'string' && res.startsWith("Unknown")) {
    res = app.execute(cleanVal)
  }
  
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  updatePrompt()
})

// simple click input
window.addEventListener("click",(e)=>{
  // Only handle clicks inside the viewport
  if (e.target !== canvas) return

  const res = app.click(e.clientX, e.clientY)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  updatePrompt()
})
