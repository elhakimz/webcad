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
  }

  public registerWindow(id: string, el: HTMLElement, defaultDocked = false) {
    this.windows.set(id, el);
    el.classList.add('dockable-window');
    
    if (defaultDocked) {
      this.dock(id);
    } else {
      this.undock(id);
    }
  }

  public dock(id: string) {
    const el = this.windows.get(id);
    if (!el) return;

    el.classList.remove('floating');
    el.classList.add('docked');
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

  public undock(id: string, x = 100, y = 100) {
    const el = this.windows.get(id);
    if (!el) return;

    el.classList.remove('docked');
    el.classList.add('floating');
    el.style.position = 'absolute';
    el.style.top = `${y}px`;
    el.style.left = `${x}px`;
    
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
}
