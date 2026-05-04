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

  constructor(private onAction: (cmd: string) => void) {
    this.container = document.getElementById('menu-items')!;
    this.headerEl = document.querySelector('#side-menu .menu-header')!;
    
    (this.headerEl as HTMLElement).style.cursor = 'pointer';
    this.headerEl.onclick = () => this.goBack();

    this.setupInitialMenu();
  }

  private setupInitialMenu() {
    const root: MenuItem[] = [
      { label: 'AutoCAD', command: 'CANCEL' },
      { label: '****', command: 'CANCEL' },
      { label: 'BLOCKS', submenu: [{ label: 'BLOCK' }, { label: 'INSERT' }] },
      { label: 'DIM:', submenu: [{ label: 'DIM' }] },
      { label: 'DISPLAY', submenu: [{ label: 'ZOOM' }, { label: 'PAN' }] },
      { label: 'DRAW', submenu: [
        { label: 'ARC', command: 'ARC' },
        { label: 'CIRCLE', command: 'CIRCLE' },
        { label: 'LINE:', command: 'LINE' },
        { label: 'PLINE', command: 'PLINE' },
        { label: 'POINT', command: 'POINT' },
        { label: 'POLYGON', command: 'POLYGON' },
        { label: 'SOLID', command: 'SOLID' },
        { label: 'TEXT' }
      ]},
      { label: 'EDIT', submenu: [
        { label: 'ERASE', command: 'ERASE' },
        { label: 'MOVE', command: 'MOVE' },
        { label: 'COPY', command: 'COPY' },
        { label: 'ROTATE', command: 'ROTATE' },
        { label: 'SCALE', command: 'SCALE' },
        { label: 'MIRROR', command: 'MIRROR' }
      ]},
      { label: 'INQUIRY' },
      { label: 'LAYERS' },
      { label: 'MODES' },
      { label: 'PLOT' },
      { label: 'UTILITY' },
      { label: '3D' },
      { label: 'SAVE:' }
    ];

    this.render(root, 'ROOT\nMENU');
  }

  render(items: MenuItem[], headerText: string) {
    this.currentItems = items;
    this.headerEl.innerText = headerText;
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
