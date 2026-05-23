export class GeneratorProgressModal {
  private overlay?: HTMLElement;
  private statusText?: HTMLElement;
  private progressBar?: HTMLElement;
  private percentText?: HTMLElement;

  constructor(title: string = "Parametric Generation") {
    if (typeof document === 'undefined') return;

    // Inject Blueprint-style theme-aware rules dynamically if not present
    if (!document.getElementById('scad-progress-styles')) {
      const style = document.createElement('style');
      style.id = 'scad-progress-styles';
      style.textContent = `
        .scad-progress-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(16, 22, 26, 0.7);
          backdrop-filter: blur(2px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 99999;
          font-family: var(--font-family), system-ui, -apple-system, sans-serif;
        }
        .light-theme .scad-progress-overlay {
          background-color: rgba(245, 248, 250, 0.75);
        }
        .scad-progress-container {
          background-color: var(--panel-bg, #202B33);
          border: 1px solid var(--border-color, rgba(16, 22, 26, 0.15));
          padding: 20px 24px;
          color: var(--text-color, #F5F8FA);
          width: 420px;
          border-radius: 3px;
          box-shadow: 0 0 0 1px rgba(16, 22, 26, 0.4), 0 4px 20px rgba(16, 22, 26, 0.6);
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
        .light-theme .scad-progress-container {
          box-shadow: 0 0 0 1px rgba(16, 22, 26, 0.15), 0 4px 20px rgba(16, 22, 26, 0.15);
          border-color: var(--border-color, #ccc);
        }
        .scad-progress-title {
          margin: 0;
          color: var(--text-color, #F5F8FA);
          font-size: 11px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          font-weight: 600;
          text-align: left;
        }
        .scad-progress-divider {
          border-top: 1px solid var(--border-color, rgba(16, 22, 26, 0.15));
          width: 100%;
          margin: 10px 0 14px 0;
          opacity: 0.6;
        }
        .scad-progress-text-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          width: 100%;
          margin-bottom: 6px;
        }
        .scad-progress-status {
          margin: 0;
          font-size: 12px;
          color: var(--text-color, #A7B6C2);
          opacity: 0.85;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
          flex-grow: 1;
          margin-right: 15px;
          text-align: left;
        }
        .scad-progress-percent {
          font-size: 12px;
          font-weight: 600;
          color: var(--accent-color, #137CBD);
          text-align: right;
          flex-shrink: 0;
        }
        .scad-progress-bar-outer {
          width: 100%;
          height: 6px;
          background-color: rgba(16, 22, 26, 0.35);
          border-radius: 3px;
          overflow: hidden;
          position: relative;
        }
        .light-theme .scad-progress-bar-outer {
          background-color: rgba(16, 22, 26, 0.08);
        }
        .scad-progress-bar-inner {
          width: 0%;
          height: 100%;
          background-color: var(--accent-color, #137CBD);
          transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border-radius: 3px;
        }
      `;
      document.head.appendChild(style);
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'scad-progress-overlay';

    const container = document.createElement('div');
    container.className = 'scad-progress-container';

    const titleEl = document.createElement('h3');
    titleEl.className = 'scad-progress-title';
    titleEl.textContent = title;
    container.appendChild(titleEl);

    const divider = document.createElement('div');
    divider.className = 'scad-progress-divider';
    container.appendChild(divider);

    const textRow = document.createElement('div');
    textRow.className = 'scad-progress-text-row';

    this.statusText = document.createElement('p');
    this.statusText.className = 'scad-progress-status';
    this.statusText.textContent = "Initializing...";
    textRow.appendChild(this.statusText);

    this.percentText = document.createElement('div');
    this.percentText.className = 'scad-progress-percent';
    this.percentText.textContent = "0%";
    textRow.appendChild(this.percentText);

    container.appendChild(textRow);

    const barOuter = document.createElement('div');
    barOuter.className = 'scad-progress-bar-outer';

    this.progressBar = document.createElement('div');
    this.progressBar.className = 'scad-progress-bar-inner';
    barOuter.appendChild(this.progressBar);

    container.appendChild(barOuter);
    this.overlay.appendChild(container);
  }

  public update(percent: number, status: string) {
    if (typeof document === 'undefined' || !this.progressBar || !this.percentText || !this.statusText) return;
    percent = Math.min(100, Math.max(0, percent));
    this.progressBar.style.width = `${percent}%`;
    this.percentText.textContent = `${Math.round(percent)}%`;
    this.statusText.textContent = status;
  }

  public show() {
    if (typeof document === 'undefined' || !this.overlay) return;
    document.body.appendChild(this.overlay);
  }

  public close() {
    if (typeof document === 'undefined' || !this.overlay) return;
    this.overlay.remove();
  }
}
