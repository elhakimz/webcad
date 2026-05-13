import { Arc } from "../model/Arc"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class ArcCommand implements Command {
  step = 0
  p1 = { x: 0, y: 0 }
  p2 = { x: 0, y: 0 }
  p3 = { x: 0, y: 0 }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y }
      this.step = 1
      return FormatUtils.formatPoint(x, y, units, "P1", doc?.currentElevation || 0)
    } else if (this.step === 1) {
      this.p2 = { x, y }
      this.step = 2
      return FormatUtils.formatPoint(x, y, units, "P2", doc?.currentElevation || 0)
    } else {
      this.p3 = { x, y }
      const arc = this.calculateArc(this.p1, this.p2, this.p3, id, units, doc)
      if (!arc) {
          this.step = 0;
          return "Points are collinear. Start point of arc:";
      }
      this.step = 0
      return arc
    }
  }

  private calculateArc(p1: { x: number, y: number }, p2: { x: number, y: number }, p3: { x: number, y: number }, id: string, units: UnitsConfig, doc?: IDocument): Arc | null {
    // Standard 3-point arc calculation
    const x1 = p1.x, y1 = p1.y
    const x2 = p2.x, y2 = p2.y
    const x3 = p3.x, y3 = p3.y

    const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if (Math.abs(D) < 1e-6) return null

    const cx = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / D
    const cy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / D
    const r = Math.sqrt((x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy))

    const startAngle = Math.atan2(y1 - cy, x1 - cx)
    const endAngle = Math.atan2(y3 - cy, x3 - cx)

    // Determine direction (CCW or CW)
    const cross = (x2 - x1) * (y3 - y2) - (y2 - y1) * (x3 - x2)
    const ccw = cross > 0

    const arc = new Arc(id, cx, cy, r, startAngle, endAngle, ccw, doc?.currentElevation || 0, doc?.currentThickness || 0)
    const echo = `Arc created. ${FormatUtils.formatRadius(r, units)}`
    ;(arc as unknown as { _echo: string })._echo = echo
    return arc
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    if (this.step === 2) {
      const arc = this.calculateArc(this.p1, this.p2, { x, y }, "PREVIEW", units)
      return arc
    }
    return null
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1) {
      const dx = x - this.p1.x;
      const dy = y - this.p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const distStr = `D:${FormatUtils.formatValue(dist, units)}`;
      const angleStr = `A:${angle.toFixed(1)}`;

      return [distStr, angleStr];
    } else if (this.step === 2) {
      const arc = this.calculateArc(this.p1, this.p2, { x, y }, "PREVIEW", units);
      if (arc) {
        const dx = x - arc.cx;
        const dy = y - arc.cy;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle < 0) angle += 360;

        const distStr = `D:${FormatUtils.formatValue(arc.r, units)}`;
        const angleStr = `A:${angle.toFixed(1)}`;

        return [distStr, angleStr];
      }
    }
    return null;
  }

  getReferencePoints() {
    if (this.step === 1) return [this.p1]
    if (this.step === 2) return [this.p1, this.p2]
    return []
  }

  getPrompt() {
    if (this.step === 0) return "ARC specify start point:";
    if (this.step === 1) return "Second point:";
    return "End point:";
  }
}
