import { Line } from "../model/Line"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class LineCommand implements Command {
  points: { x: number; y: number }[] = []
  drawnEntityIds: string[] = []

  onPoint(x: number, y: number): CommandResponse {
    this.points.push({ x, y });
    const pLabel = "P" + this.points.length;
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (this.points.length === 1) {
      return `${echo}\nTo point:`;
    } else {
      const last = this.points[this.points.length - 2];
      const line = new Line("L" + (++idCounter), last.x, last.y, x, y);
      this.drawnEntityIds.push(line.id);
      return line;
    }
  }

  onInput(text: string) {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (val === "C" || val === "CLOSE") {
      if (this.points.length >= 3) {
        const first = this.points[0];
        const last = this.points[this.points.length - 1];
        const line = new Line("L" + (++idCounter), last.x, last.y, first.x, first.y);
        return { action: "close", entity: line };
      }
      return "Requires at least 3 points to close. To point:";
    }

    if (val === "U" || val === "UNDO") {
      if (this.points.length >= 2) {
        this.points.pop();
        const lastId = this.drawnEntityIds.pop();
        return { action: "undo", id: lastId };
      }
      return "Nothing to undo. To point:";
    }
  }

  getPreview(x: number, y: number) {
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      return new Line("PREVIEW", last.x, last.y, x, y);
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
    if (this.points.length === 0) return "LINE specify first point:";
    return "To point:";
  }
}
