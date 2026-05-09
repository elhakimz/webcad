import { ToolWindow } from './ToolWindow';

export class DimToolbox {
  private container: HTMLElement;

  constructor(private toolWindow: ToolWindow, private onCommand: (cmd: string) => void) {
    this.container = document.createElement('div');
    this.container.className = 'dim-toolbox-inner';
    this.container.style.padding = '10px';
    this.container.style.display = 'grid';
    this.container.style.gridTemplateColumns = 'repeat(4, 40px)';
    this.container.style.gap = '5px';

    this.createUI();
    this.toolWindow.setContent(this.container);
  }

  private createUI() {
    const buttons = [
      { cmd: 'DIMLINEAR', icon: 'dim_linear.svg', title: 'Linear Dimension' },
      { cmd: 'DIMALIGNED', icon: 'dim_aligned.svg', title: 'Aligned Dimension' },
      { cmd: 'DIMRADIUS', icon: 'dim_radial.svg', title: 'Radius Dimension' },
      { cmd: 'DIMDIAMETER', icon: 'dim_diametric.svg', title: 'Diameter Dimension' },
      { cmd: 'DIMANGULAR', icon: 'dim_angular.svg', title: 'Angular Dimension' }
    ];

    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.title = b.title;
      btn.style.width = '40px';
      btn.style.height = '40px';
      btn.style.padding = '4px';
      btn.style.backgroundColor = 'var(--panel-bg)';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.cursor = 'pointer';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.justifyContent = 'center';

      const img = document.createElement('img');
      img.src = `/icons/black_blue/${b.icon}`;
      img.style.width = '100%';
      img.style.height = '100%';
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        this.onCommand(b.cmd);
      });

      this.container.appendChild(btn);
    });
  }
}
