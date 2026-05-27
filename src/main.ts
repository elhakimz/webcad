import * as THREE from "three"
import { Viewer } from "./render/Viewer"
import { App } from "./app"
import { Entity } from "./core/model/Entity"

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
import { ObjectsWindow } from "./ui/ObjectsWindow"
import { DimToolbar } from "./ui/DimToolbar"
import { EditToolbar } from "./ui/EditToolbar"
import { InquiryToolbar } from "./ui/InquiryToolbar"
import { SolidToolbar } from "./ui/SolidToolbar"
import { FileToolWindow } from "./ui/FileToolWindow"
import { ScadEditor } from "./ui/ScadEditor"
import { AppTabs } from "./ui/AppTabs"
import { ScadRibbonBar } from "./ui/ScadRibbonBar"
import { ProjectToolWindow } from "./ui/ProjectToolWindow"
import { BlockToolWindow } from "./ui/BlockToolWindow"
import { GeneratorToolWindow } from "./ui/GeneratorToolWindow"
import { SketchToolWindow } from "./ui/SketchToolWindow"

// 1. Core Setup
const canvas = document.getElementById("c") as HTMLCanvasElement
const viewer = new Viewer(canvas)
const app = new App(viewer)
;(window as any).app = app
const cmdLine = new CommandLine()
const dockingManager = new DockingManager()

// Global Alert and Exception Redirection to Command Bar
window.alert = (message?: any) => {
  console.warn("[Intercepted Alert]", message);
  const msgStr = String(message ?? '');
  const prefix = (msgStr.toUpperCase().startsWith("ERROR") || msgStr.toUpperCase().startsWith("FAILED")) ? "" : "Error: ";
  cmdLine.print(`${prefix}${msgStr}`);
};

window.addEventListener("error", (event) => {
  const errorMsg = event.error ? (event.error.message || String(event.error)) : event.message;
  if (errorMsg.includes("__cxa_can_catch") || errorMsg.includes("Parametric rebuild failed")) {
    event.preventDefault(); // Prevent Vite/browser crash overlays for parametric errors
  }
  cmdLine.print(`Error: Uncaught exception: ${errorMsg}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const errorMsg = reason ? (reason.message || String(reason)) : "Unknown rejection";
  if (errorMsg.includes("__cxa_can_catch") || errorMsg.includes("Parametric rebuild failed")) {
    event.preventDefault(); // Prevent Vite/browser crash overlays for parametric errors
  }
  cmdLine.print(`Error: Unhandled promise rejection: ${errorMsg}`);
});

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
  } else if (action.startsWith('SHADING_')) {
    await app.execute(action);
  }
});

const settingsRibbon = new SettingsRibbonBar((theme) => {
  viewer.setTheme(theme);
});



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

const objectsToolbar = new ToolWindow("objects", "Objects");
mainArea.insertBefore(objectsToolbar.getElement(), propertiesToolbar.getElement().nextSibling);
toolWindowBar.addWindow("O", objectsToolbar);
const objectsWindow = new ObjectsWindow(objectsToolbar, app);

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
app.setFilesWindowUpdate(() => fileToolWindow.renderTableBody())
mainArea.insertBefore(fileToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("F", fileToolbar)

const blockToolbar = new ToolWindow("block", "Block Library")
const blockToolWindow = new BlockToolWindow(blockToolbar, app)
mainArea.insertBefore(blockToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("B", blockToolbar)

const generatorToolbar = new ToolWindow("generator", "Object Generator")
const generatorToolWindow = new GeneratorToolWindow(generatorToolbar, app)
mainArea.insertBefore(generatorToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("G", generatorToolbar)

const sketchToolbar = new ToolWindow("sketch", "Sketching")
const sketchToolWindow = new SketchToolWindow(sketchToolbar, app)
app.setSketchToolWindow(sketchToolWindow)
mainArea.insertBefore(sketchToolbar.getElement(), toolWindowBar.getElement().nextSibling);
toolWindowBar.addWindow("SK", sketchToolbar)

// 4b. SCAD Scripting Tools & Tabs Setup
const scadEditor = new ScadEditor((geometries) => {
  viewer.clearTemporaryMeshes();
  geometries.forEach(geo => {
    if (geo instanceof Entity) {
      viewer.addTemporaryEntity(geo);
    } else {
      const color = geo.userData?.color;
      viewer.addTemporaryMesh(geo, color);
    }
  });
}, app);

const scadProjectsToolbar = new ToolWindow("scad_projects", "SCAD Projects");
const projectToolWindow = new ProjectToolWindow(scadProjectsToolbar, scadEditor);

// Insert SCAD Projects Window directly into the main-area next to the ToolWindowBar, and append the raw SCAD Editor to the right of the workspace
mainArea.insertBefore(scadProjectsToolbar.getElement(), toolWindowBar.getElement().nextSibling);
mainArea.appendChild(scadEditor.getElement());

// Add SCAD projects tool to the left toolbar
toolWindowBar.addWindow("PR", scadProjectsToolbar);

const scadRibbon = new ScadRibbonBar((action) => {
  if (action === 'RUN') scadEditor.runScad();
  if (action === 'CUSTOMIZE') scadEditor.openCustomizer();
  if (action === 'CLEAR') viewer.clearTemporaryMeshes();
});

// 3. Tab Manager & Layout Assembly
const appTabs = new AppTabs((mode) => {
  ribbonContainer.getElement().innerHTML = '';
  const toolBar = toolWindowBar.getElement();
  const dock = document.getElementById('docking-pane');
  
  // Set viewer context (separate Modelling vs Scripting context)
  viewer.setViewContext(mode as 'modelling' | 'scripting');

  if (mode === 'scripting') {
    ribbonContainer.addBar(scadRibbon);
    ribbonContainer.addBar(settingsRibbon);
    if (toolBar) toolBar.style.display = 'flex';
    
    // Manage toolbar icons visibility for scripting
    toolWindowBar.setVisible('scad_projects', true);
    toolWindowBar.setVisible('file', false);
    toolWindowBar.setVisible('block', false);
    toolWindowBar.setVisible('properties', false);
    toolWindowBar.setVisible('objects', false);
    toolWindowBar.setVisible('layers', false);

    // Make SCAD projects panel active on the left panel
    toolWindowBar.setActive('scad_projects', true);

    // Show raw SCAD Editor panel on the right side of the workspace
    scadEditor.show();

    // Hide modelling toolbars and docking pane in scripting mode
    if (dock) dock.style.display = 'none';
    floatingToolbar.hide();
    dimToolbar.hide();
    editToolbar.hide();
    inquiryToolbar.hide();
    solidToolbar.hide();
  } else {
    ribbonContainer.addBar(layerRibbon);
    ribbonContainer.addBar(draftingRibbon);
    ribbonContainer.addBar(unitsRibbon);
    ribbonContainer.addBar(displayRibbon);
    ribbonContainer.addBar(settingsRibbon);
    if (toolBar) toolBar.style.display = 'flex';
    
    // Manage toolbar icons visibility for modelling
    toolWindowBar.setVisible('scad_projects', false);
    toolWindowBar.setVisible('file', true);
    toolWindowBar.setVisible('block', true);
    toolWindowBar.setVisible('properties', true);
    toolWindowBar.setVisible('objects', true);
    toolWindowBar.setVisible('layers', true);

    // Make layers active on the left panel
    toolWindowBar.setActive('layers', true);

    // Hide raw SCAD Editor panel in modelling mode
    scadEditor.hide();

    // Restore modelling toolbars and docking pane in modelling mode
    if (dock) {
      dock.style.display = 'flex';
      dock.style.width = '180px';
    }
    floatingToolbar.show();
    dimToolbar.show();
    editToolbar.show();
    inquiryToolbar.show();
    solidToolbar.show();
  }
});

const appEl = document.getElementById('app')!;
appEl.insertBefore(appTabs.getElement(), appEl.firstChild);

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

  if ((e.buttons & 2) && !viewer.isPanning) {
    if (app.activeCenterGrip) {
      const rect = viewer.canvas.getBoundingClientRect();
      const clampedX = Math.max(rect.left, Math.min(rect.right, e.clientX));
      const clampedY = Math.max(rect.top, e.clientY); 
      app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey);
    } else if (!viewer.isPlainView) {
      // Only orbit in 3D/orthogonal views; plain views (TOP/FRONT/LEFT/RIGHT) keep camera angle locked
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
    if (document.activeElement && (
      document.activeElement.tagName === 'INPUT' || 
      document.activeElement.tagName === 'TEXTAREA' ||
      document.activeElement.getAttribute('contenteditable') === 'true' ||
      document.activeElement.closest('.cm-content') !== null
    )) return;
    const key = e.key;
    if (key.length === 1 && /^[a-z0-9]$/i.test(key)) {
      const cmdInput = document.getElementById('cmd') as HTMLInputElement;
      if (cmdInput && document.activeElement !== cmdInput) cmdInput.focus();
    }
  } else if (app.cmd.active && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (document.activeElement && (
      document.activeElement.tagName === 'INPUT' || 
      document.activeElement.tagName === 'TEXTAREA' ||
      document.activeElement.getAttribute('contenteditable') === 'true' ||
      document.activeElement.closest('.cm-content') !== null
    )) return;
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

window.addEventListener('contextmenu', (e) => {
  if (e.target === canvas) {
    e.preventDefault();
    if (viewer.isPanningActive() || viewer.wasViewportPanEnded() || e.buttons === 3) {
      return;
    }
    app.showDraftingContextMenu(e.clientX, e.clientY);
  }
});

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
    const res = await app.pointerUp(clampedX, clampedY, e.shiftKey, e.ctrlKey, e.button);
    if (typeof res === 'string' && res) cmdLine.print(res);
    app.move(clampedX, clampedY, e.ctrlKey, e.shiftKey);
    updatePrompt();
  }
});
