import { DockingManager } from "./DockingManager"

export class EditToolbar {
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
      // Register with docking manager, default docked = true
      this.dockingManager.registerWindow('edit_toolbar', this.container, true); 
    }
  }

  private createToolbar() {
    this.container = document.createElement('div');
    this.container.id = 'edit-toolbar';
    this.container.className = 'floating-toolbar'; // Reuse styles
    this.container.style.width = '120px'; // Fixed width for 3 columns

    this.headerEl = document.createElement('div');
    this.headerEl.className = 'toolbar-header';
    this.headerEl.innerHTML = `
      <span>Edit</span>
      <div class="toolbar-controls">
        <span class="control-btn" id="edit-tb-dock">[ ]</span>
        <span class="control-btn" id="edit-tb-minimize">_</span>
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

    // Dock behavior
    const dockBtn = this.headerEl.querySelector('#edit-tb-dock')!;
    dockBtn.addEventListener('click', () => {
      this.dockingManager?.toggleDock('edit_toolbar');
    });

    // Minimize behavior
    const minimizeBtn = this.headerEl.querySelector('#edit-tb-minimize')!;
    minimizeBtn.addEventListener('click', () => {
      this.gridEl.style.display = this.gridEl.style.display === 'none' ? 'grid' : 'none';
      this.container.style.height = 'auto';
    });
  }

  private populateCommands() {
    const commands = [
      { cmd: 'MOVE', icon: 'move_copy.svg', title: 'Move' },
      { cmd: 'COPY', icon: 'copy.svg', title: 'Copy' },
      { cmd: 'ERASE', icon: 'delete.svg', title: 'Erase' },
      { cmd: 'ROTATE', icon: 'rotate.svg', title: 'Rotate' },
      { cmd: 'SCALE', icon: 'scale.svg', title: 'Scale' },
      { cmd: 'MIRROR', icon: 'mirror.svg', title: 'Mirror' },
      { cmd: 'OFFSET', icon: 'offset.svg', title: 'Offset' },
      { cmd: 'FILLET', icon: 'fillet.svg', title: 'Fillet' },
      { cmd: 'CHAMFER', icon: 'bevel.svg', title: 'Chamfer' },
      { cmd: 'TRIM', icon: 'trim.svg', title: 'Trim' },
      { cmd: 'EXTEND', icon: 'trim2.svg', title: 'Extend' },
      { cmd: 'STRETCH', icon: 'stretch.svg', title: 'Stretch' },
      { cmd: 'ARRAY', icon: 'duplicate.svg', title: 'Array' },
      { cmd: 'BREAK', icon: 'break_out_trim.svg', title: 'Break' },
      { cmd: 'JOIN', icon: 'line_join.svg', title: 'Join' }
    ];

    commands.forEach(b => {
      const btn = document.createElement('div');
      btn.className = 'tool-button';
      btn.title = b.title;
      btn.dataset.testid = `tool-edit-${String(b.title).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`;
      btn.style.width = '32px';
      btn.style.height = '32px';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.display = 'flex';
      btn.style.justifyContent = 'center';
      btn.style.alignItems = 'center';
      btn.style.cursor = 'pointer';
      btn.style.backgroundColor = 'var(--panel-bg)';

      const img = document.createElement('img');
      img.src = `/icons/black_blue/${b.icon}`;
      img.style.width = '24px';
      img.style.height = '24px';
      img.style.pointerEvents = 'none';

      btn.appendChild(img);

      btn.onclick = () => {
        this.onAction(b.cmd);
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
