import { aciToRgb } from "../core/engine/MathUtils";

export class ColorSelectList {
  private element: HTMLElement;
  private onSelectCallback: ((color: number) => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'color-select-list';
    this.element.style.position = 'absolute';
    this.element.style.display = 'none';
    this.element.style.zIndex = '1000';

    // Add standard 7 colors
    for (let i = 1; i <= 7; i++) {
      const colorBox = document.createElement('div');
      colorBox.className = 'color-box';
      const hexColor = aciToRgb(i);
      colorBox.style.backgroundColor = `#${hexColor.toString(16).padStart(6, '0')}`;
      colorBox.title = `Color ${i}`;
      
      colorBox.addEventListener('click', () => {
        if (this.onSelectCallback) {
          this.onSelectCallback(i);
        }
        this.hide();
      });
      
      this.element.appendChild(colorBox);
    }

    document.body.appendChild(this.element);

    // Hide on click outside
    document.addEventListener('mousedown', (e) => {
      if (!this.element.contains(e.target as Node)) {
        this.hide();
      }
    });
  }

  public show(x: number, y: number, onSelect: (color: number) => void) {
    this.onSelectCallback = onSelect;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.style.display = 'grid';
  }

  public hide() {
    this.element.style.display = 'none';
  }
}
