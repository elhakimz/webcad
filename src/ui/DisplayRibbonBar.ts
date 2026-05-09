import { RibbonBar } from "./RibbonBar";

export class DisplayRibbonBar extends RibbonBar {
  private onAction: (action: string) => void;

  constructor(onAction: (action: string) => void) {
    super("Display");
    this.onAction = onAction;
    this.initContent();
  }

  private initContent() {
    const panBtn = this.createButton("Pan", () => this.onAction("PAN"));
    const zoomAllBtn = this.createButton("Zoom All", () => this.onAction("ZOOM_ALL"));
    const zoomWindowBtn = this.createButton("Zoom Window", () => this.onAction("ZOOM_WINDOW"));

    this.content.appendChild(panBtn);
    this.content.appendChild(zoomAllBtn);
    this.content.appendChild(zoomWindowBtn);
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
