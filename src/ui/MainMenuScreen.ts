export class MainMenuScreen {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private status: HTMLElement;

  constructor(private onStartDrawing: () => void) {
    this.container = document.getElementById('main-menu-screen')!;
    this.input = document.getElementById('main-menu-input') as HTMLInputElement;
    this.status = document.getElementById('main-menu-status')!;

    this.setupEvents();
    this.input.focus();
  }

  private setupEvents() {
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = this.input.value.trim();
        this.input.value = '';
        this.handleSelection(val);
      }
    });

    // Keep focus on input
    window.addEventListener('click', () => {
      if (this.container.style.display !== 'none') {
        this.input.focus();
      }
    });
  }

  private handleSelection(val: string) {
    switch (val) {
      case '0':
        this.status.textContent = "Please close the browser tab to exit.";
        break;
      case '1':
        this.hide();
        this.onStartDrawing();
        break;
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
        this.status.textContent = `Option ${val} is not implemented yet.`;
        break;
      default:
        this.status.textContent = "Invalid selection. Please enter 0-8.";
    }
  }

  setStatus(msg: string) {
    this.status.textContent = msg;
  }

  setEnabled(enabled: boolean) {
    this.input.disabled = !enabled;
    if (enabled) this.input.focus();
  }

  hide() {
    this.container.style.display = 'none';
  }

  show() {
    this.container.style.display = 'flex';
    this.input.focus();
  }
}
