import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { DockingManager } from "./DockingManager";
import { ToolWindow } from "./ToolWindow";
import { ScadManager } from "../scad/ScadManager";
import { ParameterExtractor } from "../scad/parser/ParameterExtractor";
import { ScadParameterDialog } from "./ScadParameterDialog";
import { Solid3D } from "../core/model/Solid3D";
import { Polyline } from "../core/model/Polyline";
import { Insert } from "../core/model/Insert";
import { Entity } from "../core/model/Entity";
import { NotificationManager } from "./NotificationManager";

class ScadInputDialog {
  private overlay: HTMLElement;
  private container: HTMLElement;

  constructor(
    private title: string,
    private labelText: string,
    private defaultValue: string,
    private onSubmit: (value: string) => void,
    private onCancel: () => void
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'scad-dialog-overlay';
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center',
      alignItems: 'center', zIndex: '3000', fontFamily: 'var(--font-mono)'
    });

    this.container = document.createElement('div');
    this.container.className = 'scad-dialog';
    Object.assign(this.container.style, {
      backgroundColor: 'var(--panel-bg)', border: '1px solid var(--border-color)',
      padding: '20px', color: 'var(--text-color)', width: '350px',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', gap: '15px'
    });

    this.createUI();
    this.overlay.appendChild(this.container);
  }

  private createUI() {
    const titleEl = document.createElement('h2');
    titleEl.textContent = this.title;
    titleEl.style.margin = '0 0 5px 0';
    titleEl.style.color = 'var(--accent-color)';
    titleEl.style.fontSize = '16px';
    this.container.appendChild(titleEl);

    const descEl = document.createElement('div');
    descEl.textContent = this.labelText;
    Object.assign(descEl.style, {
      fontSize: '12px',
      opacity: '0.8',
      whiteSpace: 'pre-wrap',
      maxHeight: '150px',
      overflowY: 'auto',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      padding: '6px',
      backgroundColor: 'rgba(0, 0, 0, 0.2)'
    });
    this.container.appendChild(descEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.defaultValue;
    Object.assign(input.style, {
      width: '100%', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
      color: 'var(--text-color)', fontFamily: 'var(--font-mono)', padding: '6px', boxSizing: 'border-box'
    });
    this.container.appendChild(input);

    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px'
    });

    const cancelBtn = this.createButton('Cancel', 'scad-btn-cancel', () => {
      this.onCancel();
      this.close();
    });

    const submitBtn = this.createButton('OK', 'scad-btn-run', () => {
      this.onSubmit(input.value.trim());
      this.close();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.onSubmit(input.value.trim());
        this.close();
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    this.container.appendChild(actions);

    setTimeout(() => input.focus(), 50);
  }

  private createButton(text: string, className: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.className = className;
    Object.assign(btn.style, {
      padding: '6px 15px', border: 'none',
      cursor: 'pointer', borderRadius: '3px', fontWeight: 'bold',
      fontFamily: 'var(--font-mono)'
    });
    btn.onclick = onClick;
    return btn;
  }

  public show() {
    document.body.appendChild(this.overlay);
  }

  public close() {
    this.overlay.remove();
  }
}

const customTheme = EditorView.theme({
  "&": {
    color: "var(--text-color)",
    backgroundColor: "var(--bg-color)",
    height: "100%",
    fontSize: "12px"
  },
  ".cm-content": {
    caretColor: "var(--text-color)"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-color)"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(59, 130, 246, 0.3) !important"
  },
  ".cm-gutters": {
    backgroundColor: "var(--panel-bg)",
    color: "var(--text-color)",
    opacity: "0.6",
    borderRight: "1px solid var(--border-color)"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.03)"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    color: "var(--text-color)"
  },
  ".cm-scroller": {
    overflow: "auto"
  }
});

const customHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--accent-color)", fontWeight: "bold" },
  { tag: t.comment, color: "#8b949e", fontStyle: "italic" },
  { tag: t.string, color: "#28a745" },
  { tag: t.number, color: "var(--error-color)" },
  { tag: t.variableName, color: "var(--text-color)" },
  { tag: t.operator, color: "var(--text-color)" },
  { tag: t.bool, color: "var(--error-color)", fontWeight: "bold" },
  { tag: t.meta, color: "#8b949e" }
]);

export class ScadEditor {
  private container: HTMLElement;
  private editorView: EditorView;
  private scadManager: ScadManager;
  private extractor: ParameterExtractor;
  private lastGeometries: any[] = [];
  public currentProject: string = "myproject";
  public currentFile: string = "main.scad";

  constructor(
    private onRender: (geometries: any[]) => void,
    private app?: any
  ) {
    this.scadManager = new ScadManager();
    this.extractor = new ParameterExtractor();
    this.container = document.createElement('div');
    this.container.id = 'scad-editor-window';
    this.container.className = 'scad-editor-window';
    Object.assign(this.container.style, {
      height: '100%',
      width: '450px',
      minWidth: '450px',
      display: 'none', // Start hidden by default, managed by mode switching
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: 'var(--panel-bg)'
    });

    // Create vertical resizer bar on the left edge
    const resizer = document.createElement('div');
    resizer.className = 'scad-editor-resizer';
    Object.assign(resizer.style, {
      width: '4px',
      minWidth: '4px',
      height: '100%',
      cursor: 'col-resize',
      backgroundColor: 'var(--border-color)',
      transition: 'background-color 0.2s',
      zIndex: '10'
    });

    // Create main content area inside the editor panel
    const editorInner = document.createElement('div');
    editorInner.className = 'scad-editor-inner';
    Object.assign(editorInner.style, {
      flex: '1',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: 'var(--panel-bg)',
      minWidth: '0'
    });

    editorInner.innerHTML = `
      <div class="scad-toolbar" style="display: flex; gap: 5px; padding: 5px; background: var(--panel-bg); border-bottom: 1px solid var(--border-color); flex-wrap: wrap;">
        <button id="scad-custom-btn" class="scad-action-btn" style="flex: 1; font-size: 11px; padding: 4px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); font-weight: bold; background: var(--panel-bg); color: var(--text-color); cursor: pointer;">Customize</button>
        <button id="scad-run-btn" class="scad-action-btn scad-run-btn" style="flex: 1; font-size: 11px; padding: 4px; border: none; border-radius: var(--radius-sm); font-weight: bold; background: #28a745; color: white; cursor: pointer;">Run Script</button>
      </div>
      <div class="scad-toolbar" style="display: flex; gap: 5px; padding: 5px; background: var(--panel-bg); border-bottom: 1px solid var(--border-color); flex-wrap: wrap;">
        <button id="scad-load-btn" class="scad-action-btn" style="flex: 1; font-size: 11px; padding: 4px;">Load Project</button>
        <button id="scad-save-btn" class="scad-action-btn" style="flex: 1; font-size: 11px; padding: 4px;">Save Project</button>
        <button id="scad-export-3d-btn" class="scad-action-btn" style="flex: 1; font-size: 11px; padding: 4px;">Export 3D</button>
        <button id="scad-export-2d-btn" class="scad-action-btn" style="flex: 1; font-size: 11px; padding: 4px;">Export 2D</button>
      </div>
      <div id="scad-cm-container" class="scad-cm-container" style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;"></div>
    `;

    this.container.appendChild(resizer);
    this.container.appendChild(editorInner);

    // Dynamic resize dragging
    let isDragging = false;
    resizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      resizer.style.backgroundColor = 'var(--accent-color)';
      const startX = e.clientX;
      const startWidth = this.container.getBoundingClientRect().width;
      
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging) return;
        const deltaX = startX - moveEvent.clientX;
        const newWidth = Math.max(250, Math.min(1000, startWidth + deltaX));
        this.container.style.width = `${newWidth}px`;
        this.container.style.minWidth = `${newWidth}px`;
        
        window.dispatchEvent(new Event('resize'));
      };

      const onMouseUp = () => {
        isDragging = false;
        resizer.style.backgroundColor = 'var(--border-color)';
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    resizer.addEventListener('mouseenter', () => {
      if (!isDragging) resizer.style.backgroundColor = 'var(--accent-color)';
    });
    resizer.addEventListener('mouseleave', () => {
      if (!isDragging) resizer.style.backgroundColor = 'var(--border-color)';
    });

    const cmContainer = editorInner.querySelector('#scad-cm-container') as HTMLElement;
    this.editorView = new EditorView({
      doc: `// ========================================================
// Parametric 3D Spur Gear
// ========================================================

// Primary Gear Parameters
num_teeth = 18;
pitch_radius = 28;
thickness = 6;
shaft_radius = 5;

// Calculated structural parameters
tooth_width = 3.5;
tooth_depth = 4.2;
hub_radius = 16;
hub_thickness = 10;

// Radially placed gear teeth
module gear_teeth() {
    // 360 / 18 teeth = 20-degree increments
    for (angle = [0:20:340]) {
        rotate([0, 0, angle]) {
            // Position the tooth at the gear's perimeter
            translate([pitch_radius, 0, 0]) {
                // Renders a perfectly centered gear tooth
                cube([tooth_depth, tooth_width, thickness], center=true);
            }
        }
    }
}

// Assemble the final gear structure
difference() {
    union() {
        // Main gear blank disc (using minor/dedendum radius)
        cylinder(h=thickness, r=pitch_radius - tooth_depth * 0.5, center=true);
        
        // Raised center hub to support axle loading
        cylinder(h=hub_thickness, r=hub_radius, center=true);
        
        // Radial array of gear teeth
        gear_teeth();
    }
    
    // Subtracted core shaft cutout through the center of the gear
    cylinder(h=hub_thickness + 2, r=shaft_radius, center=true);
}
`,
      extensions: [
        basicSetup,
        javascript(),
        customTheme,
        syntaxHighlighting(customHighlightStyle)
      ],
      parent: cmContainer
    });

    const runBtn = editorInner.querySelector('#scad-run-btn')!;
    runBtn.addEventListener('click', () => this.runScad());

    const customBtn = editorInner.querySelector('#scad-custom-btn')!;
    customBtn.addEventListener('click', () => this.openCustomizer());

    const loadBtn = editorInner.querySelector('#scad-load-btn')!;
    loadBtn.addEventListener('click', () => this.loadProject());

    const saveBtn = editorInner.querySelector('#scad-save-btn')!;
    saveBtn.addEventListener('click', () => this.saveProject());

    const export3dBtn = editorInner.querySelector('#scad-export-3d-btn')!;
    export3dBtn.addEventListener('click', () => this.export3DBlock());

    const export2dBtn = editorInner.querySelector('#scad-export-2d-btn')!;
    export2dBtn.addEventListener('click', () => this.export2DBlock());
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public show() {
    this.container.style.display = 'flex';
  }

  public hide() {
    this.container.style.display = 'none';
  }

  public setCode(code: string) {
    if (this.editorView) {
      this.editorView.dispatch({
        changes: {
          from: 0,
          to: this.editorView.state.doc.length,
          insert: code
        }
      });
    }
  }

  public getCode(): string {
    return this.editorView ? this.editorView.state.doc.toString() : '';
  }

  public openCustomizer() {
    const code = this.editorView.state.doc.toString();
    
    // Clean up viewport screen and interpreter stack immediately
    if (this.app?.viewer) {
      this.app.viewer.clearTemporaryMeshes();
      this.app.viewer.render();
    }
    this.scadManager.clearCache().catch(e => {
      console.warn("Failed to clear SCAD interpreter cache on customize:", e);
    });

    const params = this.extractor.extract(code);
    
    const dialog = new ScadParameterDialog(
      "SCAD Customizer",
      "Adjust parameters and execute the script.",
      params,
      (values) => {
        this.runScad(values);
        dialog.close();
      },
      (values) => {
        this.runScad(values); // Evaluate also runs for now
      },
      () => {}
    );
    dialog.show();
  }

  private progressOverlay: HTMLDivElement | null = null;
  private progressFill: HTMLDivElement | null = null;
  private progressLabel: HTMLDivElement | null = null;

  private showProgressBar() {
    if (!this.progressOverlay) {
      this.progressOverlay = document.createElement('div');
      this.progressOverlay.id = 'scad-progress-overlay';
      Object.assign(this.progressOverlay.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        width: '320px',
        padding: '16px',
        borderRadius: '8px',
        background: 'rgba(18, 18, 24, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.2)',
        zIndex: '10000',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#ffffff',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        opacity: '0',
        transform: 'translate(-50%, -10px)'
      });

      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      });

      this.progressLabel = document.createElement('div');
      this.progressLabel.textContent = 'Compiling OpenSCAD...';
      Object.assign(this.progressLabel.style, {
        fontSize: '13px',
        fontWeight: '600',
        letterSpacing: '0.5px',
        color: '#e2e8f0'
      });

      const spinner = document.createElement('div');
      spinner.className = 'scad-spinner';
      Object.assign(spinner.style, {
        width: '12px',
        height: '12px',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        borderTop: '2px solid #3b82f6',
        borderRadius: '50%',
        animation: 'scad-spin 0.8s linear infinite',
        display: 'block'
      });

      if (!document.getElementById('scad-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'scad-spinner-style';
        style.textContent = `
          @keyframes scad-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes scad-progress-glow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `;
        document.head.appendChild(style);
      }

      header.appendChild(this.progressLabel);
      header.appendChild(spinner);

      const track = document.createElement('div');
      Object.assign(track.style, {
        width: '100%',
        height: '6px',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '3px',
        overflow: 'hidden',
        position: 'relative'
      });

      this.progressFill = document.createElement('div');
      Object.assign(this.progressFill.style, {
        width: '15%',
        height: '100%',
        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)',
        backgroundSize: '200% 200%',
        borderRadius: '3px',
        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        animation: 'scad-progress-glow 3s ease infinite'
      });

      track.appendChild(this.progressFill);
      this.progressOverlay.appendChild(header);
      this.progressOverlay.appendChild(track);
      document.body.appendChild(this.progressOverlay);
    }

    this.progressLabel!.textContent = 'Compiling SCAD...';
    this.progressLabel!.style.color = '#e2e8f0';
    this.progressFill!.style.width = '15%';
    this.progressFill!.style.background = 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899)';
    this.progressFill!.style.animation = 'scad-progress-glow 3s ease infinite';

    const spinnerEl = this.progressOverlay.querySelector('.scad-spinner');
    if (spinnerEl) {
      (spinnerEl as HTMLElement).style.display = 'block';
    }

    this.progressOverlay.offsetHeight;
    this.progressOverlay.style.opacity = '1';
    this.progressOverlay.style.transform = 'translate(-50%, 0)';

    let currentWidth = 15;
    const interval = setInterval(() => {
      if (!this.progressOverlay || currentWidth >= 85) {
        clearInterval(interval);
        return;
      }
      currentWidth += (85 - currentWidth) * 0.15;
      if (this.progressFill) {
        this.progressFill.style.width = `${currentWidth}%`;
      }
    }, 150);

    (this.progressOverlay as any)._interval = interval;
  }

  private updateProgress(percent: number, message: string, isError: boolean = false) {
    if (!this.progressOverlay) return;

    if ((this.progressOverlay as any)._interval) {
      clearInterval((this.progressOverlay as any)._interval);
    }

    if (this.progressLabel) {
      this.progressLabel.textContent = message;
      if (isError) {
        this.progressLabel.style.color = '#ef4444';
      }
    }

    if (this.progressFill) {
      this.progressFill.style.width = `${percent}%`;
      if (isError) {
        this.progressFill.style.background = '#ef4444';
        this.progressFill.style.animation = 'none';
      }
    }

    const spinnerEl = this.progressOverlay.querySelector('.scad-spinner');
    if (spinnerEl) {
      (spinnerEl as HTMLElement).style.display = 'none';
    }
  }

  private hideProgressBar(delay: number = 500) {
    if (!this.progressOverlay) return;

    if ((this.progressOverlay as any)._interval) {
      clearInterval((this.progressOverlay as any)._interval);
    }

    setTimeout(() => {
      if (this.progressOverlay) {
        this.progressOverlay.style.opacity = '0';
        this.progressOverlay.style.transform = 'translate(-50%, -10px)';
        const overlay = this.progressOverlay;
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.remove();
          }
          if (this.progressOverlay === overlay) {
            this.progressOverlay = null;
            this.progressFill = null;
            this.progressLabel = null;
          }
        }, 300);
      }
    }, delay);
  }

  public async runScad(overrides?: Record<string, any>) {
    const code = this.editorView.state.doc.toString();
    console.log("Running SCAD...");
    this.showProgressBar();

    await new Promise(resolve => requestAnimationFrame(resolve));

    // Clean up viewport screen and interpreter stack immediately
    if (this.app?.viewer) {
      this.app.viewer.clearTemporaryMeshes();
      this.app.viewer.render();
    }
    try {
      await this.scadManager.clearCache();
    } catch (e) {
      console.warn("Failed to clear SCAD interpreter cache:", e);
    }
    
    const parts = this.currentFile.replace(/\\/g, '/').split('/');
    parts.pop();
    const currentDir = parts.join('/');
    
    // Fetch absolute path info from server
    let absolutePath = "";
    try {
      const subPath = currentDir ? `scad/projects/${this.currentProject}/${currentDir}` : `scad/projects/${this.currentProject}`;
      const response = await fetch(`/api/files-absolute-path/${subPath}`);
      if (response.ok) {
        const data = await response.json();
        absolutePath = data.absolutePath;
      }
    } catch (e) {
      console.warn("Error fetching absolute path:", e);
    }

    if (this.app && typeof this.app.printToCommandLine === 'function') {
      const displayPath = absolutePath ? `${absolutePath}\\${this.currentFile.split('/').pop()}` : `files/scad/projects/${this.currentProject}/${this.currentFile.split('/').pop()}`;
      this.app.printToCommandLine(`Running SCAD: ${displayPath}`);
    }
    
    try {
      const result = await this.scadManager.execute(code, overrides, (msg) => {
        if (this.app && typeof this.app.printToCommandLine === 'function') {
          this.app.printToCommandLine(msg);
        }
      }, this.currentProject, currentDir, absolutePath);
      
      if (result.success) {
        this.lastGeometries = result.entities;
        this.onRender(result.entities);
        if (this.app?.viewer) {
          this.app.viewer.render();
        }
        this.updateProgress(100, "Successfully rendered!");
        this.hideProgressBar(600);
      } else {
        const errMsg = result.error ? String(result.error) : "Compilation failed";
        console.error("SCAD Error:", errMsg);
        this.updateProgress(100, errMsg, true);
        this.hideProgressBar(3000);
      }
    } catch (err: any) {
      const errMsg = err?.message ? String(err.message) : "Unexpected error during run";
      console.error("SCAD Error:", errMsg);
      this.updateProgress(100, errMsg, true);
      this.hideProgressBar(3000);
    }
  }

  private async saveBlockThumbnail(blockName: string, typeDir: '2D' | '3D') {
    try {
      this.app.viewer.render();
      const glCanvas = this.app.viewer.canvas;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 256;
      tempCanvas.height = 256;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        const size = Math.min(glCanvas.width, glCanvas.height);
        const sx = (glCanvas.width - size) / 2;
        const sy = (glCanvas.height - size) / 2;
        ctx.drawImage(glCanvas, sx, sy, size, size, 0, 0, 256, 256);
      }

      const dataUrl = tempCanvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const response = await fetch(`/api/files/blocks/${typeDir}/${blockName}.png`, {
        method: 'POST',
        body: bytes
      });
      if (response.ok) {
        console.log(`Saved block thumbnail to blocks/${typeDir}/${blockName}.png`);
      } else {
        console.error(`Failed to save block thumbnail: ${response.statusText}`);
      }
    } catch (err) {
      console.error(`Error saving block thumbnail:`, err);
    }
  }

  private export3DBlock() {
    if (!this.lastGeometries || this.lastGeometries.length === 0) {
      NotificationManager.getInstance().show("No compiled geometries to export. Please run the script first.", "error");
      return;
    }

    const dialog = new ScadInputDialog(
      "Export 3D Block",
      "Enter a name for the 3D block:",
      "SCAD_BLOCK_3D",
      (blockName) => {
        if (!blockName) {
          NotificationManager.getInstance().show("Block name cannot be empty.", "error");
          return;
        }
        blockName = blockName.toUpperCase();

        if (this.app?.doc.blocks.getBlock(blockName)) {
          const overwrite = confirm(`A block named "${blockName}" already exists. Overwrite?`);
          if (!overwrite) return;
        }

        const entities: any[] = [];
        this.lastGeometries.forEach((geo: any) => {
          if (!geo.getAttribute || !geo.getAttribute('position')) return;
          const positions = Array.from(geo.getAttribute('position').array) as number[];
          const indices = geo.index ? Array.from(geo.index.array) as number[] : [];
          const faceMapping = geo.userData?.faceMapping;
          const edgeLines = geo.userData?.edgeLines;
          const brepSnapshot = geo.userData?.brepSnapshot;

          const entityId = this.app.doc.getNextId("SOLID");
          const solid = new Solid3D(entityId, positions, indices, faceMapping, edgeLines);
          solid.brepSnapshot = brepSnapshot;
          entities.push(solid);
        });

        if (entities.length === 0) {
          NotificationManager.getInstance().show("No valid 3D solid geometries found in the output.", "error");
          return;
        }

        this.app.doc.blocks.addBlock(blockName, { x: 0, y: 0 }, entities);

        // Save block as STEP to /files/blocks/3D/
        (async () => {
          try {
            const solidWithSnapshot = entities.find(e => e.brepSnapshot && e.brepSnapshot.length > 0);
            if (solidWithSnapshot && solidWithSnapshot.brepSnapshot) {
              const response = await fetch(`/api/files/blocks/3D/${blockName}.step`, {
                method: 'POST',
                body: solidWithSnapshot.brepSnapshot
              });
              if (response.ok) {
                console.log(`Saved 3D block STEP to blocks/3D/${blockName}.step`);
              } else {
                console.error(`Failed to save 3D block STEP: ${response.statusText}`);
              }
            } else {
              console.warn("No brepSnapshot found to save 3D block as STEP file.");
            }

            // Save 256x256 PNG thumbnail
            await this.saveBlockThumbnail(blockName, '3D');
          } catch (err) {
            console.error(`Error saving 3D block STEP to disk:`, err);
          }
        })();

        NotificationManager.getInstance().show(`Block "${blockName}" exported successfully!`, "success");
        this.app.triggerObjectsWindowUpdate();

        const insertNow = confirm("Would you like to insert this block into the modelling view pane now?");
        if (insertNow) {
          const insertId = this.app.doc.getNextId("INSERT");
          const insertEntity = new Insert(insertId, blockName, 0, 0, 1, 1, 0);
          this.app.addEntity(insertEntity);
          this.app.viewer.render();
          this.app.triggerObjectsWindowUpdate();
          NotificationManager.getInstance().show(`Inserted block "${blockName}" at (0,0).`, "success");
        }
      },
      () => {}
    );
    dialog.show();
  }

  private extractMeshSilhouetteSegments(geo: any): { p1: { x: number; y: number; z: number }; p2: { x: number; y: number; z: number } }[] {
    const silSegments: { p1: { x: number; y: number; z: number }; p2: { x: number; y: number; z: number } }[] = [];
    if (!geo.getAttribute || !geo.getAttribute('position')) return silSegments;
    
    const positions = Array.from(geo.getAttribute('position').array) as number[];
    const indices = geo.index ? Array.from(geo.index.array) as number[] : null;
    
    const getVertex = (idx: number) => ({
      x: positions[idx * 3],
      y: positions[idx * 3 + 1],
      z: positions[idx * 3 + 2]
    });

    const getPointKey = (v: { x: number; y: number; z: number }) => {
      return `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)},${Math.round(v.z * 1000)}`;
    };

    interface TempEdge {
      p1: { x: number; y: number; z: number };
      p2: { x: number; y: number; z: number };
      normals: number[];
    }
    const edgeMap = new Map<string, TempEdge>();

    const addEdge = (vA: any, vB: any, nz: number) => {
      const keyA = getPointKey(vA);
      const keyB = getPointKey(vB);
      if (keyA === keyB) return;
      const edgeKey = keyA < keyB ? `${keyA}_${keyB}` : `${keyB}_${keyA}`;
      
      let edge = edgeMap.get(edgeKey);
      if (!edge) {
        edge = { p1: vA, p2: vB, normals: [] };
        edgeMap.set(edgeKey, edge);
      }
      edge.normals.push(nz);
    };

    const triangleCount = indices ? indices.length / 3 : positions.length / 9;
    for (let t = 0; t < triangleCount; t++) {
      let i1 = t * 3, i2 = t * 3 + 1, i3 = t * 3 + 2;
      if (indices) {
        i1 = indices[t * 3];
        i2 = indices[t * 3 + 1];
        i3 = indices[t * 3 + 2];
      }

      const p1 = getVertex(i1);
      const p2 = getVertex(i2);
      const p3 = getVertex(i3);

      const ux = p2.x - p1.x, uy = p2.y - p1.y, uz = p2.z - p1.z;
      const vx = p3.x - p1.x, vy = p3.y - p1.y, vz = p3.z - p1.z;
      
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-6) {
        nz /= len;
      } else {
        nz = 0;
      }

      addEdge(p1, p2, nz);
      addEdge(p2, p3, nz);
      addEdge(p3, p1, nz);
    }

    for (const edge of edgeMap.values()) {
      if (edge.normals.length === 2) {
        const n1 = edge.normals[0];
        const n2 = edge.normals[1];
        if (n1 * n2 < -1e-4) {
          silSegments.push({ p1: edge.p1, p2: edge.p2 });
        }
      }
    }

    return silSegments;
  }

  private export2DBlock() {
    if (!this.lastGeometries || this.lastGeometries.length === 0) {
      NotificationManager.getInstance().show("No compiled geometries to export. Please run the script first.", "error");
      return;
    }

    const dialog = new ScadInputDialog(
      "Export 2D Block",
      "Enter a name for the 2D/sketch block:",
      "SCAD_BLOCK_2D",
      (blockName) => {
        if (!blockName) {
          NotificationManager.getInstance().show("Block name cannot be empty.", "error");
          return;
        }
        blockName = blockName.toUpperCase();

        if (this.app?.doc.blocks.getBlock(blockName)) {
          const overwrite = confirm(`A block named "${blockName}" already exists. Overwrite?`);
          if (!overwrite) return;
        }

        const entities: any[] = [];

        // 1. Extract raw 2D segments from both BRep topological edge lines and mesh silhouette edges
        const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
        this.lastGeometries.forEach((geo: any) => {
          if (geo instanceof Entity) {
            entities.push(geo.clone(this.app.doc.getNextId(geo.constructor.name.toUpperCase())));
            return;
          }
          // A. Add BRep topological edges
          const edgeLines = geo.userData?.edgeLines;
          if (edgeLines && Array.isArray(edgeLines)) {
            edgeLines.forEach((edge: number[]) => {
              for (let i = 0; i < edge.length - 3; i += 3) {
                const x1 = edge[i];
                const y1 = edge[i+1];
                const x2 = edge[i+3];
                const y2 = edge[i+4];

                const len2D = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                if (len2D > 1e-3) {
                  segments.push({
                    p1: { x: x1, y: y1 },
                    p2: { x: x2, y: y2 }
                  });
                }
              }
            });
          }

          // B. Add mesh silhouette edges (e.g. for sphere circles and curved outlines)
          const silSegments = this.extractMeshSilhouetteSegments(geo);
          silSegments.forEach(seg => {
            const x1 = seg.p1.x;
            const y1 = seg.p1.y;
            const x2 = seg.p2.x;
            const y2 = seg.p2.y;

            const len2D = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
            if (len2D > 1e-3) {
              segments.push({
                p1: { x: x1, y: y1 },
                p2: { x: x2, y: y2 }
              });
            }
          });
        });

        // 2. Deduplicate segments: filter out identical or reversed overlapping segments
        const epsilon = 0.05; // Tolerance for floating point variations in tessellation
        const uniqueSegments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

        const dist = (pt1: { x: number; y: number }, pt2: { x: number; y: number }) => {
          return Math.sqrt((pt1.x - pt2.x) ** 2 + (pt1.y - pt2.y) ** 2);
        };

        for (const seg of segments) {
          let isDuplicate = false;
          for (const uSeg of uniqueSegments) {
            const matchNormal = dist(seg.p1, uSeg.p1) < epsilon && dist(seg.p2, uSeg.p2) < epsilon;
            const matchReverse = dist(seg.p1, uSeg.p2) < epsilon && dist(seg.p2, uSeg.p1) < epsilon;
            if (matchNormal || matchReverse) {
              isDuplicate = true;
              break;
            }
          }
          if (!isDuplicate) {
            uniqueSegments.push(seg);
          }
        }

        // 3. Chain segments into continuous polyline paths
        const remaining = [...uniqueSegments];

        while (remaining.length > 0) {
          const first = remaining.shift()!;
          const path = [first.p1, first.p2];
          let growing = true;

          while (growing) {
            growing = false;
            const head = path[0];
            const tail = path[path.length - 1];

            for (let i = 0; i < remaining.length; i++) {
              const seg = remaining[i];

              // Try connecting to tail
              if (dist(seg.p1, tail) < epsilon) {
                path.push(seg.p2);
                remaining.splice(i, 1);
                growing = true;
                break;
              } else if (dist(seg.p2, tail) < epsilon) {
                path.push(seg.p1);
                remaining.splice(i, 1);
                growing = true;
                break;
              }
              // Try connecting to head
              else if (dist(seg.p1, head) < epsilon) {
                path.unshift(seg.p2);
                remaining.splice(i, 1);
                growing = true;
                break;
              } else if (dist(seg.p2, head) < epsilon) {
                path.unshift(seg.p1);
                remaining.splice(i, 1);
                growing = true;
                break;
              }
            }
          }

          // Check if the path is closed
          let closed = false;
          if (path.length >= 3 && dist(path[0], path[path.length - 1]) < epsilon) {
            closed = true;
            path.pop(); // Remove the duplicated endpoint since it's closed
          }

          if (path.length >= 2) {
            const vertices = path.map(pt => ({ x: pt.x, y: pt.y, bulge: 0 }));
            const entityId = this.app.doc.getNextId("POLYLINE");
            const polyline = new Polyline(entityId, vertices, closed);
            entities.push(polyline);
          }
        }

        if (entities.length === 0) {
          NotificationManager.getInstance().show("No valid 2D sketch lines/edges found in the output.", "error");
          return;
        }

        this.app.doc.blocks.addBlock(blockName, { x: 0, y: 0 }, entities);

        // Save block as DXF to /files/blocks/2D/
        (async () => {
          try {
            const { Document } = await import("../core/model/Document");
            const { DXFExporter } = await import("../core/io/dxfExport");
            const tempDoc = new Document();
            entities.forEach(ent => {
              tempDoc.addEntity(ent.clone(ent.id));
            });
            const exporter = new DXFExporter();
            const dxfText = exporter.export(tempDoc);
            
            const response = await fetch(`/api/files/blocks/2D/${blockName}.dxf`, {
              method: 'POST',
              body: dxfText
            });
            if (response.ok) {
              console.log(`Saved 2D block DXF to blocks/2D/${blockName}.dxf`);
            } else {
              console.error(`Failed to save 2D block DXF: ${response.statusText}`);
            }

            // Save 256x256 PNG thumbnail
            await this.saveBlockThumbnail(blockName, '2D');
          } catch (err) {
            console.error(`Error saving 2D block DXF to disk:`, err);
          }
        })();

        NotificationManager.getInstance().show(`Block "${blockName}" exported successfully!`, "success");
        this.app.triggerObjectsWindowUpdate();

        const insertNow = confirm("Would you like to insert this block into the modelling view pane now?");
        if (insertNow) {
          const insertId = this.app.doc.getNextId("INSERT");
          const insertEntity = new Insert(insertId, blockName, 0, 0, 1, 1, 0);
          this.app.addEntity(insertEntity);
          this.app.viewer.render();
          this.app.triggerObjectsWindowUpdate();
          NotificationManager.getInstance().show(`Inserted block "${blockName}" at (0,0).`, "success");
        }
      },
      () => {}
    );
    dialog.show();
  }

  private saveProject() {
    const code = this.editorView.state.doc.toString();
    const projectDialog = new ScadInputDialog(
      "Save SCAD Project",
      "Enter project folder name:",
      "myproject",
      (projectName) => {
        if (!projectName) {
          NotificationManager.getInstance().show("Project folder name cannot be empty.", "error");
          return;
        }
        projectName = projectName.trim();

        const fileDialog = new ScadInputDialog(
          "Save SCAD File",
          "Enter SCAD file name:",
          "main.scad",
          async (fileName) => {
            if (!fileName) {
              NotificationManager.getInstance().show("SCAD file name cannot be empty.", "error");
              return;
            }
            fileName = fileName.trim();
            if (!fileName.endsWith('.scad')) fileName += '.scad';

            try {
              const response = await fetch(`/api/files/scad/projects/${projectName}/${fileName}`, {
                method: 'POST',
                body: code
              });
              if (response.ok) {
                this.currentProject = projectName;
                this.currentFile = fileName;
                NotificationManager.getInstance().show(`SCAD script saved successfully to scad/projects/${projectName}/${fileName}!`, "success");
              } else {
                NotificationManager.getInstance().show(`Error saving SCAD script: ${response.statusText}`, "error");
              }
            } catch (err) {
              NotificationManager.getInstance().show(`Network error saving SCAD project: ${err}`, "error");
            }
          },
          () => {}
        );
        fileDialog.show();
      },
      () => {}
    );
    projectDialog.show();
  }

  private async loadProject() {
    try {
      const projectsResponse = await fetch('/api/files/scad/projects');
      let projects: string[] = [];
      if (projectsResponse.ok) {
        projects = await projectsResponse.json();
      }
      
      const availableProjectsMsg = projects.length > 0 
        ? `Available project folders:\n${projects.join(', ')}\n\nEnter project folder name:`
        : "No SCAD project folders found under files/scad/projects.\n\nEnter project folder name to create:";

      const defaultProject = projects[0] || "myproject";

      const projectDialog = new ScadInputDialog(
        "Load SCAD Project",
        availableProjectsMsg,
        defaultProject,
        async (projectName) => {
          if (!projectName) return;
          projectName = projectName.trim();

          try {
            const filesResponse = await fetch(`/api/files/scad/projects/${projectName}`);
            let files: string[] = [];
            if (filesResponse.ok) {
              files = await filesResponse.json();
            }

            const availableFilesMsg = files.length > 0
              ? `Available SCAD files:\n${files.join(', ')}\n\nEnter SCAD file name:`
              : "No SCAD files found in this project folder.\n\nEnter SCAD file name:";

            const defaultFile = files[0] || "main.scad";

            const fileDialog = new ScadInputDialog(
              "Load SCAD File",
              availableFilesMsg,
              defaultFile,
              async (fileName) => {
                if (!fileName) return;
                fileName = fileName.trim();
                if (!fileName.endsWith('.scad')) fileName += '.scad';

                try {
                  const contentResponse = await fetch(`/api/files/scad/projects/${projectName}/${fileName}`);
                  if (contentResponse.ok) {
                    const content = await contentResponse.text();
                    
                    this.currentProject = projectName;
                    this.currentFile = fileName;
                    this.editorView.dispatch({
                      changes: {
                        from: 0,
                        to: this.editorView.state.doc.length,
                        insert: content
                      }
                    });
                    
                    NotificationManager.getInstance().show(`Loaded ${projectName}/${fileName} successfully!`, "success");
                  } else {
                    NotificationManager.getInstance().show(`Failed to load file: ${contentResponse.statusText}`, "error");
                  }
                } catch (err) {
                  NotificationManager.getInstance().show(`Network error loading file: ${err}`, "error");
                }
              },
              () => {}
            );
            fileDialog.show();
          } catch (err) {
            NotificationManager.getInstance().show(`Error loading files in project: ${err}`, "error");
          }
        },
        () => {}
      );
      projectDialog.show();
    } catch (err) {
      NotificationManager.getInstance().show(`Error fetching projects: ${err}`, "error");
    }
  }
}

