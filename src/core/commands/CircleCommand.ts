import { Circle } from "../model/Circle"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class CircleCommand implements Command {
  step = 0
  cx = 0;
  cy = 0;
  isDiameterMode = false;

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.cx = x;
      this.cy = y;
      this.step = 1;
      this.isDiameterMode = false;
      const echo = FormatUtils.formatPoint(x, y, "Center");
      return `${echo}\nDiameter/<Radius>:`;
    } else {
      const dist = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      const r = this.isDiameterMode ? dist / 2 : dist;
      return this.finish(r);
    }
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 1 || this.step === 2) {
      if (val === "D" || val === "DIAMETER") {
        this.isDiameterMode = true;
        this.step = 2;
        return "Diameter:";
      }

      if (val === "R" || val === "RADIUS") {
        this.isDiameterMode = false;
        this.step = 1;
        return "Diameter/<Radius>:";
      }

      const num = parseFloat(text);
      if (!isNaN(num) && num > 0) {
        return this.finish(this.isDiameterMode ? num / 2 : num);
      }
      return this.isDiameterMode ? "Invalid diameter. Diameter:" : "Invalid radius or option. Diameter/<Radius>:";
    }
  }

  private finish(r: number) {
    const echo = this.isDiameterMode ? FormatUtils.formatDiameter(r * 2) : FormatUtils.formatRadius(r);
    const circle = new Circle("C" + (++idCounter), this.cx, this.cy, r);
    this.step = 0;
    this.isDiameterMode = false;
    (circle as unknown as { _echo: string })._echo = echo;
    return circle;
  }

  getPreview(x: number, y: number) {
    if (this.step >= 1) {
      const dist = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      const r = (this.step === 2 || this.isDiameterMode) ? dist / 2 : dist;
      return new Circle("PREVIEW", this.cx, this.cy, r);
    }
    return null;
  }

  getReferencePoints() {
    if (this.step >= 1) {
      return [{ x: this.cx, y: this.cy }];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return "CIRCLE specify center point:";
    if (this.step === 2 || this.isDiameterMode) return "Diameter:";
    return "Diameter/<Radius>:";
  }
}
