import { Line } from "../model/Line"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class LineCommand implements Command {
  points: { x: number; y: number }[] = []
  drawnEntityIds: string[] = []

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    this.points.push({ x, y });
    const pLabel = "P" + this.points.length;
    const echo = FormatUtils.formatPoint(x, y, units, pLabel, doc?.currentElevation || 0);

    if (this.points.length === 1) {
      return echo;
    } else {
      const last = this.points[this.points.length - 2];
      const line = new Line(id, last.x, last.y, x, y, doc?.currentElevation || 0, doc?.currentThickness || 0);
      this.drawnEntityIds.push(line.id);
      return line;
    }
  }

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (val === "C" || val === "CLOSE") {
      if (this.points.length >= 3) {
        const first = this.points[0];
        const last = this.points[this.points.length - 1];
        const line = new Line(id, last.x, last.y, first.x, first.y);
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

  getPreview(x: number, y: number, _units: UnitsConfig) {
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      return new Line("PREVIEW", last.x, last.y, x, y);
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;

      const distStr = `D:${FormatUtils.formatValue(dist, units)}`;
      
      let angleStr = `A:${angle.toFixed(1)}`;
      if (this.points.length >= 2) {
          const prev = this.points[this.points.length - 2];
          const a1 = Math.atan2(prev.y - last.y, prev.x - last.x) * 180 / Math.PI;
          const a2 = Math.atan2(y - last.y, x - last.x) * 180 / Math.PI;
          let diff = Math.abs(a2 - a1);
          if (diff > 180) diff = 360 - diff;
          angleStr = `A:${diff.toFixed(1)} (rel)`;
      }

      return [distStr, angleStr];
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
