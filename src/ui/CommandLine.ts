export class CommandLine {
  private logEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private promptEl: HTMLElement;

  constructor() {
    this.logEl = document.getElementById('command-log')!;
    this.inputEl = document.getElementById('cmd') as HTMLInputElement;
    this.promptEl = document.getElementById('command-prompt')!;

    // Focus input on any click in command area
    document.getElementById('command-area')!.addEventListener('click', () => {
      this.inputEl.focus();
    });
  }

  onCommand(callback: (text: string) => void) {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const value = this.inputEl.value;
        this.inputEl.value = '';
        
        // Echo command to log
        this.print(`Command: ${value}`);
        
        callback(value);
      }
    });
  }

  print(msg: string) {
    if (!msg) return;
    const line = document.createElement('div');
    line.textContent = msg;
    this.logEl.appendChild(line);
    
    // Auto-scroll to bottom
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  setPrompt(text: string) {
    this.promptEl.textContent = text;
  }

  focus() {
    this.inputEl.focus();
  }
}
