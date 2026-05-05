import { Polyline, PolylineVertex } from "../model/Polyline"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class PolylineCommand implements Command {
  vertices: PolylineVertex[] = []
  mode: 'line' | 'arc' = 'line'
  drawnEntityId: string | null = null
  lastTangentAngle: number | null = null

  onPoint(x: number, y: number): CommandResponse {
    const isFirst = this.vertices.length === 0;
    
    if (isFirst) {
      this.vertices.push({ x, y, bulge: 0 });
      this.drawnEntityId = "PL" + (++idCounter);
      return FormatUtils.formatPoint(x, y, "P1");
    }

    const lastV = this.vertices[this.vertices.length - 1];
    let bulge = 0;

    const dx = x - lastV.x;
    const dy = y - lastV.y;
    const chordAngle = Math.atan2(dy, dx);

    if (this.mode === 'arc') {
      const tangent = this.lastTangentAngle ?? chordAngle;
      let alpha = chordAngle - tangent;
      while (alpha <= -Math.PI) alpha += 2 * Math.PI;
      while (alpha > Math.PI) alpha -= 2 * Math.PI;
      
      bulge = Math.tan(alpha / 2);
      this.lastTangentAngle = chordAngle + alpha;
    } else {
      this.lastTangentAngle = chordAngle;
    }

    lastV.bulge = bulge;
    this.vertices.push({ x, y, bulge: 0 });

    return new Polyline(this.drawnEntityId!, [...this.vertices], false);
  }

  getPrompt() {
    if (this.vertices.length === 0) return "PLINE specify start point:";
    if (this.mode === 'arc') {
      return "Angle/CEnter/CLose/Direction/Halfwidth/Line/Radius/Second pt/Undo/Width/<Endpoint of arc>:";
    }
    return "Arc/Close/Halfwidth/Length/Undo/Width/<Endpoint of line>:";
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
      return "Requires at least 3 points to close.";
    }

    if (val === "U" || val === "UNDO") {
      if (this.vertices.length >= 2) {
        this.vertices.pop();
        // Reset bulge of the new last vertex
        if (this.vertices.length > 0) {
          this.vertices[this.vertices.length - 1].bulge = 0;
        }
        
        // Recalculate lastTangentAngle if possible
        if (this.vertices.length >= 2) {
            const v1 = this.vertices[this.vertices.length - 2];
            const v2 = this.vertices[this.vertices.length - 1];
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            const chordAngle = Math.atan2(dy, dx);
            if (v1.bulge !== 0) {
                const alpha = 2 * Math.atan(v1.bulge);
                this.lastTangentAngle = chordAngle + alpha;
            } else {
                this.lastTangentAngle = chordAngle;
            }
        } else {
            this.lastTangentAngle = null;
        }

        return { action: "undo", id: this.drawnEntityId || undefined };
      }
      return "Nothing to undo.";
    }

    if (val === "A" || val === "ARC") {
      this.mode = 'arc';
      return "Switched to Arc mode.";
    }

    if (val === "L" || val === "LINE") {
      this.mode = 'line';
      return "Switched to Line mode.";
    }
  }

  getPreview(x: number, y: number) {
    if (this.vertices.length > 0) {
      const lastV = this.vertices[this.vertices.length - 1];
      let bulge = 0;

      const dx = x - lastV.x;
      const dy = y - lastV.y;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;

      const chordAngle = Math.atan2(dy, dx);

      if (this.mode === 'arc') {
        const tangent = this.lastTangentAngle ?? chordAngle;
        let alpha = chordAngle - tangent;
        while (alpha <= -Math.PI) alpha += 2 * Math.PI;
        while (alpha > Math.PI) alpha -= 2 * Math.PI;
        bulge = Math.tan(alpha / 2);
      }
      
      const previewVertices = this.vertices.map((v, i) => {
        if (i === this.vertices.length - 1) {
            return { ...v, bulge };
        }
        return { ...v };
      });
      previewVertices.push({ x, y, bulge: 0 });
      
      const allPoints = [...previewVertices.map(v => ({ x: v.x, y: v.y })), { x, y }];
      return { type: 'plinepoints', id: 'pline-points', points: allPoints } as any;
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
