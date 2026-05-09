import { RibbonBar } from "./RibbonBar";

export class RibbonContainer {
  private container: HTMLElement;
  private bars: RibbonBar[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'ribbon-container';
    this.container.className = 'ribbon-container';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'row';
    this.container.style.gap = '8px';
    this.container.style.padding = '4px';
    this.container.style.backgroundColor = 'var(--panel-bg)';
    this.container.style.borderBottom = '1px solid var(--border-color)';
    this.container.style.overflowX = 'auto';

    this.setupDragAndDrop();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public addBar(bar: RibbonBar) {
    this.bars.push(bar);
    this.container.appendChild(bar.getElement());
  }

  private setupDragAndDrop() {
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault(); // Necessary to allow drop
      const draggingEl = this.container.querySelector('.dragging') as HTMLElement;
      if (!draggingEl) return;

      const afterElement = this.getDragAfterElement(this.container, e.clientX);
      if (afterElement == null) {
        this.container.appendChild(draggingEl);
      } else {
        this.container.insertBefore(draggingEl, afterElement);
      }
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      this.updateBarsOrder();
    });
  }

  private getDragAfterElement(container: HTMLElement, x: number): HTMLElement | null {
    const draggableElements = [...container.querySelectorAll('.ribbon-bar:not(.dragging)')] as HTMLElement[];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = x - box.left - box.width / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY, element: null as HTMLElement | null }).element;
  }

  private updateBarsOrder() {
    const currentElements = [...this.container.querySelectorAll('.ribbon-bar')] as HTMLElement[];
    const newBars: RibbonBar[] = [];
    currentElements.forEach(el => {
      const bar = this.bars.find(b => b.getElement() === el);
      if (bar) newBars.push(bar);
    });
    this.bars = newBars;
  }
}
