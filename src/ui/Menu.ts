import { DockingManager } from "./DockingManager"

interface MenuItem {
  label: string;
  command?: string;
  submenu?: MenuItem[];
}

export class Menu {
  private container: HTMLElement;
  private headerEl: HTMLElement;
  private history: MenuItem[][] = [];
  private currentItems: MenuItem[] = [];

  constructor(private onAction: (cmd: string) => void, private dockingManager?: DockingManager) {
    this.container = document.getElementById('menu-items')!;
    this.headerEl = document.querySelector('#side-menu .menu-header')!;
    
    (this.headerEl as HTMLElement).style.cursor = 'pointer';
    this.headerEl.onclick = (e) => {
      if ((e.target as HTMLElement).classList.contains('control-btn')) return;
      this.goBack();
    };

    if (this.dockingManager) {
      this.setupDocking();
    }

    this.setupInitialMenu();
  }

  private setupDocking() {
    const sideMenu = document.getElementById('side-menu')!;
    if (!sideMenu) return;

    const controls = document.createElement('div');
    controls.className = 'toolbar-controls';
    controls.innerHTML = `
      <span class="control-btn" id="menu-dock">[ ]</span>
      <span class="control-btn" id="menu-minimize">_</span>
    `;
    this.headerEl.appendChild(controls);

    const dockBtn = controls.querySelector('#menu-dock')!;
    dockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dockingManager?.toggleDock('menu');
    });

    const minimizeBtn = controls.querySelector('#menu-minimize')!;
    minimizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const items = document.getElementById('menu-items')!;
      items.style.display = items.style.display === 'none' ? 'block' : 'none';
    });

    this.dockingManager?.registerWindow('menu', sideMenu, true);
  }

  private setupInitialMenu() {
    const root: MenuItem[] = [
      { label: 'PLOT' },
      { label: 'UTILITY', submenu: [
        { label: 'LTYPE', command: 'LINETYPE' },
        { label: 'UNITS', command: 'UNITS' },
        { label: 'SCRIPT' },
        { label: 'MENU' }
      ]},
      { label: '3D', submenu: [
        { label: 'BOX', command: 'BOX' },
        { label: 'CYLINDER', command: 'CYLINDER' },
        { label: 'SPHERE', command: 'SPHERE' },
        { label: 'CONE', command: 'CONE' },
        { label: 'TORUS', command: 'TORUS' },
        { label: 'WEDGE', command: 'WEDGE' },
        { label: 'PYRAMID', command: 'PYRAMID' },
        { label: '---' },
        { label: 'UNION', command: 'UNION' },
        { label: 'SUBTRACT', command: 'SUBTRACT' },
        { label: 'INTERSECT', command: 'INTERSECT' },
        { label: '---' },
        { label: 'EXTRUDE', command: 'EXTRUDE' },
        { label: 'REVOLVE', command: 'REVOLVE' },
        { label: 'SWEEP', command: 'SWEEP' },
        { label: 'LOFT', command: 'LOFT' }
      ]},
      { label: 'NEW:', command: 'NEW' },
      { label: 'LOAD:', command: 'LOAD' },
      { label: 'SAVE:', command: 'SAVE' }
    ];

    this.render(root, 'ROOT\nMENU');
  }

  render(items: MenuItem[], headerText: string) {
    this.currentItems = items;
    
    let textEl = this.headerEl.querySelector('.header-text') as HTMLElement;
    if (!textEl) {
      // Clear anything that is NOT a control to prevent duplication
      Array.from(this.headerEl.childNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).classList.contains('toolbar-controls')) {
          return;
        }
        this.headerEl.removeChild(node);
      });

      textEl = document.createElement('span');
      textEl.className = 'header-text';
      this.headerEl.insertBefore(textEl, this.headerEl.firstChild);
    }
    
    // Change 'ROOT\nMENU' to 'Menu' as requested
    textEl.innerText = headerText === 'ROOT\nMENU' ? 'Menu' : headerText;

    this.container.innerHTML = '';

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'menu-item';
      el.textContent = item.label;
      el.onclick = () => this.handleItemClick(item);
      this.container.appendChild(el);
    });
  }

  private handleItemClick(item: MenuItem) {
    if (item.submenu) {
      this.history.push(this.currentItems);
      this.render(item.submenu, item.label);
    } else if (item.command) {
      this.onAction(item.command);
    } else {
      // Default to label if no command
      this.onAction(item.label.toUpperCase());
    }
  }

  goBack() {
    if (this.history.length > 0) {
      const previous = this.history.pop()!;
      this.render(previous, this.history.length === 0 ? 'ROOT\nMENU' : 'SUB\nMENU');
    }
  }

  goToRoot() {
    this.history = [];
    this.setupInitialMenu();
  }
}
