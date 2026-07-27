import { RibbonBar } from "./RibbonBar";

export class SettingsRibbonBar extends RibbonBar {
  constructor(private onThemeChange: (theme: 'dark' | 'light') => void) {
    super("Settings");
    this.initContent();
  }

  private initContent() {
    const settingsBtn = this.createButton("Settings", () => {
      // TODO: display app settings dialog
      alert("Settings dialog not implemented yet.");
    });

    const themeBtn = this.createButton("Light Theme", () => {
      const isLight = document.body.classList.toggle('light-theme');
      themeBtn.textContent = isLight ? "Dark Theme" : "Light Theme";
      this.onThemeChange(isLight ? 'light' : 'dark');
    });

    this.content.appendChild(settingsBtn);
    this.content.appendChild(themeBtn);
  }

  private createButton(label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    // Stable across the label flip between "Light Theme" and "Dark Theme".
    btn.dataset.testid = `settings-${label.toLowerCase().includes('theme') ? 'theme' : label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    btn.style.padding = '2px 6px';
    btn.style.fontSize = '11px';
    btn.style.cursor = 'pointer';
    btn.style.backgroundColor = 'var(--panel-bg)';
    btn.style.color = 'var(--text-color)';
    btn.style.border = '1px solid var(--border-color)';
    btn.style.borderRadius = 'var(--radius-sm)';
    btn.addEventListener('click', onClick);
    
    btn.addEventListener('mouseover', () => {
      btn.style.backgroundColor = 'var(--bg-color)';
      btn.style.borderColor = 'var(--accent-color)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.backgroundColor = 'var(--panel-bg)';
      btn.style.borderColor = 'var(--border-color)';
    });
    
    return btn;
  }
}
