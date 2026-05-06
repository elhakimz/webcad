export class MainMenuScreen {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private status: HTMLElement;
  private menuContent: HTMLElement;
  private currentView: 'root' | 'load' = 'root';
  private files: string[] = [];

  constructor(private onStartDrawing: (filename?: string) => void) {
    this.container = document.getElementById('main-menu-screen')!;
    this.input = document.getElementById('main-menu-input') as HTMLInputElement;
    this.status = document.getElementById('main-menu-status')!;
    this.menuContent = document.getElementById('main-menu-options')!;

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

  private async handleSelection(val: string) {
    if (this.currentView === 'root') {
      switch (val) {
        case '0':
          this.status.textContent = "Please close the browser tab to exit.";
          break;
        case '1':
          this.hide();
          this.onStartDrawing();
          break;
        case '2':
          await this.showLoadMenu();
          break;
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
    } else if (this.currentView === 'load') {
      if (val === '0') {
        this.showRootMenu();
        return;
      }

      const idx = parseInt(val) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < this.files.length) {
        const filename = this.files[idx];
        this.hide();
        this.onStartDrawing(filename);
      } else {
        // Try direct name matching
        const found = this.files.find(f => f.toUpperCase() === val.toUpperCase() || f.toUpperCase() === (val + ".DXF").toUpperCase());
        if (found) {
            this.hide();
            this.onStartDrawing(found);
        } else {
            this.status.textContent = "Invalid file selection. Enter number or filename.";
        }
      }
    }
  }

  private async showLoadMenu() {
    this.setStatus("Fetching file list...");
    try {
      const response = await fetch('/api/files');
      if (response.ok) {
        this.files = await response.json();
        this.currentView = 'load';
        this.renderLoadMenu();
        this.status.textContent = "";
      } else {
        this.status.textContent = "Error fetching file list.";
      }
    } catch (e) {
      this.status.textContent = "Network error fetching files.";
    }
  }

  private renderLoadMenu() {
    let html = `
      <div style="text-align: left; margin-bottom: 20px;">
        <h2 style="color: #ffaa00; margin-bottom: 10px;">LOAD EXISTING DRAWING</h2>
    `;
    
    if (this.files.length === 0) {
      html += `<p>No DXF files found in ./files folder.</p>`;
    } else {
      this.files.forEach((file, i) => {
        html += `<p>${i + 1}. ${file}</p>`;
      });
    }

    html += `
        <p style="margin-top: 20px;">0. Return to main menu</p>
      </div>
    `;
    this.menuContent.innerHTML = html;
  }

  private showRootMenu() {
    this.currentView = 'root';
    this.menuContent.innerHTML = `
      <p>0.  Exit WebCAD</p>
      <p>1.  Begin a NEW drawing</p>
      <p>2.  Edit an EXISTING drawing</p>
      <p>3.  Plot a drawing</p>
      <p>4.  Printer plot a drawing</p>
      <br>
      <p>5.  Configure WebCAD</p>
      <p>6.  File Utilities</p>
      <p>7.  Compile shape/font description file</p>
      <p>8.  Convert old drawing file</p>
    `;
    this.status.textContent = "";
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
    this.showRootMenu();
    this.container.style.display = 'flex';
    this.input.focus();
  }
}
