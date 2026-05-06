import { UnitsConfig } from "../model/Document";

export class FormatUtils {
  static formatValue(val: number, units: UnitsConfig): string {
    if (units.type === 'architectural') {
      const feet = Math.floor(val / 12);
      const inches = Math.abs(val % 12);
      const sign = val < 0 ? "-" : "";
      return `${sign}${feet}' ${inches.toFixed(units.precision)}"`;
    }
    return val.toFixed(units.precision);
  }

  static formatPoint(x: number, y: number, units: UnitsConfig, label: string = "P"): string {
    return `${label}[X:${this.formatValue(x, units)}, Y:${this.formatValue(y, units)}, Z:0.00]`;
  }

  static formatRadius(r: number, units: UnitsConfig): string {
    return `[R:${this.formatValue(r, units)}]`;
  }

  static formatDiameter(d: number, units: UnitsConfig): string {
    return `[D:${this.formatValue(d, units)}]`;
  }

  static formatDistance(d: number, units: UnitsConfig): string {
    return `Distance: ${this.formatValue(d, units)}`;
  }

  static formatAngle(angleRad: number, precision: number = 1): string {
    const deg = (angleRad * 180 / Math.PI);
    return `[Angle:${deg.toFixed(precision)}°]`;
  }
}
