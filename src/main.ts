import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { CommandLine } from "./ui/CommandLine"
import { StatusBar } from "./ui/StatusBar"
import { Menu } from "./ui/Menu"
import { MainMenuScreen } from "./ui/MainMenuScreen"
import { OpenCascadeService } from "./core/io/OpenCascadeService"
import { FloatingToolbar } from "./ui/FloatingToolbar"
import { DockingManager } from "./ui/DockingManager"
import { ToolWindowBar } from "./ui/ToolWindowBar"
import { ToolWindow } from "./ui/ToolWindow"
import { LayerWindow } from "./ui/LayerWindow"
import { DimToolbar } from "./ui/DimToolbar"
import { EditToolbar } from "./ui/EditToolbar"
import { InquiryToolbar } from "./ui/InquiryToolbar"

const canvas = document.getElementById("c") as HTMLCanvasElement
const viewer = new Viewer(canvas)
const app = new App(viewer)

// Initialize layers requested by user
app.doc.layers.createLayer("1", 7, "CONTINUOUS");
app.doc.layers.createLayer("2", 4, "CONTINUOUS");
app.doc.layers.createLayer("01", 3, "DASHDOT");
const cmdLine = new CommandLine()
cmdLine.setCommands(app.cmd.getAvailableCommands());
app.setCommandLine((msg: string) => cmdLine.print(msg))
const statusBar = new StatusBar()
app.setStatusBar((layer) => {
  statusBar.updateLayer(layer);
  statusBar.updateDraftingStatus({
    snap: app.drafting.snapEnabled,
    grid: app.drafting.gridEnabled,
    ortho: app.drafting.orthoEnabled
  });
})

statusBar.onTagClick('snap', () => app.drafting.toggleSnap());
statusBar.onTagClick('grid', () => app.drafting.toggleGrid());
statusBar.onTagClick('ortho', () => app.drafting.toggleOrtho());

const dockingManager = new DockingManager();

const toolWindowBar = new ToolWindowBar();
const layersWindow = new ToolWindow("layers", "Layers");

const mainArea = document.getElementById('main-area')!;
// Insert at the beginning of mainArea
mainArea.insertBefore(toolWindowBar.getElement(), mainArea.firstChild);
// Insert layers window after the bar
mainArea.insertBefore(layersWindow.getElement(), toolWindowBar.getElement().nextSibling);

toolWindowBar.addWindow("L", layersWindow);
const layerWindow = new LayerWindow(layersWindow, app.doc.layers, (name) => {
  app.execute(`LAYER Set ${name}`);
}, (layerName, color) => {
  app.execute(`LAYER Color ${color} ${layerName}`);
}, (layerName, ltype) => {
  app.execute(`LAYER Ltype ${ltype} ${layerName}`);
}, (layerName, action) => {
  app.execute(`LAYER ${action} ${layerName}`);
}, (layerName, action) => {
  app.execute(`LAYER ${action} ${layerName}`);
}, (cmd) => {
  app.execute(cmd);
});
app.setLayersWindowUpdate(() => layerWindow.refresh());

const menu = new Menu(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const floatingToolbar = new FloatingToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const dimToolbar = new DimToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const editToolbar = new EditToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const inquiryToolbar = new InquiryToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

// Correct initial sizing and handle resize
viewer.resize()
window.addEventListener("resize", () => viewer.resize())

// Handle container resize (e.g. when docking pane minimizes)
const viewportContainer = document.getElementById("viewport-container");
if (viewportContainer) {
  const resizeObserver = new ResizeObserver(() => {
    viewer.resize();
    viewer.render();
  });
  resizeObserver.observe(viewportContainer);
}

// Main Menu Logic
const mainMenu = new MainMenuScreen(async (filename?: string) => {
  // Callback when starting/loading a drawing
  document.getElementById('drawing-editor')!.style.display = 'block';
  floatingToolbar.show();
  dimToolbar.show();
  editToolbar.show();
  inquiryToolbar.show();
  
  if (filename) {
    // Option 2: Load existing
    cmdLine.print(`Loading drawing: ${filename}`);
    await app.execute(`LOAD ${filename}`);
  } else {
    // Option 1: Begin NEW drawing - Clear everything
    await app.execute('NEW');
  }

  viewer.resize();
  viewer.render();

  // Focus command line after transition
  const cmdInput = document.getElementById('cmd') as HTMLInputElement;
  cmdInput.focus();
  updatePrompt();
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
    const prompt = activeCmd.getPrompt();
    cmdLine.setPrompt(prompt);
    
    // Auto-focus command line for specific inputs that primarily expect text/numbers
    const shouldFocus =
      prompt === "Text:" ||
      prompt.startsWith("POLYGON Number of sides") ||
      prompt.includes("(I/C) <I>:") ||
      prompt.startsWith("Height <") ||
      prompt.startsWith("Rotation angle <") ||
      prompt.startsWith("Diameter") ||
      prompt.startsWith("ZOOM [All/Window]") ||
      prompt.includes("Pattern name <") ||
      prompt.startsWith("Enter shape name") ||
      prompt.startsWith("Delete old objects?") ||
      prompt.startsWith("Scale <") ||
      prompt.startsWith("Radius of polygon") ||
      prompt.startsWith("Load drawing") ||
      prompt.startsWith("Save drawing") ||
      prompt.startsWith("Enter note text");

    if (shouldFocus) {
      cmdLine.focus();
    }
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
  if (app.cmd.active) {
    updatePrompt()
  }
})

// Global keyboard shortcuts for commands
window.addEventListener("keydown", async (e) => {
  // Auto-focus command line on alphanumeric key if no command is active
  if (!app.cmd.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
    // Don't hijack focus if user is already typing in an input or textarea
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }

    const key = e.key;
    if (key.length === 1 && /^[a-z0-9]$/i.test(key)) {
      const cmdInput = document.getElementById('cmd') as HTMLInputElement;
      if (cmdInput && document.activeElement !== cmdInput) {
        cmdInput.focus();
        // The browser will continue to propagate this event and type the char into the input
      }
    }
  }

  // Drafting aids
  if (e.key === 'F7') {
    e.preventDefault();
    app.drafting.toggleGrid();
    return;
  }
  if (e.key === 'F8') {
    e.preventDefault();
    app.drafting.toggleOrtho();
    return;
  }
  if (e.key === 'F9') {
    e.preventDefault();
    app.drafting.toggleSnap();
    return;
  }

  // Handle Ctrl+Z for undo
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault()
    const res = await app.execute('UNDO')
    if (typeof res === 'string') {
      cmdLine.print(res)
    }
    updatePrompt()
    return
  }

  // Handle Ctrl+Y for redo
  if (e.ctrlKey && e.key === 'y') {
    e.preventDefault()
    const res = await app.execute('REDO')
    if (typeof res === 'string') {
      cmdLine.print(res)
    }
    updatePrompt()
    return
  }

  // Always handle ESC to cancel commands
  if (e.key === 'Escape' && app.cmd.active) {
    // If PAN is active, reset to original position
    if (app.cmd.active.constructor.name === 'PanCommand') {
      const startPos = viewer.getPanStartPosition()
      viewer.camera.position.x = startPos.x
      viewer.camera.position.y = startPos.y
    }
    cmdLine.print("*Cancel*")
    app.terminateActiveCommand()
    viewer.setLeftPanEnabled(false)
    updatePrompt()
    return
  }

  // Handle Enter to accept PAN
  if (e.key === 'Enter' && app.cmd.active) {
    if (app.cmd.active.constructor.name === 'PanCommand') {
      app.terminateActiveCommand()
      viewer.setLeftPanEnabled(false)
      updatePrompt()
      return
    }
  }

  // Ignore if typing in the command line (except for ESC which is handled above)
  if (document.activeElement?.id === "cmd" || document.activeElement?.id === "main-menu-input") return
  if (e.ctrlKey || e.altKey || e.metaKey) return

  // Only handle if a command is active
  if (app.cmd.active) {
    const key = e.key.toLowerCase()
    const isLetter = key.length === 1 && key >= 'a' && key <= 'z'
    const isAction = key === 'enter'

    if (isLetter || isAction) {

      const inputVal = key === 'enter' ? "" : key.toUpperCase()
      if (inputVal !== "") {
        cmdLine.print(`Command: ${inputVal}`)
      }
      
      const res = await app.inputText(inputVal)
      if (typeof res === 'string') {
        cmdLine.print(res)
      }
      // Force preview update to the current mouse position
      app.move(lastMouseX, lastMouseY)
      updatePrompt()
    }
  }
})

cmdLine.onCommand(async (val) => {
  const trimmedUpper = val.trim().toUpperCase()

  if (trimmedUpper === "MENU") {
    menu.goToRoot()
    cmdLine.print("Returned to root menu.")
    updatePrompt()
    return
  }

  if (trimmedUpper === "QUIT" || trimmedUpper === "EXIT") {
    document.getElementById('drawing-editor')!.style.display = 'none';
    floatingToolbar.hide();
    menu.goToRoot();
    mainMenu.show();
    return;
  }

  // Pass raw value for text preservation, handle matching inside
  let res = await app.inputText(val)
  if (!res || typeof res === 'string' && res.startsWith("Unknown")) {
    res = await app.execute(trimmedUpper)
  }
  
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  updatePrompt()
})

// simple click input
canvas.addEventListener("pointerdown", (e) => {
  app.pointerDown(e.clientX, e.clientY);
  // Check if pan was just ended by this click
  if (viewer.wasPanEnded()) {
    cmdLine.print("PAN ended.")
    updatePrompt()
    viewer.clearPanEndedFlag()
  }
});

canvas.addEventListener("pointerup", async (e) => {
  const res = await app.pointerUp(e.clientX, e.clientY);
  if (typeof res === 'string' && res) {
    cmdLine.print(res);
  }
  // Force preview update (X markers, rubber-band) after click
  app.move(e.clientX, e.clientY);
  updatePrompt();
});
