export class CommandLine {
  private logEl: HTMLElement;
  private inputEl: HTMLInputElement;
  private promptEl: HTMLElement;
  private history: string[] = [];
  private historyIndex: number = -1;
  private commands: string[] = [];

  constructor() {
    this.logEl = document.getElementById('command-log')!;
    this.inputEl = document.getElementById('cmd') as HTMLInputElement;
    this.promptEl = document.getElementById('command-prompt')!;

    // Focus input on any click in command area
    document.getElementById('command-area')!.addEventListener('click', () => {
      this.inputEl.focus();
    });
  }

  setCommands(commands: string[]) {
    this.commands = commands;
  }

  onCommand(callback: (text: string) => void) {
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const value = this.inputEl.value;
        this.inputEl.value = '';
        
        // Echo command to log
        this.print(`Command: ${value}`);
        
        // Add to history if not empty and not duplicate of last command
        if (value.trim() !== '') {
          if (this.history.length === 0 || this.history[this.history.length - 1] !== value) {
            this.history.push(value);
          }
          this.historyIndex = -1; // Reset index
        }
        
        callback(value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.history.length > 0) {
          if (this.historyIndex === -1) {
            this.historyIndex = this.history.length - 1;
          } else if (this.historyIndex > 0) {
            this.historyIndex--;
          }
          this.inputEl.value = this.history[this.historyIndex];
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.historyIndex !== -1) {
          if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.inputEl.value = this.history[this.historyIndex];
          } else {
            this.historyIndex = -1;
            this.inputEl.value = '';
          }
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const value = this.inputEl.value.trim().toUpperCase();
        if (value !== '') {
          const matches = this.commands.filter(cmd => cmd.startsWith(value));
          if (matches.length === 1) {
            this.inputEl.value = matches[0];
          } else if (matches.length > 1) {
            // Print available options
            this.print(`Matches: ${matches.join(', ')}`);
          }
        }
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
