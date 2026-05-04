import { Arc } from "../model/Arc";
import { Command, CommandResponse } from "./types";
import { calculateArcFrom3Points, Point } from "../engine/MathUtils";
import { FormatUtils } from "../engine/FormatUtils";

let idCounter = 0;

export class ArcCommand implements Command {
  step = 0;
  p1: Point | null = null;
  p2: Point | null = null;

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      const echo = FormatUtils.formatPoint(x, y, "P1");
      return `${echo}\nSecond point:`;
    } else if (this.step === 1) {
      this.p2 = { x, y };
      this.step = 2;
      const echo = FormatUtils.formatPoint(x, y, "P2");
      return `${echo}\nEnd point:`;
    } else {
      const p3 = { x, y };
      const echo = FormatUtils.formatPoint(x, y, "P3");
      const params = calculateArcFrom3Points(this.p1!, this.p2!, p3);
      if (!params) {
        this.step = 0;
        this.p1 = null;
        this.p2 = null;
        return "Points are collinear. Start point of arc:";
      }
      const arc = new Arc(
        "A" + (++idCounter),
        params.cx, params.cy, params.r,
        params.startAngle, params.endAngle, params.ccw
      );
      (arc as any)._echo = `${echo}\nArc created. ${FormatUtils.formatRadius(params.r)}`;
      this.step = 0;
      this.p1 = null;
      this.p2 = null;
      return arc;
    }
  }

  onInput(text: string): CommandResponse | undefined {
    if (text.trim().toUpperCase() === "CANCEL" || text.trim().toUpperCase() === "") {
      return { action: "finish" };
    }
  }

  getPreview(x: number, y: number): Arc | null {
    if (this.step === 2 && this.p1 && this.p2) {
      const params = calculateArcFrom3Points(this.p1, this.p2, { x, y });
      if (params) {
        return new Arc(
          "PREVIEW",
          params.cx, params.cy, params.r,
          params.startAngle, params.endAngle, params.ccw
        );
      }
    }
    return null;
  }

  getReferencePoints() {
    const pts = [];
    if (this.p1) pts.push(this.p1);
    if (this.p2) pts.push(this.p2);
    return pts;
  }

  getPrompt() {
    if (this.step === 0) return "ARC specify start point:";
    if (this.step === 1) return "Second point:";
    return "End point:";
  }
}
