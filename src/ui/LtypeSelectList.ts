export class LtypeSelectList {
  private element: HTMLElement;
  private onSelectCallback: ((ltype: string) => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ltype-select-list';
    this.element.style.position = 'absolute';
    this.element.style.display = 'none';
    this.element.style.zIndex = '1000';

    const ltypes = ['CONTINUOUS', 'DASHED', 'HIDDEN', 'DOTTED', 'CENTER', 'PHANTOM', 'DASHDOT'];

    ltypes.forEach(ltype => {
      const item = document.createElement('div');
      item.className = 'ltype-item';
      item.textContent = ltype;
      
      item.addEventListener('click', () => {
        if (this.onSelectCallback) {
          this.onSelectCallback(ltype);
        }
        this.hide();
      });
      
      this.element.appendChild(item);
    });

    document.body.appendChild(this.element);

    document.addEventListener('mousedown', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  public show(x: number, y: number, onSelect: (ltype: string) => void) {
    this.onSelectCallback = onSelect;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.display = 'flex'; // Use flex for column layout
  }

  public hide() {
    this.element.style.display = 'none';
  }
}
