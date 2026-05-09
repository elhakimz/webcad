export class ToolWindow {
  protected id: string;
  protected title: string;
  protected element: HTMLElement;
  protected contentElement: HTMLElement;

  constructor(id: string, title: string) {
    this.id = id;
    this.title = title;
    
    this.element = document.createElement('div');
    this.element.id = `tool-window-${id}`;
    this.element.classList.add('tool-window');
    this.element.style.display = 'none'; // Default hidden
    
    this.element.innerHTML = `
      <div class="tool-window-header">
        <span class="tool-window-title">${title}</span>
        <div class="tool-window-controls">
          <span class="control-btn close-btn" title="Close">✕</span>
        </div>
      </div>
      <div class="tool-window-content"></div>
      <div class="tool-window-resizer"></div>
    `;

    this.contentElement = this.element.querySelector('.tool-window-content')!;

    this.element.querySelector('.close-btn')?.addEventListener('click', () => {
      this.hide();
    });

    // Resizing logic
    const resizer = this.element.querySelector('.tool-window-resizer') as HTMLElement;
    let startX: number;
    let startWidth: number;

    resizer.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = parseInt(document.defaultView!.getComputedStyle(this.element).width, 10);
      document.documentElement.addEventListener('mousemove', doDrag, false);
      document.documentElement.addEventListener('mouseup', stopDrag, false);
      
      // Prevent text selection during drag
      e.preventDefault();
    });

    const doDrag = (e: MouseEvent) => {
      const newWidth = startWidth + e.clientX - startX;
      if (newWidth > 150 && newWidth < 600) { // Min/Max limits
        this.element.style.width = `${newWidth}px`;
      }
    };

    const stopDrag = () => {
      document.documentElement.removeEventListener('mousemove', doDrag, false);
      document.documentElement.removeEventListener('mouseup', stopDrag, false);
    };
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getId(): string {
    return this.id;
  }

  public getTitle(): string {
    return this.title;
  }

  public show() {
    this.element.style.display = 'flex';
    this.element.classList.add('visible');
    
    // Dispatch event or callback if needed
    this.element.dispatchEvent(new CustomEvent('toolwindow-show', { detail: { id: this.id } }));
  }

  public hide() {
    this.element.style.display = 'none';
    this.element.classList.remove('visible');
    
    this.element.dispatchEvent(new CustomEvent('toolwindow-hide', { detail: { id: this.id } }));
  }

  public toggle() {
    if (this.element.style.display === 'none' || !this.element.classList.contains('visible')) {
      this.show();
    } else {
      this.hide();
    }
  }

  public setContent(content: string | HTMLElement) {
    if (typeof content === 'string') {
      this.contentElement.innerHTML = content;
    } else {
      this.contentElement.innerHTML = '';
      this.contentElement.appendChild(content);
    }
  }
}
