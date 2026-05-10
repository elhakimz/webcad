import { RibbonBar } from "./RibbonBar";
import { UnitsConfig } from "../core/model/Document";
import { FormatUtils } from "../core/engine/FormatUtils";

export class UnitsAndCoordRibbonBar extends RibbonBar {
  private coordsEl: HTMLElement;
  private unitsEl: HTMLSelectElement;

  constructor(private onUnitsChange?: (units: 'decimal' | 'architectural' | 'metric') => void) {
    super("Units & Coords");

    this.content.innerHTML = `
      <div class="ribbon-item" style="white-space: nowrap;">
        <span class="ribbon-label">Coords:</span>
        <span class="ribbon-value" id="ribbon-coords">0.0000, 0.0000</span>
      </div>
      <div class="ribbon-item" style="white-space: nowrap;">
        <span class="ribbon-label">Units:</span>
        <select id="ribbon-units" style="font-size: 11px; background: var(--bg-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <option value="decimal">Decimal</option>
          <option value="architectural">Architectural</option>
          <option value="metric">Metric</option>
        </select>
      </div>
    `;

    this.coordsEl = this.content.querySelector('#ribbon-coords')!;
    this.unitsEl = this.content.querySelector('#ribbon-units')! as HTMLSelectElement;

    this.unitsEl.addEventListener('change', () => {
      if (this.onUnitsChange) {
        this.onUnitsChange(this.unitsEl.value as 'decimal' | 'architectural' | 'metric');
      }
    });
  }

  public updateCoordinates(x: number, y: number, units: UnitsConfig, z: number = 0) {
    this.coordsEl.textContent = `${FormatUtils.formatValue(x, units)}, ${FormatUtils.formatValue(y, units)}, ${FormatUtils.formatValue(z, units)}`;
  }

  public updateUnits(units: UnitsConfig) {
    this.unitsEl.value = units.type;
  }
}
