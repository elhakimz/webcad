import { RibbonBar } from "./RibbonBar";
import { DraftingStatus } from "./StatusBar";

export class DraftingAidsRibbonBar extends RibbonBar {
  private snapEl: HTMLElement;
  private gridEl: HTMLElement;
  private orthoEl: HTMLElement;
  private xyzEl: HTMLElement;
  private modeEl!: HTMLElement;
  private axisEl!: HTMLElement;
  private snapInput!: HTMLInputElement;
  private gridInput!: HTMLInputElement;

  constructor(
    private onToggle: (type: 'snap' | 'grid' | 'ortho' | 'xyz' | 'mode' | 'axis') => void,
    private onSizeChange?: (type: 'snap' | 'grid', value: number) => void,
    initialSnap: number = 5,
    initialGrid: number = 10
  ) {
    super("Drafting Aids");

    this.content.innerHTML = `
      <div class="ribbon-item">
        <span class="toggle" id="ribbon-snap" style="cursor: pointer;">SNAP</span>
        <input type="number" id="ribbon-snap-size" style="width: 40px; font-size: 11px; margin-left: 4px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: var(--radius-sm);" step="1" min="1" value="${initialSnap}" />
      </div>
      <div class="ribbon-item">
        <span class="toggle" id="ribbon-grid" style="cursor: pointer;">GRID</span>
        <input type="number" id="ribbon-grid-size" style="width: 40px; font-size: 11px; margin-left: 4px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: var(--radius-sm);" step="1" min="1" value="${initialGrid}" />
      </div>
      <div class="ribbon-item toggle" id="ribbon-ortho">ORTHO</div>
      <div class="ribbon-item toggle" id="ribbon-xyz">XYZ</div>
      <div class="ribbon-item toggle" id="ribbon-mode">2D/3D</div>
      <div class="ribbon-item toggle" id="ribbon-axis">AXIS</div>
    `;

    this.snapEl = this.content.querySelector('#ribbon-snap')!;
    this.gridEl = this.content.querySelector('#ribbon-grid')!;
    this.orthoEl = this.content.querySelector('#ribbon-ortho')!;
    this.xyzEl = this.content.querySelector('#ribbon-xyz')!;
    this.modeEl = this.content.querySelector('#ribbon-mode')!;
    this.axisEl = this.content.querySelector('#ribbon-axis')!;
    this.snapInput = this.content.querySelector('#ribbon-snap-size')! as HTMLInputElement;
    this.gridInput = this.content.querySelector('#ribbon-grid-size')! as HTMLInputElement;

    this.snapEl.addEventListener('click', () => this.onToggle('snap'));
    this.gridEl.addEventListener('click', () => this.onToggle('grid'));
    this.orthoEl.addEventListener('click', () => this.onToggle('ortho'));
    this.xyzEl.addEventListener('click', () => this.onToggle('xyz'));
    this.modeEl.addEventListener('click', () => this.onToggle('mode'));
    this.axisEl.addEventListener('click', () => this.onToggle('axis'));

    this.snapInput.addEventListener('change', () => {
      const val = parseFloat(this.snapInput.value);
      if (!isNaN(val) && val > 0 && this.onSizeChange) {
        this.onSizeChange('snap', val);
      }
    });

    this.gridInput.addEventListener('change', () => {
      const val = parseFloat(this.gridInput.value);
      if (!isNaN(val) && val > 0 && this.onSizeChange) {
        this.onSizeChange('grid', val);
      }
    });
  }

  public updateStatus(status: DraftingStatus) {
    this.updateTag(this.snapEl, status.snap);
    this.updateTag(this.gridEl, status.grid);
    this.updateTag(this.orthoEl, status.ortho);
    this.updateTag(this.xyzEl, status.xyz);
    this.updateTag(this.modeEl, status.mode3d);
    this.updateTag(this.axisEl, status.axis);
  }

  public updateSizes(snap: number, grid: number) {
    if (this.snapInput && document.activeElement !== this.snapInput) {
      this.snapInput.value = snap.toString();
    }
    if (this.gridInput && document.activeElement !== this.gridInput) {
      this.gridInput.value = grid.toString();
    }
  }

  private updateTag(el: HTMLElement, active: boolean) {
    if (active) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
}
