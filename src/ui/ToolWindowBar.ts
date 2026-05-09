import { ToolWindow } from './ToolWindow';

export class ToolWindowBar {
  private element: HTMLElement;
  private items: Map<string, { icon: string, window: ToolWindow, btn: HTMLElement }> = new Map();

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'tool-window-bar';
    this.element.classList.add('tool-window-bar');
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public addWindow(icon: string, window: ToolWindow) {
    const btn = document.createElement('div');
    btn.classList.add('bar-item');
    btn.setAttribute('data-id', window.getId());
    btn.setAttribute('title', window.getTitle());
    
    btn.innerHTML = `<span class="icon">${icon}</span>`;
    
    btn.addEventListener('click', () => {
      this.toggleWindow(window.getId());
    });

    this.items.set(window.getId(), { icon, window, btn });
    this.element.appendChild(btn);

    // Listen to window events to update button state
    window.getElement().addEventListener('toolwindow-show', () => {
      btn.classList.add('active');
      // Optional: hide other windows if we want mutually exclusive behavior
      this.hideOthers(window.getId());
    });
    
    window.getElement().addEventListener('toolwindow-hide', () => {
      btn.classList.remove('active');
    });
  }

  public toggleWindow(id: string) {
    const item = this.items.get(id);
    if (!item) return;
    item.window.toggle();
  }

  private hideOthers(activeId: string) {
    this.items.forEach((item, id) => {
      if (id !== activeId) {
        item.window.hide();
      }
    });
  }

  public setActive(id: string, active: boolean) {
    const item = this.items.get(id);
    if (!item) return;
    
    if (active) {
      item.window.show();
    } else {
      item.window.hide();
    }
  }
}
