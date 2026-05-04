import { Trace } from "../model/Trace"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class TraceCommand implements Command {
  width = 0.1;
  points: { x: number; y: number }[] = [];
  step = 0;

  onPoint(x: number, y: number): CommandResponse {
    const pLabel = "P" + (this.points.length + 1);
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (this.step === 1) {
      this.points.push({ x, y });
      this.step = 2;
      return `${echo}\nTo point:`;
    } else if (this.step === 2) {
      const from = this.points[this.points.length - 1];
      const trace = new Trace("T" + (++idCounter), from.x, from.y, x, y, this.width);
      
      // Continue chain: set new from point
      this.points.push({ x, y });
      
      return trace;
    }
    return "";
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      // Setting width
      const parsed = parseFloat(text);
      if (!isNaN(parsed) && parsed > 0) {
        this.width = parsed;
      }
      this.step = 1;
      return "From point:";
    }

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (val === "U" || val === "UNDO") {
      if (this.points.length >= 2) {
        this.points.pop();
        const lastId = "T" + idCounter;
        return { action: "undo", id: lastId };
      }
      return "Nothing to undo. To point:";
    }
  }

  getPreview(x: number, y: number) {
    if (this.step === 2 && this.points.length >= 1) {
      const from = this.points[this.points.length - 1];
      return new Trace("PREVIEW", from.x, from.y, x, y, this.width);
    }
    return null;
  }

  getReferencePoints() {
    if (this.points.length > 0) {
      return [this.points[this.points.length - 1]];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return `TRACE line width <${this.width.toFixed(2)}>:`;
    if (this.step === 1) return "From point:";
    return "To point:";
  }
}