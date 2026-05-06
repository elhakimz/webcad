import { Trace } from "../model/Trace"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class TraceCommand implements Command {
  step = 0
  width = 0.1
  points: { x: number; y: number }[] = []
  drawnEntityId: string | null = null

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      // Allow point input if width is already set or default
      this.step = 1;
    }

    this.points.push({ x, y });
    const pLabel = "P" + this.points.length;
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (this.points.length === 1) {
      this.drawnEntityId = id;
      return echo;
    } else {
      const last = this.points[this.points.length - 2];
      const trace = new Trace(id, last.x, last.y, x, y, this.width);
      return trace;
    }
  }

  onInput(text: string, id: string) {
    const val = text.trim().toUpperCase();
    if (this.step === 0) {
      const n = parseFloat(text);
      if (!isNaN(n) && n > 0) {
        this.width = n;
        this.step = 1;
        return "From point:";
      }
      if (text === "") {
        this.step = 1;
        return "From point:";
      }
    }

    if (val === "U" || val === "UNDO") {
        if (this.points.length >= 1) {
            this.points.pop();
            return { action: "undo", id: this.drawnEntityId || undefined };
        }
    }

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }
  }

  getPreview(x: number, y: number) {
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      return new Trace("PREVIEW", last.x, last.y, x, y, this.width);
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
    if (this.step === 0) return "TRACE line width <0.10>:";
    if (this.points.length === 0) return "From point:";
    return "To point:";
  }
}
