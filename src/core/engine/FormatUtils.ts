export class FormatUtils {
  static formatPoint(x: number, y: number, label: string = "P"): string {
    return `${label}[X:${x.toFixed(2)}, Y:${y.toFixed(2)}, Z:0.00]`;
  }

  static formatRadius(r: number): string {
    return `[R:${r.toFixed(2)}]`;
  }

  static formatDiameter(d: number): string {
    return `[D:${d.toFixed(2)}]`;
  }

  static formatDistance(d: number): string {
    return `Distance: ${d.toFixed(2)}`;
  }
}
