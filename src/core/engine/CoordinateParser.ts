import { UnitsConfig } from "../model/Document";

export class CoordinateParser {
  /**
   * Parses a coordinate string.
   * Formats:
   * - Absolute: "x,y"
   * - Relative Cartesian: "@dx,dy"
   * - Relative Polar: "@dist<angle"
   */
  static parseCoordinate(text: string, units: UnitsConfig, lastPoint?: { x: number; y: number; z?: number }, elevation = 0): { x: number; y: number; z: number } | null {
    text = text.trim();
    if (!text) return null;

    const isRelative = text.startsWith('@');
    const content = isRelative ? text.substring(1) : text;

    if (content.includes('<')) {
      // Relative Polar: @dist<angle or @dist<angle,z
      if (!isRelative || !lastPoint) return null;
      const parts = content.split('<');
      if (parts.length !== 2) return null;

      const dist = this.parseValueWithUnits(parts[0], units);
      
      const angleAndZ = parts[1].split(',');
      const angleDeg = parseFloat(angleAndZ[0]);
      const zVal = angleAndZ.length === 2 ? this.parseValueWithUnits(angleAndZ[1], units) : 0;

      if (isNaN(dist) || isNaN(angleDeg) || isNaN(zVal)) return null;

      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: lastPoint.x + dist * Math.cos(angleRad),
        y: lastPoint.y + dist * Math.sin(angleRad),
        z: (lastPoint.z || 0) + zVal,
      };
    } else if (content.includes(',')) {
      // Absolute or Relative Cartesian
      const parts = content.split(',');
      if (parts.length < 2 || parts.length > 3) return null;

      const xVal = this.parseValueWithUnits(parts[0], units);
      const yVal = this.parseValueWithUnits(parts[1], units);

      if (isRelative) {
        if (!lastPoint) return null;
        const zVal = parts.length === 3 ? this.parseValueWithUnits(parts[2], units) : 0;
        if (isNaN(xVal) || isNaN(yVal) || isNaN(zVal)) return null;
        return {
          x: lastPoint.x + xVal,
          y: lastPoint.y + yVal,
          z: (lastPoint.z || 0) + zVal,
        };
      } else {
        const zVal = parts.length === 3 ? this.parseValueWithUnits(parts[2], units) : elevation;
        if (isNaN(xVal) || isNaN(yVal) || isNaN(zVal)) return null;
        return { x: xVal, y: yVal, z: zVal };
      }
    }

    return null;
  }

  private static parseValueWithUnits(text: string, units: UnitsConfig): number {
    text = text.trim();
    if (!text) return NaN;

    // Extract numeric part and suffix
    const match = text.match(/^([+-]?\d*\.?\d+)(.*)$/);
    if (!match) return NaN;

    const val = parseFloat(match[1]);
    const suffix = match[2].trim().toLowerCase();

    if (!suffix) return val; // No suffix

    if (units.type === 'metric') {
      if (suffix === 'mm') return val;
      if (suffix === 'cm') return val * 10;
      if (suffix === 'm') return val * 1000;
    } else if (units.type === 'architectural') {
      if (suffix === "'" || suffix === "ft") return val * 12;
      if (suffix === '"' || suffix === "in") return val;
    }

    // If suffix is not recognized for the current unit type, ignore it or fallback
    return val;
  }
}
