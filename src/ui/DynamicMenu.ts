export class DynamicMenu {
  private element: HTMLElement;
  private onOptionClickedCallback?: (option: string) => void;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'dynamic-menu';
    
    // Position and visibility
    this.element.style.position = 'fixed';
    this.element.style.display = 'none';
    this.element.style.zIndex = '10000';
    this.element.style.pointerEvents = 'auto';
    
    // Industrial / Theme styling (Flat, Solid, No glassmorphism)
    this.element.style.backgroundColor = 'var(--popover-bg)';
    this.element.style.color = 'var(--text-color)';
    this.element.style.border = '1px solid var(--border-color)';
    this.element.style.borderRadius = 'var(--radius-sm)';
    this.element.style.fontFamily = 'var(--font-mono)';
    this.element.style.fontSize = '11px';
    this.element.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
    this.element.style.display = 'none'; // Keep hidden initially
    this.element.style.flexDirection = 'column';
    this.element.style.minWidth = '140px';
    this.element.style.userSelect = 'none';

    // Prevent click/mousedown event bubbling to the canvas
    this.element.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this.element.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    document.body.appendChild(this.element);
  }

  show(x: number, y: number, headers: string[], options: string[]) {
    // Clear previous contents
    this.element.innerHTML = '';

    // Render Headers (Non-clickable selection details)
    if (headers && headers.length > 0) {
      const headerContainer = document.createElement('div');
      headerContainer.style.padding = '4px 8px';
      headerContainer.style.borderBottom = '1px solid var(--border-color)';
      headerContainer.style.marginBottom = '2px';
      headerContainer.style.fontWeight = 'bold';
      headerContainer.style.textTransform = 'uppercase';
      headerContainer.style.color = 'var(--accent-color)';
      headerContainer.style.whiteSpace = 'pre-line';
      
      headerContainer.textContent = headers.join('\n');
      this.element.appendChild(headerContainer);
    }

    // Render Options (Clickable vertical list items)
    this.renderOptions(options);

    // Make visible and set flex layout
    this.element.style.display = 'flex';

    // Position carefully to avoid clipping off-screen
    const menuWidth = this.element.offsetWidth || 150;
    const menuHeight = this.element.offsetHeight || 100;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    if (x + menuWidth > windowWidth) finalX = windowWidth - menuWidth - 10;
    if (y + menuHeight > windowHeight) finalY = windowHeight - menuHeight - 10;

    this.element.style.left = `${finalX}px`;
    this.element.style.top = `${finalY}px`;
  }

  private renderOptions(options: string[]) {
    options.forEach(option => {
      if (option.startsWith('---')) {
        const sep = document.createElement('div');
        sep.style.height = '1px';
        sep.style.backgroundColor = 'var(--border-color)';
        sep.style.margin = '4px 0';
        this.element.appendChild(sep);
        return;
      }

      const item = document.createElement('div');
      item.textContent = option;
      item.style.padding = '6px 12px';
      item.style.cursor = 'pointer';
      item.style.whiteSpace = 'nowrap';
      item.style.transition = 'none'; // No flashy transitions

      // Standard solid selection hover effect using theme colors
      item.addEventListener('mouseover', () => {
        item.style.backgroundColor = 'var(--accent-color)';
        item.style.color = '#ffffff';
      });
      item.addEventListener('mouseout', () => {
        item.style.backgroundColor = '';
        item.style.color = '';
      });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        if (this.onOptionClickedCallback) {
          this.onOptionClickedCallback(option);
        }
      });

      this.element.appendChild(item);
    });
  }

  hide() {
    this.element.style.display = 'none';
  }

  onOptionClicked(callback: (option: string) => void) {
    this.onOptionClickedCallback = callback;
  }
}
