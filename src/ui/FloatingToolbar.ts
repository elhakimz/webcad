import { DockingManager } from "./DockingManager"

export class FloatingToolbar {
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
      this.dockingManager.registerWindow('toolbar', this.container, false, 'calc(100vw - 350px)', 100); // Default floating on the right
    }
  }

  private createToolbar() {
    this.container = document.createElement('div');
    this.container.id = 'floating-toolbar';
    this.container.className = 'floating-toolbar';
    this.container.style.position = 'absolute';
    this.container.style.top = '100px';
    this.container.style.left = 'calc(100vw - 350px)'; // Position at the right
    this.container.style.width = '120px'; // Fixed width for 3 columns
    this.container.style.zIndex = '1000';

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'toolbar-header';
    this.headerEl.innerHTML = `
      <span>Draw</span>
      <div class="toolbar-controls">
        <span class="control-btn" id="tb-dock">[ ]</span>
        <span class="control-btn" id="tb-minimize">_</span>
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

    // Add a resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    this.container.appendChild(resizeHandle);

    document.body.appendChild(this.container);
    this.container.style.display = 'none'; // Start hidden

    // Dock behavior
    const dockBtn = this.headerEl.querySelector('#tb-dock')!;
    dockBtn.addEventListener('click', () => {
      this.dockingManager?.toggleDock('toolbar');
    });

    // Minimize behavior
    const minimizeBtn = this.headerEl.querySelector('#tb-minimize')!;
    minimizeBtn.addEventListener('click', () => {
      this.gridEl.style.display = this.gridEl.style.display === 'none' ? 'grid' : 'none';
      this.container.style.height = 'auto';
    });
  }

  private populateCommands() {
    const commands = [
      'LINE', 'CIRCLE', 'ARC', 'RECTANG', 'PLINE', 'POINT',
      'POLYGON', 'ELLIPSE', 'HATCH', 'TEXT', 'SPLINE', 'DONUT',
      'SOLID', 'TRACE', 'SKETCH', 'SHAPE'
    ];

    commands.forEach(cmd => {
      const btn = document.createElement('div');
      btn.className = 'tool-button';
      btn.title = cmd;
      btn.style.width = '32px';
      btn.style.height = '32px';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.display = 'flex';
      btn.style.justifyContent = 'center';
      btn.style.alignItems = 'center';
      btn.style.cursor = 'pointer';
      btn.style.backgroundColor = 'var(--panel-bg)';

      const img = document.createElement('img');
      img.src = `/icons/black_blue/${cmd}.svg`;
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.pointerEvents = 'none'; // So click goes to div

      // Fallback if image fails
      img.onerror = () => {
        img.style.display = 'none';
        btn.textContent = cmd.substring(0, 2); // Show first 2 letters
        btn.style.fontSize = '10px';
        btn.style.fontWeight = 'bold';
      };

      btn.appendChild(img);

      btn.onclick = () => {
        this.onAction(cmd);
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
      this.container.style.right = ''; // Clear right when dragging starts to prevent stretching
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
      // Determine columns based on width
      const btnSize = 36; // 32 width + 4 gap approx
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
