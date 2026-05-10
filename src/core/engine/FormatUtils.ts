import { UnitsConfig } from "../model/Document";

export class FormatUtils {
  static formatValue(val: number, units: UnitsConfig): string {
    if (units.type === 'architectural') {
      const inches = val / 25.4; // Convert mm to inches
      const absVal = Math.abs(inches);
      const feet = Math.floor(absVal / 12);
      const remInches = absVal % 12;
      const sign = inches < 0 ? "-" : "";
      return `${sign}${feet}' ${remInches.toFixed(units.precision)}"`;
    }
    if (units.type === 'metric') {
      return `${val.toFixed(units.precision)} mm`;
    }
    return val.toFixed(units.precision);
  }

  static formatPoint(x: number, y: number, units: UnitsConfig, label: string = "P", z: number = 0): string {
    return `${label}[X:${this.formatValue(x, units)}, Y:${this.formatValue(y, units)}, Z:${this.formatValue(z, units)}]`;
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
