import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { CommandLine } from "./ui/CommandLine"
import { RibbonContainer } from "./ui/RibbonContainer"
import { LayerInfoRibbonBar } from "./ui/LayerInfoRibbonBar"
import { DraftingAidsRibbonBar } from "./ui/DraftingAidsRibbonBar"
import { UnitsAndCoordRibbonBar } from "./ui/UnitsAndCoordRibbonBar"
import { DisplayRibbonBar } from "./ui/DisplayRibbonBar"
import { DazViewControl } from "./ui/DazViewControl"
import { OpenCascadeService } from "./core/io/OpenCascadeService.js"
import { FloatingToolbar } from "./ui/FloatingToolbar"
import { DockingManager } from "./ui/DockingManager"
import { ToolWindowBar } from "./ui/ToolWindowBar"
import { ToolWindow } from "./ui/ToolWindow"
import { LayerWindow } from "./ui/LayerWindow"
import { PropertiesWindow } from "./ui/PropertiesWindow"
import { DimToolbar } from "./ui/DimToolbar"
import { EditToolbar } from "./ui/EditToolbar"
import { InquiryToolbar } from "./ui/InquiryToolbar"
import { SolidToolbar } from "./ui/SolidToolbar"
import { FileToolWindow } from "./ui/FileToolWindow"

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

const ribbonContainer = new RibbonContainer();
const layerRibbon = new LayerInfoRibbonBar();
const draftingRibbon = new DraftingAidsRibbonBar(
  (type) => {
    if (type === 'snap') app.drafting.toggleSnap();
    if (type === 'grid') app.drafting.toggleGrid();
    if (type === 'ortho') app.drafting.toggleOrtho();
    if (type === 'xyz') app.drafting.toggleXyz();
    if (type === 'mode') app.drafting.toggleMode3d();
    if (type === 'axis') app.drafting.toggleAxis();
  },
  (type, value) => {
    if (type === 'snap') app.drafting.setSnapSpacing(value);
    if (type === 'grid') app.drafting.setGridSpacing(value);
  },
  app.drafting.snapSpacing,
  app.drafting.gridSpacing
);
const unitsRibbon = new UnitsAndCoordRibbonBar((type) => {
  app.doc.units.type = type;
  app.syncFromDocument();
  if (updateStatusBar) updateStatusBar();
});
const displayRibbon = new DisplayRibbonBar(async (action) => {
  if (action === 'PAN') {
    await app.execute('PAN');
  } else if (action === 'ZOOM_ALL') {
    await app.execute('ZOOM');
    await app.inputText('ALL');
  } else if (action === 'ZOOM_WINDOW') {
    await app.execute('ZOOM');
    await app.inputText('WINDOW');
  } else if (action === 'AUTOPAN_ON') {
    isAutoPanEnabled = true;
  } else if (action === 'AUTOPAN_OFF') {
    isAutoPanEnabled = false;
  }
});

ribbonContainer.addBar(layerRibbon);
ribbonContainer.addBar(draftingRibbon);
ribbonContainer.addBar(unitsRibbon);
ribbonContainer.addBar(displayRibbon);

const dazControl = new DazViewControl(viewer, app);
const vpContainer = document.getElementById('viewport-container');
if (vpContainer) {
  vpContainer.appendChild(dazControl.getElement());
}

const statusBarEl = document.getElementById('status-bar')!;
statusBarEl.innerHTML = '';
statusBarEl.appendChild(ribbonContainer.getElement());

function updateStatusBar() {
  layerRibbon.updateLayer(app.doc.layers.getCurrentLayer());
  draftingRibbon.updateStatus({
    snap: app.drafting.snapEnabled,
    grid: app.drafting.gridEnabled,
    ortho: app.drafting.orthoEnabled,
    xyz: app.drafting.xyzEnabled,
    mode3d: app.drafting.mode3d,
    axis: app.drafting.axisEnabled
  });
  draftingRibbon.updateSizes(app.drafting.snapSpacing, app.drafting.gridSpacing);
  unitsRibbon.updateUnits(app.doc.units);
  viewer.setAxesVisible(app.drafting.xyzEnabled);
  viewer.setDraftingAxisVisible(app.drafting.axisEnabled);
}

app.setStatusBar((_layer) => {
  updateStatusBar();
});

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

// Properties Window
const propertiesToolbar = new ToolWindow("properties", "Properties");
mainArea.insertBefore(propertiesToolbar.getElement(), layersWindow.getElement().nextSibling);
toolWindowBar.addWindow("P", propertiesToolbar);
const propertiesWindow = new PropertiesWindow(propertiesToolbar, app);
app.setPropertiesWindow(propertiesWindow);
app.setLayersWindowUpdate(() => layerWindow.refresh());

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

const solidToolbar = new SolidToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') {
    cmdLine.print(res)
  }
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const fileToolbar = new ToolWindow("file", "File Operations")
const fileToolWindow = new FileToolWindow(fileToolbar, app)
mainArea.insertBefore(fileToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("F", fileToolbar)

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

// Show editor and toolbars immediately
const editor = document.getElementById('drawing-editor');
if (editor) editor.style.display = 'block';
floatingToolbar.show();
dimToolbar.show();
editToolbar.show();
inquiryToolbar.show();
solidToolbar.show();

// Initialize CAD Engine
Promise.all([
  OpenCascadeService.getInstance().init(),
  app.persistence.init()
])
  .then(async () => {
    // Begin NEW drawing - Clear everything
    await app.execute('NEW');
    
    viewer.resize();
    viewer.render();
  
    // Focus command line
    const cmdInput = document.getElementById('cmd') as HTMLInputElement;
    if (cmdInput) cmdInput.focus();
    updatePrompt();
    
    fileToolWindow.renderTableBody();
  })
  .catch((err: any) => {
    console.error("Failed to initialize CAD Engine:", err);
    cmdLine.print("Error: Failed to initialize CAD Engine.");
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
      // prompt.startsWith("POLYGON Number of sides") ||
      // prompt.includes("(I/C) <I>:") ||
      prompt.startsWith("Height <") ||
      prompt.startsWith("Rotation angle <") ||
      prompt.startsWith("Diameter") ||
      prompt.startsWith("ZOOM [All/Window]") ||
      prompt.includes("Pattern name <") ||
      prompt.startsWith("Enter shape name") ||
      prompt.startsWith("Delete old objects?") ||
      prompt.startsWith("Scale <") ||
      // prompt.startsWith("Radius of polygon") ||
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

app.setPromptUpdate(() => updatePrompt());

// Update coordinate display on mouse move
let autoPanInterval: any = null;
let panX = 0;
let panY = 0;
let isAutoPanEnabled = false;

window.addEventListener("mousemove", (e) => {
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (e.buttons & 2) {
    viewer.orbit(dx, dy);
    return;
  }

  if (e.altKey) {
    // Change Z based on mouse Y delta
    // Moving UP (negative dy) increases Z
    app.currentZ -= dy * 0.5;
  }

  const rect = viewer.canvas.getBoundingClientRect();
  const margin = 30; // 30px margin for auto-pan
  
  panX = 0;
  panY = 0;
  
  const isInsideCanvas = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

  if (e.clientX < rect.left + margin) panX = -1;
  if (e.clientX > rect.right - margin) panX = 1;
  if (e.clientY < rect.top + margin) panY = 1; // Y is inverted in screen
  if (e.clientY > rect.bottom - margin) panY = -1;

  // If auto-pan is enabled and we are at the edge, start auto-panning
  if (isAutoPanEnabled && isInsideCanvas && (panX !== 0 || panY !== 0)) {
    if (!autoPanInterval) {
      autoPanInterval = setInterval(() => {
        const panSpeed = 15 / viewer.camera.zoom;
        viewer.camera.position.x += panX * panSpeed;
        viewer.camera.position.y += panY * panSpeed;
        viewer.target.x += panX * panSpeed;
        viewer.target.y += panY * panSpeed;
        viewer.scheduleRender();
        
        // Update coordinates and cursor position based on CURRENT mouse pos
        const rect = viewer.canvas.getBoundingClientRect();
        const clampedX = Math.max(rect.left, Math.min(rect.right, lastMouseX));
        const clampedY = Math.max(rect.top, lastMouseY); 
        
        const worldPt = viewer.screenToWorld(clampedX, clampedY);
        unitsRibbon.updateCoordinates(worldPt.x, worldPt.y, app.doc.units, app.currentZ);
        app.move(clampedX, clampedY);
        updatePrompt();
      }, 50);
    }
  } else {
    if (autoPanInterval) {
      clearInterval(autoPanInterval);
      autoPanInterval = null;
    }
  }

  const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
  const clampedY = Math.max(rect.top, e.clientY); 

  const worldPt = viewer.screenToWorld(clampedX, clampedY)
  unitsRibbon.updateCoordinates(worldPt.x, worldPt.y, app.doc.units, app.currentZ)
  app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey)
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



  if (trimmedUpper === "QUIT" || trimmedUpper === "EXIT") {
    await app.execute('NEW')
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

function getClampedCoordinates(e: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
  const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
  return { clampedX, clampedY };
}

window.addEventListener('contextmenu', (e) => {
  if (e.target === canvas) {
    e.preventDefault();
  }
});

// Support clicking on command bar to define points when a command is active
window.addEventListener("pointerdown", (e) => {
  if (e.button === 2) {
    const selectedIds = Array.from(app.selectedEntityIds);
    if (selectedIds.length > 0) {
      const center = viewer.getCenterOfObjects(selectedIds);
      if (center) {
        viewer.target.copy(center);
      }
    }
  }

  const target = e.target as HTMLElement;
  const isCanvas = target === canvas;
  const isCmdArea = document.getElementById('command-area')?.contains(target);
  
  if (isCanvas || (isCmdArea && app.cmd.active && target.tagName !== 'INPUT' && !target.classList.contains('control-btn'))) {
    const { clampedX, clampedY } = getClampedCoordinates(e);
    app.pointerDown(clampedX, clampedY);
    

  }
});

window.addEventListener("pointerup", async (e) => {
  const target = e.target as HTMLElement;
  const isCanvas = target === canvas;
  const isCmdArea = document.getElementById('command-area')?.contains(target);
  
  if (isCanvas || (isCmdArea && app.cmd.active && target.tagName !== 'INPUT' && !target.classList.contains('control-btn'))) {
    const { clampedX, clampedY } = getClampedCoordinates(e);
    const res = await app.pointerUp(clampedX, clampedY, e.shiftKey, e.ctrlKey);
    if (typeof res === 'string' && res) {
      cmdLine.print(res);
    }
    // Force preview update (X markers, rubber-band) after click
    app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey);
    
    if (viewer.wasPanEnded()) {
      cmdLine.print("PAN ended.");
      app.terminateActiveCommand();
      viewer.clearPanEndedFlag();
    }
    
    updatePrompt();
  }
});
