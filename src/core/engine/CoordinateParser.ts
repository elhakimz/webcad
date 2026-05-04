export class CoordinateParser {
  /**
   * Parses a coordinate string.
   * Formats:
   * - Absolute: "x,y"
   * - Relative Cartesian: "@dx,dy"
   * - Relative Polar: "@dist<angle"
   */
  static parseCoordinate(text: string, lastPoint?: { x: number; y: number }): { x: number; y: number } | null {
    text = text.trim();
    if (!text) return null;

    const isRelative = text.startsWith('@');
    const content = isRelative ? text.substring(1) : text;

    if (content.includes('<')) {
      // Relative Polar: @dist<angle
      if (!isRelative || !lastPoint) return null;
      const parts = content.split('<');
      if (parts.length !== 2) return null;

      const dist = parseFloat(parts[0]);
      const angleDeg = parseFloat(parts[1]);

      if (isNaN(dist) || isNaN(angleDeg)) return null;

      const angleRad = (angleDeg * Math.PI) / 180;
      return {
        x: lastPoint.x + dist * Math.cos(angleRad),
        y: lastPoint.y + dist * Math.sin(angleRad),
      };
    } else if (content.includes(',')) {
      // Absolute or Relative Cartesian
      const parts = content.split(',');
      if (parts.length !== 2) return null;

      const xVal = parseFloat(parts[0]);
      const yVal = parseFloat(parts[1]);

      if (isNaN(xVal) || isNaN(yVal)) return null;

      if (isRelative) {
        if (!lastPoint) return null;
        return {
          x: lastPoint.x + xVal,
          y: lastPoint.y + yVal,
        };
      } else {
        return { x: xVal, y: yVal };
      }
    }

    return null;
  }
}
