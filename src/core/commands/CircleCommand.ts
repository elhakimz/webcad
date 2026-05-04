import { Circle } from "../model/Circle"
import { Command, CommandResponse } from "./types"

let idCounter = 0

export class CircleCommand implements Command {
  step = 0
  cx = 0;
  cy = 0;

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.cx = x;
      this.cy = y;
      this.step = 1;
      return "Specify radius or pick point on circumference"
    } else {
      const r = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      return this.finish(r);
    }
  }

  onInput(text: string): CommandResponse | undefined {
    if (this.step === 1) {
      const r = parseFloat(text);
      if (!isNaN(r) && r > 0) {
        return this.finish(r);
      }
      return "Invalid radius. Specify radius or pick point on circumference";
    }
  }

  private finish(r: number) {
    const circle = new Circle("C" + (++idCounter), this.cx, this.cy, r);
    this.step = 0;
    return circle;
  }

  getPreview(x: number, y: number) {
    if (this.step === 1) {
      const r = Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2));
      return new Circle("PREVIEW", this.cx, this.cy, r);
    }
    return null;
  }
}
