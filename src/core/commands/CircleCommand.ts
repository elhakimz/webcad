import {Circle} from "../model/Circle"
import {Entity} from "../model/Entity"
import {Command, CommandResponse} from "./types"
import {IDocument, UnitsConfig} from "../model/Document"
import {FormatUtils} from "../engine/FormatUtils"

export class CircleCommand implements Command {
  step = 0
  cx = 0;
  cy = 0;
  isDiameterMode = false;

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.cx = x;
      this.cy = y;
      this.step = 1;
      this.isDiameterMode = false;
      return FormatUtils.formatPoint(x, y, units, "Center", doc?.currentElevation || 0);
    } else {
      const dist = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      const r = this.isDiameterMode ? dist / 2 : dist;
      return this.finish(r, id, units, doc);
    }
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
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
        return this.finish(this.isDiameterMode ? num / 2 : num, id, units, doc);
      }
      return this.isDiameterMode ? "Invalid diameter. Diameter:" : "Invalid radius or option. Diameter/<Radius>:";
    }
  }

  private finish(r: number, id: string, units: UnitsConfig, doc?: IDocument) {
    const echo = this.isDiameterMode ? FormatUtils.formatDiameter(r * 2, units) : FormatUtils.formatRadius(r, units);
    const circle = new Circle(id, this.cx, this.cy, r, doc?.currentElevation || 0, doc?.currentThickness || 0);
    this.step = 0;
    this.isDiameterMode = false;
    (circle as Entity)._echo = echo;
    return circle;
  }

  getPreview(x: number, y: number, _units: UnitsConfig) {
    if (this.step >= 1) {
      const dist = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      const r = (this.step === 2 || this.isDiameterMode) ? dist / 2 : dist;
      return new Circle("PREVIEW", this.cx, this.cy, r);
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step >= 1) {
      const dx = x - this.cx;
      const dy = y - this.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const isDiameter = this.step === 2 || this.isDiameterMode;
      const prefix = isDiameter ? "D:" : "R:";
      const valStr = `${prefix}(${FormatUtils.formatValue(dist, units)})`;
      const angleStr = angle.toFixed(1);

      return [valStr, angleStr];
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
