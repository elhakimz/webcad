import { ScadParameter } from '../scad/parser/ParameterExtractor';

export class ScadParameterDialog {
  private overlay: HTMLElement;
  private container: HTMLElement;
  private paramValues: Map<string, any> = new Map();

  constructor(
    private programName: string,
    private description: string,
    private parameters: ScadParameter[],
    private onRun: (values: Record<string, any>) => void,
    private onEvaluate: (values: Record<string, any>) => void,
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
      padding: '20px', color: 'var(--text-color)', width: '500px',
      maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', gap: '15px'
    });

    this.parameters.forEach(p => this.paramValues.set(p.name, p.value));
    this.createUI();
    this.overlay.appendChild(this.container);
  }

  private createUI() {
    // Header
    const header = document.createElement('div');
    header.innerHTML = `
      <h2 style="margin:0 0 5px 0; color:var(--accent-color)">${this.programName}</h2>
      <p style="margin:0; font-size:12px; opacity:0.8">${this.description}</p>
      <hr style="border:0; border-top:1px solid var(--border-color); margin:15px 0">
    `;
    this.container.appendChild(header);

    // Group parameters
    const groups = new Map<string, ScadParameter[]>();
    this.parameters.forEach(p => {
      const g = p.group || "Parameters";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    });

    for (const [groupName, params] of groups) {
      const groupDiv = document.createElement('div');
      groupDiv.innerHTML = `<h3 style="margin:10px 0; font-size:14px; text-transform:uppercase; color:#888">${groupName}</h3>`;
      
      params.forEach(p => {
        const row = this.createParamRow(p);
        groupDiv.appendChild(row);
      });
      
      this.container.appendChild(groupDiv);
    }

    // Actions
    const actions = document.createElement('div');
    Object.assign(actions.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px',
      paddingTop: '15px', borderTop: '1px solid var(--border-color)'
    });

    const runBtn = this.createButton('Run', 'scad-btn-run', () => this.onRun(this.getValues()));
    const evalBtn = this.createButton('Evaluate', 'scad-btn-eval', () => this.onEvaluate(this.getValues()));
    const cancelBtn = this.createButton('Cancel', 'scad-btn-cancel', () => {
      this.onCancel();
      this.close();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(evalBtn);
    actions.appendChild(runBtn);
    this.container.appendChild(actions);
  }

  private createParamRow(p: ScadParameter): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px'
    });

    const label = document.createElement('div');
    label.style.flex = '1';
    label.innerHTML = `
      <div style="font-weight:bold">${p.name}</div>
      <div style="font-size:10px; opacity:0.6">${p.description || ''}</div>
    `;
    row.appendChild(label);

    const inputContainer = document.createElement('div');
    inputContainer.style.flex = '1';
    
    if (p.type === 'enum' && p.options) {
      const select = document.createElement('select');
      this.applyInputStyle(select);
      p.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (opt === p.value) o.selected = true;
        select.appendChild(o);
      });
      select.onchange = () => this.paramValues.set(p.name, select.value);
      inputContainer.appendChild(select);
    } else if (p.type === 'boolean') {
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !!p.value;
      check.onchange = () => this.paramValues.set(p.name, check.checked);
      inputContainer.appendChild(check);
    } else if (p.type === 'number' && p.min !== undefined) {
      const sliderContainer = document.createElement('div');
      sliderContainer.style.display = 'flex';
      sliderContainer.style.gap = '5px';
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = p.min.toString();
      slider.max = p.max!.toString();
      slider.step = (p.step || 1).toString();
      slider.value = p.value.toString();
      slider.style.flex = '1';
      
      const valDisplay = document.createElement('input');
      valDisplay.type = 'number';
      this.applyInputStyle(valDisplay);
      valDisplay.style.width = '60px';
      valDisplay.value = p.value.toString();
      
      slider.oninput = () => {
        valDisplay.value = slider.value;
        this.paramValues.set(p.name, parseFloat(slider.value));
      };
      valDisplay.oninput = () => {
        slider.value = valDisplay.value;
        this.paramValues.set(p.name, parseFloat(valDisplay.value));
      };
      
      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(valDisplay);
      inputContainer.appendChild(sliderContainer);
    } else {
      const input = document.createElement('input');
      input.type = p.type === 'number' ? 'number' : 'text';
      this.applyInputStyle(input);
      input.value = p.value.toString();
      input.oninput = () => this.paramValues.set(p.name, p.type === 'number' ? parseFloat(input.value) : input.value);
      inputContainer.appendChild(input);
    }

    row.appendChild(inputContainer);
    return row;
  }

  private applyInputStyle(el: HTMLElement) {
    Object.assign(el.style, {
      width: '100%', backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)',
      color: 'var(--text-color)', fontFamily: 'var(--font-mono)', padding: '4px'
    });
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

  private getValues(): Record<string, any> {
    const values: Record<string, any> = {};
    for (const [k, v] of this.paramValues) {
      values[k] = v;
    }
    return values;
  }

  public show() {
    document.body.appendChild(this.overlay);
  }

  public close() {
    this.overlay.remove();
  }
}
