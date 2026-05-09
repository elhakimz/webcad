export class DockingManager {
  private pane: HTMLElement;
  private contentContainer!: HTMLElement;
  private windows: Map<string, HTMLElement> = new Map();

  constructor() {
    this.pane = document.getElementById('docking-pane')!;
    if (!this.pane) {
      this.pane = document.createElement('div');
      this.pane.id = 'docking-pane';
      const mainArea = document.getElementById('main-area')!;
      if (mainArea) {
        mainArea.appendChild(this.pane);
      } else {
        console.error("Main area not found to attach docking pane.");
      }
    }

    this.pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-title">Dock</span>
        <span class="control-btn" id="pane-minimize">_</span>
      </div>
      <div class="pane-content"></div>
    `;

    this.contentContainer = this.pane.querySelector('.pane-content')!;

    const minimizeBtn = this.pane.querySelector('#pane-minimize')!;
    minimizeBtn.addEventListener('click', () => {
      this.pane.classList.toggle('minimized');
      minimizeBtn.textContent = this.pane.classList.contains('minimized') ? '[' : '_';
    });

    this.setupDragAndDrop();
  }

  public registerWindow(id: string, el: HTMLElement, defaultDocked = false, x: string | number = 100, y: string | number = 100) {
    this.windows.set(id, el);
    el.classList.add('dockable-window');
    
    el.addEventListener('dragstart', () => {
      if (el.classList.contains('docked')) {
        el.classList.add('dragging');
      }
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });

    if (defaultDocked) {
      this.dock(id);
    } else {
      this.undock(id, x, y);
    }
  }

  public dock(id: string) {
    const el = this.windows.get(id);
    if (!el) return;

    el.classList.remove('floating');
    el.classList.add('docked');
    el.draggable = true;
    el.style.position = '';
    el.style.top = '';
    el.style.left = '';
    
    // For toolbar, reset grid columns if needed
    const grid = el.querySelector('.toolbar-grid') as HTMLElement;
    if (grid) {
      grid.style.gridTemplateColumns = 'repeat(3, 1fr)'; // Reset to default or adjust to pane width
    }

    this.contentContainer.appendChild(el);
  }

  public undock(id: string, x: string | number = 100, y: string | number = 100) {
    const el = this.windows.get(id);
    if (!el) return;

    el.classList.remove('docked');
    el.classList.add('floating');
    el.draggable = false;
    el.style.position = 'absolute';
    el.style.top = typeof y === 'number' ? `${y}px` : y;
    el.style.left = typeof x === 'number' ? `${x}px` : x;
    
    document.body.appendChild(el);
  }

  public toggleDock(id: string) {
    const el = this.windows.get(id);
    if (!el) return;

    if (el.classList.contains('docked')) {
      this.undock(id);
    } else {
      this.dock(id);
    }
  }

  private setupDragAndDrop() {
    this.contentContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingEl = this.contentContainer.querySelector('.docked.dragging') as HTMLElement;
      if (!draggingEl) return;

      const afterElement = this.getDragAfterElement(this.contentContainer, e.clientY);
      if (afterElement == null) {
        this.contentContainer.appendChild(draggingEl);
      } else {
        this.contentContainer.insertBefore(draggingEl, afterElement);
      }
    });

    this.contentContainer.addEventListener('drop', (e) => {
      e.preventDefault();
    });
  }

  private getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
    const draggableElements = [...container.querySelectorAll('.docked:not(.dragging)')] as HTMLElement[];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY, element: null as HTMLElement | null }).element;
  }
}
