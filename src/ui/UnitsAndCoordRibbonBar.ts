import { RibbonBar } from "./RibbonBar";
import { UnitsConfig } from "../core/model/Document";
import { FormatUtils } from "../core/engine/FormatUtils";

export class UnitsAndCoordRibbonBar extends RibbonBar {
  private coordsEl: HTMLElement;
  private unitsEl: HTMLSelectElement;

  constructor(
    private onUnitsChange?: (units: 'decimal' | 'architectural' | 'metric') => void,
    private onResetElev?: () => void
  ) {
    super("Units & Coords");

    this.content.innerHTML = `
      <div class="ribbon-item" style="white-space: nowrap;">
        <span id="ribbon-coords">X:0.0000, Y:0.0000, Z:0.0000, E:0.0000</span>
        <span style="margin-left: 10px;">Units:</span>
        <select id="ribbon-units" style="font-size: 11px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <option value="decimal">Decimal</option>
          <option value="architectural">Architectural</option>
          <option value="metric">Metric</option>
        </select>
        <button id="ribbon-reset-elev" style="margin-left: 5px; font-size: 11px; padding: 1px 5px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer;">[E:0]</button>
      </div>
    `;

    this.coordsEl = this.content.querySelector('#ribbon-coords')!;
    this.unitsEl = this.content.querySelector('#ribbon-units')! as HTMLSelectElement;

    this.unitsEl.addEventListener('change', () => {
      if (this.onUnitsChange) {
        this.onUnitsChange(this.unitsEl.value as 'decimal' | 'architectural' | 'metric');
      }
    });

    const resetBtn = this.content.querySelector('#ribbon-reset-elev')!;
    resetBtn.addEventListener('click', () => {
      if (this.onResetElev) {
        this.onResetElev();
      }
    });
  }

  public updateCoordinates(x: number, y: number, units: UnitsConfig, z: number = 0, e: number = 0) {
    this.coordsEl.textContent = `X:${FormatUtils.formatValue(x, units)}, Y:${FormatUtils.formatValue(y, units)}, Z:${FormatUtils.formatValue(z, units)}, E:${FormatUtils.formatValue(e, units)}`;
  }

  public updateUnits(units: UnitsConfig) {
    this.unitsEl.value = units.type;
  }
}
