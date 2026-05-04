import { Polyline, PolylineVertex } from "../model/Polyline"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class PolylineCommand implements Command {
  vertices: PolylineVertex[] = []
  mode: 'line' | 'arc' = 'line'
  drawnEntityId: string | null = null

  onPoint(x: number, y: number): CommandResponse {
    const isFirst = this.vertices.length === 0;
    this.vertices.push({ x, y, bulge: 0 });
    
    const pLabel = "P" + this.vertices.length;
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (isFirst) {
      this.drawnEntityId = "PL" + (++idCounter);
      return `${echo}\nArc/Close/Halfwidth/Length/Undo/Width/<Endpoint of line>:`;
    } else {
      const pline = new Polyline(this.drawnEntityId!, [...this.vertices], false);
      return pline;
    }
  }

  onInput(text: string) {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (val === "C" || val === "CLOSE") {
      if (this.vertices.length >= 3) {
        const pline = new Polyline(this.drawnEntityId!, [...this.vertices], true);
        return { action: "close", entity: pline };
      }
      return "Requires at least 3 points to close. <Endpoint of line>:";
    }

    if (val === "U" || val === "UNDO") {
      if (this.vertices.length >= 2) {
        this.vertices.pop();
        // How to handle undo of the rendering?
        // App.ts handles 'undo' with an ID.
        return { action: "undo", id: this.drawnEntityId || undefined };
      }
      return "Nothing to undo. <Endpoint of line>:";
    }

    if (val === "A" || val === "ARC") {
      this.mode = 'arc';
      return "Arc mode not fully implemented yet. <Endpoint of arc>:";
    }

    if (val === "L" || val === "LINE") {
      this.mode = 'line';
      return "<Endpoint of line>:";
    }
  }

  getPreview(x: number, y: number) {
    if (this.vertices.length > 0) {
      const previewVertices = [...this.vertices, { x, y, bulge: 0 }];
      return new Polyline("PREVIEW", previewVertices, false);
    }
    return null;
  }

  getReferencePoints() {
    if (this.vertices.length > 0) {
      return [this.vertices[this.vertices.length - 1]];
    }
    return [];
  }
}
