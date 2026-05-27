import { DockingManager } from "./DockingManager"

export class SolidToolbar {
  private container!: HTMLElement;
  private headerEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private isDragging = false;
  private isResizing = false;
  private startX = 0;
  private startY = 0;
  private startWidth = 0;
  private startHeight = 0;
  private currentCols = 3;

  constructor(private onAction: (cmd: string) => void, private dockingManager?: DockingManager) {
    this.createToolbar();
    this.setupDragging();
    this.setupResizing();
    this.populateCommands();

    if (this.dockingManager) {
      this.dockingManager.registerWindow('solid-toolbar', this.container, true, 200, 300); // Default docked
    }
  }

  private createToolbar() {
    this.container = document.createElement('div');
    this.container.id = 'solid-toolbar';
    this.container.className = 'floating-toolbar'; // Reuse styles
    this.container.style.position = 'absolute';
    this.container.style.top = '300px';
    this.container.style.left = '100px';
    this.container.style.width = '120px'; // Fixed width for 3 columns
    this.container.style.zIndex = '1000';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'toolbar-header';
    this.headerEl.innerHTML = `
      <span>Solid</span>
      <div class="toolbar-controls">
        <span class="control-btn" id="stb-dock">[ ]</span>
        <span class="control-btn" id="stb-minimize">_</span>
      </div>
    `;

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'toolbar-grid';
    this.gridEl.style.display = 'grid';
    this.gridEl.style.gridTemplateColumns = `repeat(${this.currentCols}, 1fr)`;
    this.gridEl.style.gap = '4px';
    this.gridEl.style.padding = '4px';

    this.container.appendChild(this.headerEl);
    this.container.appendChild(this.gridEl);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    this.container.appendChild(resizeHandle);

    document.body.appendChild(this.container);
    this.container.style.display = 'none'; // Start hidden

    const dockBtn = this.headerEl.querySelector('#stb-dock')!;
    dockBtn.addEventListener('click', () => {
      this.dockingManager?.toggleDock('solid-toolbar');
    });

    const minimizeBtn = this.headerEl.querySelector('#stb-minimize')!;
    minimizeBtn.addEventListener('click', () => {
      this.gridEl.style.display = this.gridEl.style.display === 'none' ? 'grid' : 'none';
      this.container.style.height = 'auto';
    });
  }

  private populateCommands() {
    const commands: ({ cmd: string, icon: string } | { type: string })[] = [
      { cmd: 'BOX', icon: 'box.svg' },
      { cmd: 'CYLINDER', icon: 'cylinder.svg' },
      { cmd: 'CONE', icon: 'cone.svg' },
      { cmd: 'SPHERE', icon: 'sphere.svg' },
      { cmd: 'TORUS', icon: 'torus.svg' },
      { cmd: 'WEDGE', icon: 'wedge.svg' },
      { cmd: 'PYRAMID', icon: 'pyramid.svg' },
      { cmd: 'EXTRUDE', icon: 'extrude.svg' },
      { cmd: 'REVOLVE', icon: 'revolve.svg' },
      { cmd: 'SWEEP', icon: 'sweep.svg' },
      { cmd: 'LOFT', icon: 'loft.svg' },
      { cmd: 'SFILLET', icon: 'sfillet.svg' },
      { cmd: 'SCHAMFER', icon: 'schamfer.svg' },
      { cmd: 'DRAFT', icon: 'draft.svg' },
      { cmd: 'SHELL', icon: 'shell.svg' },
      { type: 'separator' },
      { cmd: 'UNION', icon: 'union.svg' },
      { cmd: 'SUBTRACT', icon: 'subtract.svg' },
      { cmd: 'INTERSECT', icon: 'intersect.svg' }
    ];

    commands.forEach(b => {
      if ('type' in b && b.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'grid-separator';
        sep.style.gridColumn = '1 / -1';
        sep.style.height = '1px';
        sep.style.backgroundColor = 'var(--border-color)';
        sep.style.margin = '4px 0';
        this.gridEl.appendChild(sep);
        return;
      }

      const item = b as { cmd: string, icon: string };
      const btn = document.createElement('div');
      btn.className = 'tool-button';
      btn.title = item.cmd;
      btn.style.width = '32px';
      btn.style.height = '32px';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.display = 'flex';
      btn.style.justifyContent = 'center';
      btn.style.alignItems = 'center';
      btn.style.cursor = 'pointer';
      btn.style.backgroundColor = 'var(--panel-bg)';

      const img = document.createElement('img');
      img.src = `/icons/black_blue/${item.icon}`;
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.pointerEvents = 'none';

      img.onerror = () => {
        img.style.display = 'none';
        btn.textContent = item.cmd.substring(0, 2); // Show first 2 letters
        btn.style.fontSize = '10px';
        btn.style.fontWeight = 'bold';
      };

      btn.appendChild(img);

      btn.onclick = () => {
        this.onAction(item.cmd);
      };

      this.gridEl.appendChild(btn);
    });
  }

  private setupDragging() {
    this.headerEl.style.cursor = 'move';
    this.headerEl.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).classList.contains('control-btn')) return;
      if (this.container.classList.contains('docked')) return;
      this.isDragging = true;
      this.startX = e.clientX - this.container.offsetLeft;
      this.startY = e.clientY - this.container.offsetTop;
      this.container.style.right = '';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      this.container.style.left = `${e.clientX - this.startX}px`;
      this.container.style.top = `${e.clientY - this.startY}px`;
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  private setupResizing() {
    const handle = this.container.querySelector('.resize-handle') as HTMLElement;
    if (!handle) return;

    handle.style.cursor = 'nwse-resize';
    handle.addEventListener('mousedown', (e) => {
      if (this.container.classList.contains('docked')) return;
      this.isResizing = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startWidth = this.container.offsetWidth;
      this.startHeight = this.container.offsetHeight;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isResizing) return;
      const width = this.startWidth + (e.clientX - this.startX);
      const btnSize = 36;
      const cols = Math.max(1, Math.floor(width / btnSize));
      if (cols !== this.currentCols) {
        this.currentCols = cols;
        this.gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
      this.container.style.width = `${width}px`;
    });

    document.addEventListener('mouseup', () => {
      this.isResizing = false;
    });
  }

  public show() {
    this.container.style.display = 'block';
  }

  public hide() {
    this.container.style.display = 'none';
  }
}
