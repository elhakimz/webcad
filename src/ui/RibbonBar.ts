export class RibbonBar {
  protected container: HTMLElement;
  protected header: HTMLElement;
  protected content: HTMLElement;
  protected isMinimized = false;

  constructor(public title: string) {
    this.container = document.createElement('div');
    this.container.className = 'ribbon-bar';
    this.container.draggable = true;

    this.header = document.createElement('div');
    this.header.className = 'ribbon-bar-header';
    this.header.innerHTML = `
      <span>${title}</span>
      <span class="ribbon-minimize-btn">_</span>
    `;

    this.content = document.createElement('div');
    this.content.className = 'ribbon-bar-content';

    this.container.appendChild(this.header);
    this.container.appendChild(this.content);

    const minimizeBtn = this.header.querySelector('.ribbon-minimize-btn')!;
    minimizeBtn.addEventListener('click', () => this.toggleMinimize());

    this.setupDragAndDrop();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  protected toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.content.style.display = this.isMinimized ? 'none' : 'flex';
    const btn = this.header.querySelector('.ribbon-minimize-btn')!;
    btn.textContent = this.isMinimized ? '[' : '_';
  }

  private setupDragAndDrop() {
    this.container.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', this.title);
      this.container.classList.add('dragging');
    });

    this.container.addEventListener('dragend', () => {
      this.container.classList.remove('dragging');
    });
  }
}
