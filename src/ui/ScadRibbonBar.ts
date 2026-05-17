import { RibbonBar } from "./RibbonBar";

export class ScadRibbonBar extends RibbonBar {
  constructor(private onAction: (action: string) => void) {
    super("OpenSCAD Tools");
    this.initContent();
  }

  private initContent() {
    const runBtn = this.createButton("Run Script", () => this.onAction('RUN'));
    const customBtn = this.createButton("Parameters", () => this.onAction('CUSTOMIZE'));
    const clearBtn = this.createButton("Clear Results", () => this.onAction('CLEAR'));

    this.content.appendChild(runBtn);
    this.content.appendChild(customBtn);
    this.content.appendChild(clearBtn);
  }

  private createButton(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.padding = '2px 6px';
    btn.style.fontSize = '11px';
    btn.style.cursor = 'pointer';
    btn.style.backgroundColor = 'var(--panel-bg)';
    btn.style.color = 'var(--text-color)';
    btn.style.border = '1px solid var(--border-color)';
    btn.style.borderRadius = 'var(--radius-sm)';
    btn.addEventListener('click', onClick);
    
    btn.addEventListener('mouseover', () => {
      btn.style.backgroundColor = 'var(--bg-color)';
      btn.style.borderColor = 'var(--accent-color)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.backgroundColor = 'var(--panel-bg)';
      btn.style.borderColor = 'var(--border-color)';
    });
    
    return btn;
  }
}
