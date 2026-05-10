import { RibbonBar } from "./RibbonBar";

export class DisplayRibbonBar extends RibbonBar {
  private onAction: (action: string) => void;
  private autoPanEnabled = false;
  private autoPanBtn: HTMLElement | null = null;

  constructor(onAction: (action: string) => void) {
    super("Display");
    this.onAction = onAction;
    this.initContent();
  }

  private initContent() {
    const panBtn = this.createButton("Pan", () => this.onAction("PAN"));
    const zoomAllBtn = this.createButton("Zoom All", () => this.onAction("ZOOM_ALL"));
    const zoomWindowBtn = this.createButton("Zoom Window", () => this.onAction("ZOOM_WINDOW"));
    
    this.autoPanBtn = this.createButton("Auto Pan", () => {
      this.autoPanEnabled = !this.autoPanEnabled;
      this.updateButtonState();
      this.onAction(this.autoPanEnabled ? "AUTOPAN_ON" : "AUTOPAN_OFF");
    });

    this.content.appendChild(panBtn);
    this.content.appendChild(zoomAllBtn);
    this.content.appendChild(zoomWindowBtn);
    this.content.appendChild(this.autoPanBtn);
  }

  private updateButtonState() {
    if (!this.autoPanBtn) return;
    if (this.autoPanEnabled) {
      this.autoPanBtn.style.backgroundColor = 'var(--accent-color)';
      this.autoPanBtn.style.color = '#fff';
    } else {
      this.autoPanBtn.style.backgroundColor = 'var(--panel-bg)';
      this.autoPanBtn.style.color = 'var(--text-color)';
    }
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
      if (btn === this.autoPanBtn && this.autoPanEnabled) return;
      btn.style.backgroundColor = 'var(--bg-color)';
      btn.style.borderColor = 'var(--accent-color)';
    });
    btn.addEventListener('mouseout', () => {
      if (btn === this.autoPanBtn && this.autoPanEnabled) {
        btn.style.backgroundColor = 'var(--accent-color)';
        btn.style.borderColor = 'var(--border-color)';
        return;
      }
      btn.style.backgroundColor = 'var(--panel-bg)';
      btn.style.borderColor = 'var(--border-color)';
    });
    
    return btn;
  }
}
