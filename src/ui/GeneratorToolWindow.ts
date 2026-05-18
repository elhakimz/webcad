import { ToolWindow } from "./ToolWindow";
import { App } from "../app";
import { NotificationManager } from "./NotificationManager";

interface Parameter {
  name: string;
  value: number | boolean | string;
  min?: number;
  step?: number;
  max?: number;
  label?: string;
}

export class GeneratorToolWindow {
  private container: HTMLElement;
  private listContainer!: HTMLElement;
  private customizerContainer!: HTMLElement;
  private activeGenerator: string | null = null;
  private activeParameters: Parameter[] = [];
  private activeTab: 'solid' | 'sketch' = 'solid';
  private categorizedGenerators: Record<'solid' | 'sketch', string[]> = { solid: [], sketch: [] };

  constructor(
    private toolWindow: ToolWindow,
    private app: App
  ) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box'
    });

    this.createUI();
    this.toolWindow.setContent(this.container);

    // Initial load of generator list
    this.loadGenerators();
  }

  private createUI() {
    this.container.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; overflow: hidden;">
        <!-- Top: List of Generators with tabs -->
        <div style="flex: 0 0 220px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; overflow: hidden;">
          <!-- Premium Category Tabs -->
          <div class="generators-tabs" style="display: flex; border-bottom: 1px solid var(--border-color); background: rgba(255, 255, 255, 0.02);">
            <button class="gen-tab-btn active" data-tab="solid" style="flex: 1; padding: 10px; border: none; background: transparent; color: var(--text-color); font-family: var(--font-family); font-size: 10px; font-weight: bold; text-transform: uppercase; cursor: pointer; transition: all 0.2s; border-bottom: 2px solid var(--accent-color); outline: none; letter-spacing: 0.5px;">
              ⚙️ Solid (3D)
            </button>
            <button class="gen-tab-btn" data-tab="sketch" style="flex: 1; padding: 10px; border: none; background: transparent; color: var(--text-muted); font-family: var(--font-family); font-size: 10px; font-weight: bold; text-transform: uppercase; cursor: pointer; transition: all 0.2s; border-bottom: 2px solid transparent; outline: none; letter-spacing: 0.5px;">
              ✏️ Sketch (2D)
            </button>
          </div>
          <div class="generators-list" style="flex: 1; overflow-y: auto; padding: 6px 8px;"></div>
        </div>

        <!-- Bottom: Dynamic Customizer Form -->
        <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
          <div style="font-family: var(--font-family); font-size: 11px; font-weight: bold; padding: 6px 10px; color: var(--text-color); background: rgba(255, 255, 255, 0.05); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-color);">
            Parametric Settings
          </div>
          <div class="customizer-form" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px;">
            <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); text-align: center; font-style: italic; margin-top: 20px;">
              Select a generator to customize parameters.
            </div>
          </div>
        </div>
      </div>
    `;

    this.listContainer = this.container.querySelector('.generators-list')!;
    this.customizerContainer = this.container.querySelector('.customizer-form')!;

    // Setup tab button event listeners
    const tabBtns = this.container.querySelectorAll('.gen-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLButtonElement;
        const selectedTab = target.getAttribute('data-tab') as 'solid' | 'sketch';
        
        tabBtns.forEach(b => {
          (b as HTMLButtonElement).classList.remove('active');
          Object.assign((b as HTMLButtonElement).style, {
            color: 'var(--text-muted)',
            borderBottomColor: 'transparent'
          });
        });
        
        target.classList.add('active');
        Object.assign(target.style, {
          color: 'var(--text-color)',
          borderBottomColor: 'var(--accent-color)'
        });
        
        this.activeTab = selectedTab;
        this.renderCurrentTabGenerators();
      });
    });
  }

  private async loadGenerators() {
    this.listContainer.innerHTML = `
      <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); padding: 8px; text-align: center; font-style: italic;">
        Scanning generators...
      </div>
    `;

    try {
      // 1. Fetch solids
      const solidResponse = await fetch('/api/files/scad/generators/solid');
      let solidFiles: string[] = [];
      if (solidResponse.ok) {
        solidFiles = await solidResponse.json();
      }

      // 2. Fetch sketches
      const sketchResponse = await fetch('/api/files/scad/generators/sketch');
      let sketchFiles: string[] = [];
      if (sketchResponse.ok) {
        sketchFiles = await sketchResponse.json();
      }

      this.categorizedGenerators = {
        solid: solidFiles.filter(f => f.toLowerCase().endsWith('.scad')).map(f => `solid/${f}`),
        sketch: sketchFiles.filter(f => f.toLowerCase().endsWith('.scad')).map(f => `sketch/${f}`)
      };

      this.renderCurrentTabGenerators();
    } catch (e) {
      console.error(`Failed to load generators:`, e);
      this.listContainer.innerHTML = `
        <div style="font-family: var(--font-family); font-size: 11px; color: var(--error-color); padding: 8px; text-align: center; font-weight: bold;">
          Scan failed.
        </div>
      `;
    }
  }

  private renderCurrentTabGenerators() {
    this.listContainer.innerHTML = '';
    
    const files = this.categorizedGenerators[this.activeTab];
    if (!files || files.length === 0) {
      this.listContainer.innerHTML = `
        <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); padding: 12px; text-align: center; font-style: italic;">
          No ${this.activeTab} generators found.
        </div>
      `;
      return;
    }

    files.forEach(file => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '6px 8px',
        margin: '2px 0',
        borderRadius: '3px',
        cursor: 'pointer',
        fontFamily: 'var(--font-family)',
        fontSize: '11px',
        color: 'var(--text-color)',
        transition: 'background 0.2s',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      });

      const icon = this.activeTab === 'sketch' ? "✏️" : "⚙️";
      const displayName = file.includes('/') ? file.split('/').pop()! : (file.includes('\\') ? file.split('\\').pop()! : file);

      item.innerHTML = `
        <span style="color: var(--accent-color); font-size: 11px;">${icon}</span>
        <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</span>
      `;

      item.addEventListener('click', () => {
        this.selectGenerator(file, item);
      });

      this.listContainer.appendChild(item);
    });
  }

  private async selectGenerator(file: string, itemEl: HTMLElement) {
    // Highlight selection
    this.listContainer.querySelectorAll('div').forEach(el => {
      el.style.background = 'transparent';
    });
    itemEl.style.background = 'rgba(255, 255, 255, 0.1)';

    this.activeGenerator = file;
    this.customizerContainer.innerHTML = `
      <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); text-align: center; font-style: italic; margin-top: 20px;">
        Parsing custom parameters...
      </div>
    `;

    try {
      const response = await fetch(`/api/files/scad/generators/${file}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const code = await response.text();

      this.activeParameters = this.parseScadParameters(code);
      this.renderCustomizer();
    } catch (e) {
      console.error(`Failed to parse generator ${file}:`, e);
      this.customizerContainer.innerHTML = `
        <div style="font-family: var(--font-family); font-size: 11px; color: var(--error-color); text-align: center; font-weight: bold; margin-top: 20px;">
          Failed to customize script.
        </div>
      `;
    }
  }

  private parseScadParameters(code: string): Parameter[] {
    const params: Parameter[] = [];
    // Matches top-level declarations like: param = value; // [min:step:max] description
    const lineRegex = /^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+)\s*;(?:\s*\/\/\s*(.+))?/gm;
    let match;

    while ((match = lineRegex.exec(code)) !== null) {
      const name = match[1];
      const rawVal = match[2].trim();
      const comment = match[3] ? match[3].trim() : "";

      let value: number | boolean | string = rawVal;
      if (rawVal === "true") value = true;
      else if (rawVal === "false") value = false;
      else if (rawVal.startsWith('"') && rawVal.endsWith('"')) value = rawVal.slice(1, -1);
      else if (!isNaN(Number(rawVal))) value = Number(rawVal);
      else {
        // Skip derived variables and formulas (e.g. 1.5 * d)
        continue;
      }

      let min, step, max, label = name;

      // Extract customizer ranges e.g. [10:1:50] or [10:50]
      const rangeMatch = comment.match(/\[([0-9.-]+):?([0-9.-]+)?:?([0-9.-]+)?\]/);
      if (rangeMatch) {
        if (rangeMatch[3] !== undefined) {
          min = Number(rangeMatch[1]);
          step = Number(rangeMatch[2]);
          max = Number(rangeMatch[3]);
        } else {
          min = Number(rangeMatch[1]);
          max = Number(rangeMatch[2]);
          step = 1;
        }
        label = comment.replace(/\[.+\]/, "").trim() || name;
      } else {
        label = comment || name;
      }

      params.push({ name, value, min, step, max, label });
    }
    return params;
  }

  private renderCustomizer() {
    this.customizerContainer.innerHTML = '';

    if (this.activeParameters.length === 0) {
      this.customizerContainer.innerHTML = `
        <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); text-align: center; font-style: italic; margin-top: 20px;">
          No top-level variables found to customize.
        </div>
      `;
      return;
    }

    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';

    this.activeParameters.forEach((param, index) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        fontFamily: 'var(--font-family)',
        fontSize: '11px'
      });

      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        color: 'var(--text-color)',
        fontWeight: 'bold'
      });
      header.innerHTML = `<span>${param.label}</span><span style="color: var(--text-muted); font-size: 10px;">${param.name}</span>`;
      row.appendChild(header);

      if (typeof param.value === 'boolean') {
        const toggleLabel = document.createElement('label');
        Object.assign(toggleLabel.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '11px',
          padding: '4px 0'
        });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = param.value;
        checkbox.addEventListener('change', () => {
          this.activeParameters[index].value = checkbox.checked;
        });

        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(document.createTextNode(param.value ? 'Enabled' : 'Disabled'));
        checkbox.addEventListener('change', () => {
          toggleLabel.lastChild!.textContent = checkbox.checked ? 'Enabled' : 'Disabled';
        });

        row.appendChild(toggleLabel);
      } else if (param.min !== undefined && param.max !== undefined && typeof param.value === 'number') {
        const sliderContainer = document.createElement('div');
        Object.assign(sliderContainer.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        });

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = param.min.toString();
        slider.max = param.max.toString();
        slider.step = (param.step || 1).toString();
        slider.value = param.value.toString();
        slider.style.flex = '1';

        const numInput = document.createElement('input');
        numInput.type = 'number';
        numInput.min = param.min.toString();
        numInput.max = param.max.toString();
        numInput.step = (param.step || 1).toString();
        numInput.value = param.value.toString();
        Object.assign(numInput.style, {
          width: '50px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          color: 'var(--text-color)',
          fontSize: '11px',
          padding: '2px 4px',
          textAlign: 'right'
        });

        slider.addEventListener('input', () => {
          numInput.value = slider.value;
          this.activeParameters[index].value = Number(slider.value);
        });

        numInput.addEventListener('input', () => {
          slider.value = numInput.value;
          this.activeParameters[index].value = Number(numInput.value);
        });

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(numInput);
        row.appendChild(sliderContainer);
      } else {
        const textInput = document.createElement('input');
        textInput.type = typeof param.value === 'number' ? 'number' : 'text';
        textInput.value = param.value.toString();
        Object.assign(textInput.style, {
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid var(--border-color)',
          borderRadius: '3px',
          color: 'var(--text-color)',
          fontSize: '11px',
          padding: '4px 6px',
          boxSizing: 'border-box'
        });

        textInput.addEventListener('input', () => {
          if (typeof param.value === 'number') {
            this.activeParameters[index].value = Number(textInput.value);
          } else {
            this.activeParameters[index].value = textInput.value;
          }
        });

        row.appendChild(textInput);
      }

      form.appendChild(row);
    });

    this.customizerContainer.appendChild(form);

    // Dynamic Action Button (premium placement tool)
    const btn = document.createElement('button');
    btn.className = 'btn-premium';
    btn.innerHTML = `<span>⚡ GENERATE & PLACE</span>`;
    Object.assign(btn.style, {
      marginTop: '16px',
      padding: '8px 12px',
      background: 'var(--accent-color, #007acc)',
      border: 'none',
      borderRadius: '3px',
      color: '#fff',
      fontFamily: 'var(--font-family)',
      fontWeight: 'bold',
      fontSize: '11px',
      cursor: 'pointer',
      width: '100%',
      transition: 'opacity 0.2s'
    });

    btn.addEventListener('click', () => {
      this.handlePlacement();
    });

    this.customizerContainer.appendChild(btn);
  }

  private handlePlacement() {
    if (!this.activeGenerator) return;

    // Convert parameter list to a single plain Record object
    const overrides: Record<string, any> = {};
    this.activeParameters.forEach(p => {
      overrides[p.name] = p.value;
    });

    // Format argument as: generatorName;json_params (URL encoded to safely support spaces in terminal splits)
    const arg = encodeURIComponent(`${this.activeGenerator};${JSON.stringify(overrides)}`);

    // Fire stateful placement command directly in app console context
    this.app.execute(`GENERATOR ${arg}`);
    
    NotificationManager.getInstance().show(`Insertion Point requested! Click viewport to place ${this.activeGenerator}...`, 'info');
  }
}
