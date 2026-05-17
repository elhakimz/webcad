import { EditorView, basicSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { DockingManager } from "./DockingManager";
import { ScadManager } from "../scad/ScadManager";
import { ParameterExtractor } from "../scad/parser/ParameterExtractor";
import { ScadParameterDialog } from "./ScadParameterDialog";

export class ScadEditor {
  private container: HTMLElement;
  private editorView: EditorView;
  private scadManager: ScadManager;
  private extractor: ParameterExtractor;

  constructor(private dockingManager: DockingManager, private onRender: (geometries: any[]) => void) {
    this.scadManager = new ScadManager();
    this.extractor = new ParameterExtractor();
    this.container = document.createElement('div');
    this.container.id = 'scad-editor-window';
    this.container.className = 'scad-editor-window toolbar-window';
    this.container.innerHTML = `
      <div class="window-header">
        <span class="window-title">OpenSCAD Editor</span>
        <div class="window-actions">
          <button id="scad-custom-btn" class="scad-action-btn">Customize</button>
          <button id="scad-run-btn" class="scad-action-btn scad-run-btn">Run</button>
        </div>
      </div>
      <div id="scad-cm-container" class="scad-cm-container"></div>
    `;

    const cmContainer = this.container.querySelector('#scad-cm-container') as HTMLElement;
    this.editorView = new EditorView({
      doc: `// OpenSCAD Script
cube([10, 20, 30], center=true);
translate([20, 0, 0]) sphere(r=15);
`,
      extensions: [
        basicSetup,
        javascript(), // Use JS as a proxy for SCAD highlighting for now
        oneDark,
        EditorView.theme({
          "&": { height: "300px", fontSize: "12px" },
          ".cm-scroller": { overflow: "auto" }
        })
      ],
      parent: cmContainer
    });

    const runBtn = this.container.querySelector('#scad-run-btn')!;
    runBtn.addEventListener('click', () => this.runScad());

    const customBtn = this.container.querySelector('#scad-custom-btn')!;
    customBtn.addEventListener('click', () => this.openCustomizer());

    this.dockingManager.registerWindow('scad_editor', this.container, false, 400, 100);
  }

  public openCustomizer() {
    const code = this.editorView.state.doc.toString();
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

  public async runScad(overrides?: Record<string, any>) {
    const code = this.editorView.state.doc.toString();
    console.log("Running SCAD...");
    
    const result = await this.scadManager.execute(code, overrides);
    
    if (result.success) {
      this.onRender(result.entities);
    } else {
      console.error("SCAD Error:", result.error);
      // TODO: Show in editor gutter
    }
  }
}
