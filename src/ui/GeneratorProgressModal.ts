export class GeneratorProgressModal {
  private overlay: HTMLElement;
  private statusText: HTMLElement;
  private progressBar: HTMLElement;
  private percentText: HTMLElement;

  constructor(title: string = "Parametric Generation") {
    // Inject animation styles dynamically if not present
    if (!document.getElementById('scad-progress-styles')) {
      const style = document.createElement('style');
      style.id = 'scad-progress-styles';
      style.textContent = `
        @keyframes progress-bar-stripes {
          from { background-position: 15px 0; }
          to { background-position: 0 0; }
        }
      `;
      document.head.appendChild(style);
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'scad-progress-overlay';
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '99999', // Ensure it sits on top of everything
      fontFamily: 'var(--font-mono), monospace'
    });

    const container = document.createElement('div');
    Object.assign(container.style, {
      backgroundColor: 'var(--panel-bg, #1a1a1a)',
      border: '1px solid var(--border-color, #333)',
      padding: '30px',
      color: 'var(--text-color, #eee)',
      width: '450px',
      borderRadius: '8px',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '20px'
    });

    const titleEl = document.createElement('h3');
    titleEl.textContent = `⚡ ${title}`;
    Object.assign(titleEl.style, {
      margin: '0',
      color: 'var(--accent-color, #00f0ff)',
      fontSize: '16px',
      letterSpacing: '1px',
      textTransform: 'uppercase',
      fontWeight: 'bold'
    });
    container.appendChild(titleEl);

    this.statusText = document.createElement('p');
    this.statusText.textContent = "Initializing generator...";
    Object.assign(this.statusText.style, {
      margin: '0',
      fontSize: '13px',
      textAlign: 'center',
      opacity: '0.9',
      minHeight: '20px',
      width: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    });
    container.appendChild(this.statusText);

    const barOuter = document.createElement('div');
    Object.assign(barOuter.style, {
      width: '100%',
      height: '12px',
      backgroundColor: '#111',
      borderRadius: '6px',
      border: '1px solid #333',
      overflow: 'hidden',
      position: 'relative'
    });

    this.progressBar = document.createElement('div');
    Object.assign(this.progressBar.style, {
      width: '0%',
      height: '100%',
      background: 'linear-gradient(90deg, #00f0ff, #7000ff)',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      borderRadius: '4px'
    });

    const stripes = document.createElement('div');
    Object.assign(stripes.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      background: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
      backgroundSize: '15px 15px',
      animation: 'progress-bar-stripes 1s linear infinite'
    });
    this.progressBar.appendChild(stripes);
    barOuter.appendChild(this.progressBar);
    container.appendChild(barOuter);

    this.percentText = document.createElement('div');
    this.percentText.textContent = "0%";
    Object.assign(this.percentText.style, {
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'var(--accent-color, #00f0ff)'
    });
    container.appendChild(this.percentText);

    this.overlay.appendChild(container);
  }

  public update(percent: number, status: string) {
    percent = Math.min(100, Math.max(0, percent));
    this.progressBar.style.width = `${percent}%`;
    this.percentText.textContent = `${Math.round(percent)}%`;
    this.statusText.textContent = status;
  }

  public show() {
    document.body.appendChild(this.overlay);
  }

  public close() {
    this.overlay.remove();
  }
}
