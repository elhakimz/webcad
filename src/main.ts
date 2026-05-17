import * as THREE from "three"
import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { CommandLine } from "./ui/CommandLine"
import { RibbonContainer } from "./ui/RibbonContainer"
import { LayerInfoRibbonBar } from "./ui/LayerInfoRibbonBar"
import { DraftingAidsRibbonBar } from "./ui/DraftingAidsRibbonBar"
import { UnitsAndCoordRibbonBar } from "./ui/UnitsAndCoordRibbonBar"
import { DisplayRibbonBar } from "./ui/DisplayRibbonBar"
import { SettingsRibbonBar } from "./ui/SettingsRibbonBar"
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
import { ScadEditor } from "./ui/ScadEditor"
import { AppTabs } from "./ui/AppTabs"
import { ScadRibbonBar } from "./ui/ScadRibbonBar"

// 1. Core Setup
const canvas = document.getElementById("c") as HTMLCanvasElement
const viewer = new Viewer(canvas)
const app = new App(viewer)
const cmdLine = new CommandLine()
const dockingManager = new DockingManager()

// Initialize layers
app.doc.layers.createLayer("1", 7, "CONTINUOUS");
app.doc.layers.createLayer("2", 4, "CONTINUOUS");
app.doc.layers.createLayer("01", 3, "DASHDOT");

cmdLine.setCommands(app.cmd.getAvailableCommands());
app.setCommandLine((msg: string) => cmdLine.print(msg))

// 2. UI Components (Ribbons & Tools)
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
  updateStatusBar();
}, () => {
  app.doc.currentElevation = 0;
  app.currentZ = 0;
  if ((app as any).lastWorldPt) {
    const pt = (app as any).lastWorldPt;
    unitsRibbon.updateCoordinates(pt.x, pt.y, app.doc.units, app.currentZ, app.doc.currentElevation);
  }
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
  }
});

const settingsRibbon = new SettingsRibbonBar((theme) => {
  viewer.setTheme(theme);
});

const scadEditor = new ScadEditor(dockingManager, (geometries) => {
  geometries.forEach(geo => {
    viewer.addTemporaryMesh(geo);
  });
});

const scadRibbon = new ScadRibbonBar((action) => {
  if (action === 'RUN') scadEditor.runScad();
  if (action === 'CUSTOMIZE') scadEditor.openCustomizer();
  if (action === 'CLEAR') viewer.clearTemporaryMeshes();
});

// 3. Tab Manager & Layout Assembly
const appTabs = new AppTabs((mode) => {
  ribbonContainer.getElement().innerHTML = '';
  const dock = document.getElementById('docking-pane');
  const toolBar = toolWindowBar.getElement();
  
  // Set viewer context (separate Modelling vs Scripting context)
  viewer.setViewContext(mode as 'modelling' | 'scripting');

  if (mode === 'scripting') {
    ribbonContainer.addBar(scadRibbon);
    ribbonContainer.addBar(settingsRibbon);
    if (toolBar) toolBar.style.display = 'none';
    
    // Dock SCAD editor and make dock wider
    if (dock) {
      dock.style.display = 'flex';
      dock.style.width = '450px';
      dockingManager.dock('scad_editor');
      dockingManager.showWindow('scad_editor');
      // Hide other docked windows if any
      dock.querySelectorAll('.dockable-window:not(#scad-editor-window)').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    }
  } else {
    ribbonContainer.addBar(layerRibbon);
    ribbonContainer.addBar(draftingRibbon);
    ribbonContainer.addBar(unitsRibbon);
    ribbonContainer.addBar(displayRibbon);
    ribbonContainer.addBar(settingsRibbon);
    if (toolBar) toolBar.style.display = 'flex';
    
    // Restore modelling dock
    if (dock) {
      dock.style.display = 'flex';
      dock.style.width = '180px';
      dockingManager.hideWindow('scad_editor');
      // Show other docked windows
      dock.querySelectorAll('.dockable-window:not(#scad-editor-window)').forEach(el => {
        (el as HTMLElement).style.display = 'flex';
      });
    }
  }
});

const appEl = document.getElementById('app')!;
appEl.insertBefore(appTabs.getElement(), appEl.firstChild);

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

// Default view initialization
ribbonContainer.addBar(layerRibbon);
ribbonContainer.addBar(draftingRibbon);
ribbonContainer.addBar(unitsRibbon);
ribbonContainer.addBar(displayRibbon);
ribbonContainer.addBar(settingsRibbon);
dockingManager.hideWindow('scad_editor');

const dazControl = new DazViewControl(viewer, app);
const vpContainer = document.getElementById('viewport-container');
if (vpContainer) {
  vpContainer.appendChild(dazControl.getElement());
}

// 4. Toolbars & Floating Windows
const toolWindowBar = new ToolWindowBar();
const layersWindow = new ToolWindow("layers", "Layers");

const mainArea = document.getElementById('main-area')!;
mainArea.insertBefore(toolWindowBar.getElement(), mainArea.firstChild);
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

const propertiesToolbar = new ToolWindow("properties", "Properties");
mainArea.insertBefore(propertiesToolbar.getElement(), layersWindow.getElement().nextSibling);
toolWindowBar.addWindow("P", propertiesToolbar);
const propertiesWindow = new PropertiesWindow(propertiesToolbar, app);
app.setPropertiesWindow(propertiesWindow);
app.setLayersWindowUpdate(() => layerWindow.refresh());

const floatingToolbar = new FloatingToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') cmdLine.print(res)
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const dimToolbar = new DimToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') cmdLine.print(res)
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const editToolbar = new EditToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') cmdLine.print(res)
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const inquiryToolbar = new InquiryToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') cmdLine.print(res)
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const solidToolbar = new SolidToolbar(async (cmd) => {
  cmdLine.print(`Command: ${cmd}`)
  const res = await app.execute(cmd)
  if (typeof res === 'string') cmdLine.print(res)
  cmdLine.focus()
  updatePrompt()
}, dockingManager)

const fileToolbar = new ToolWindow("file", "File Operations")
const fileToolWindow = new FileToolWindow(fileToolbar, app)
mainArea.insertBefore(fileToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("F", fileToolbar)

// 5. App State & Engine Init
viewer.resize()
window.addEventListener("resize", () => viewer.resize())

const viewportContainer = document.getElementById("viewport-container");
if (viewportContainer) {
  const resizeObserver = new ResizeObserver(() => {
    viewer.resize();
    viewer.render();
  });
  resizeObserver.observe(viewportContainer);
}

const editor = document.getElementById('drawing-editor');
if (editor) editor.style.display = 'block';

floatingToolbar.show();
dimToolbar.show();
editToolbar.show();
inquiryToolbar.show();
solidToolbar.show();

Promise.all([
  OpenCascadeService.getInstance().init(),
  app.persistence.init()
])
.then(async () => {
  await app.execute('NEW');
  viewer.resize();
  viewer.render();
  
  const cmdInput = document.getElementById('cmd') as HTMLInputElement;
  if (cmdInput) cmdInput.focus();
  updatePrompt();
  
  fileToolWindow.renderTableBody();
})
.catch((err: any) => {
  console.error("Failed to initialize CAD Engine:", err);
});

// 6. Event Handling
let lastMouseX = 0
let lastMouseY = 0

function updatePrompt() {
  const activeCmd = app.cmd.active;
  if (activeCmd && activeCmd.getPrompt) {
    cmdLine.setPrompt(activeCmd.getPrompt(app.doc));
  } else {
    cmdLine.setPrompt("Command:");
  }
}

app.setPromptUpdate(() => updatePrompt());

let autoPanInterval: any = null;
let panX = 0;
let panY = 0;
const isAutoPanEnabled = false;

window.addEventListener("mousemove", (e) => {
  const dx = e.clientX - lastMouseX;
  const dy = e.clientY - lastMouseY;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  if (e.buttons & 2) {
    if (app.activeCenterGrip) {
      const rect = viewer.canvas.getBoundingClientRect();
      const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const clampedY = Math.max(rect.top, e.clientY); 
      app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey);
    } else {
      viewer.orbit(dx, dy);
    }
    return;
  }

  const rect = viewer.canvas.getBoundingClientRect();
  const margin = 30;
  
  panX = 0;
  panY = 0;
  
  const isInsideCanvas = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

  if (e.clientX < rect.left + margin) panX = -1;
  if (e.clientX > rect.right - margin) panX = 1;
  if (e.clientY < rect.top + margin) panY = 1;
  if (e.clientY > rect.bottom - margin) panY = -1;

  if (isAutoPanEnabled && isInsideCanvas && (panX !== 0 || panY !== 0)) {
    if (!autoPanInterval) {
      autoPanInterval = setInterval(() => {
        const panSpeed = 15 / viewer.camera.zoom;
        viewer.camera.position.x += panX * panSpeed;
        viewer.camera.position.y += panY * panSpeed;
        viewer.target.x += panX * panSpeed;
        viewer.target.y += panY * panSpeed;
        viewer.scheduleRender();
        
        const rect = viewer.canvas.getBoundingClientRect();
        const clampedX = Math.max(rect.left, Math.min(rect.right, lastMouseX));
        const clampedY = Math.max(rect.top, lastMouseY); 
        
        const worldPt = viewer.screenToWorld(clampedX, clampedY);
        unitsRibbon.updateCoordinates(worldPt.x, worldPt.y, app.doc.units, app.currentZ, app.doc.currentElevation);
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
  unitsRibbon.updateCoordinates(worldPt.x, worldPt.y, app.doc.units, app.currentZ, app.doc.currentElevation)
  app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey)
  if (app.cmd.active) updatePrompt()
})

window.addEventListener("keydown", async (e) => {
  if (!app.cmd.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    const key = e.key;
    if (key.length === 1 && /^[a-z0-9]$/i.test(key)) {
      const cmdInput = document.getElementById('cmd') as HTMLInputElement;
      if (cmdInput && document.activeElement !== cmdInput) cmdInput.focus();
    }
  } else if (app.cmd.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
    if (e.key.length === 1) app.focusDynamicInput();
  }

  if (e.key === 'F7') { e.preventDefault(); app.drafting.toggleGrid(); return; }
  if (e.key === 'F8') { e.preventDefault(); app.drafting.toggleOrtho(); return; }
  if (e.key === 'F9') { e.preventDefault(); app.drafting.toggleSnap(); return; }

  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    const res = await app.execute('UNDO');
    if (typeof res === 'string') cmdLine.print(res);
    updatePrompt();
    return;
  }
  if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    const res = await app.execute('REDO');
    if (typeof res === 'string') cmdLine.print(res);
    updatePrompt();
    return;
  }

  if (e.key === 'Escape') {
    if (app.activeGrip) {
      app.activeGrip = null;
      viewer.setPreview(null);
      cmdLine.print("*Cancel Grip Edit*");
      updatePrompt();
      return;
    }
    if (app.cmd.active) {
      cmdLine.print("*Cancel*")
      app.terminateActiveCommand()
      viewer.setLeftPanEnabled(false)
      updatePrompt()
      return
    }
  }

  if (document.activeElement?.id === "cmd" || document.activeElement?.id === "main-menu-input") return
  if (e.ctrlKey || e.altKey || e.metaKey) return

  if (app.cmd.active) {
    const key = e.key.toLowerCase()
    const isLetter = key.length === 1 && key >= 'a' && key <= 'z'
    const isAction = key === 'enter'

    if (isLetter || isAction) {
      const inputVal = key === 'enter' ? "" : key.toUpperCase()
      if (inputVal !== "") cmdLine.print(`Command: ${inputVal}`)
      const res = await app.inputText(inputVal)
      if (typeof res === 'string') cmdLine.print(res)
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
  let res = await app.inputText(val)
  if (!res || typeof res === 'string' && res.startsWith("Unknown")) res = await app.execute(trimmedUpper)
  if (typeof res === 'string') cmdLine.print(res)
  updatePrompt()
})

window.addEventListener('contextmenu', (e) => { if (e.target === canvas) e.preventDefault(); });

window.addEventListener("pointerdown", (e) => {
  const target = e.target as HTMLElement;
  const isCanvas = target === canvas;
  const isCmdArea = document.getElementById('command-area')?.contains(target);
  if (isCanvas || (isCmdArea && app.cmd.active && target.tagName !== 'INPUT' && !target.classList.contains('control-btn'))) {
    const rect = canvas.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    app.pointerDown(clampedX, clampedY, e.button, e.shiftKey);
  }
});

window.addEventListener("pointerup", async (e) => {
  const target = e.target as HTMLElement;
  const isCanvas = target === canvas;
  const isCmdArea = document.getElementById('command-area')?.contains(target);
  if (isCanvas || (isCmdArea && app.cmd.active && target.tagName !== 'INPUT' && !target.classList.contains('control-btn'))) {
    const rect = canvas.getBoundingClientRect();
    const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
    const clampedY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
    const res = await app.pointerUp(clampedX, clampedY, e.shiftKey, e.ctrlKey);
    if (typeof res === 'string' && res) cmdLine.print(res);
    app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey);
    updatePrompt();
  }
});
