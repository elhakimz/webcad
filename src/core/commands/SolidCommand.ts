
import { Solid } from "../model/Solid"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class SolidCommand implements Command {
  points: { x: number; y: number }[] = []
  step = 0

  onPoint(x: number, y: number): CommandResponse {
    this.points.push({ x, y });
    const pLabel = "P" + this.points.length;
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (this.points.length === 1) {
      this.step = 1;
      return `${echo}\nSecond point:`;
    } else if (this.points.length === 2) {
      this.step = 2;
      return `${echo}\nThird point:`;
    } else if (this.points.length === 3) {
      this.step = 3;
      return `${echo}\nFourth point:`;
    } else {
      // 4 points reached
      const p1 = this.points[0];
      const p2 = this.points[1];
      const p3 = this.points[2];
      const p4 = this.points[3];
      
      const solid = new Solid("S" + (++idCounter), [p1, p2, p4, p3]);
      
      // WebCAD chaining: new P1=P3, new P2=P4
      this.points = [p3, p4];
      this.step = 2;
      
      return solid;
    }
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "C" || val === "CLOSE") {
      if (this.points.length === 3) {
        // Triangle case: P1, P2, P3
        const p1 = this.points[0];
        const p2 = this.points[1];
        const p3 = this.points[2];
        const solid = new Solid("S" + (++idCounter), [p1, p2, p3]);
        this.points = [];
        this.step = 0;
        return { action: "close", entity: solid };
      } else if (this.points.length >= 2) {
        // Close with available points
        const p1 = this.points[0];
        const p2 = this.points[1];
        const solid = new Solid("S" + (++idCounter), [p1, p2]);
        this.points = [];
        this.step = 0;
        return { action: "close", entity: solid };
      }
      return "Not enough points to close.";
    }
    if (val === "U" || val === "UNDO") {
      if (this.points.length > 0) {
        this.points.pop();
        if (this.points.length === 0) {
          this.step = 0;
          return "SOLID started.";
        }
        if (this.points.length === 1) {
          this.step = 1;
          return "Second point:";
        }
        if (this.points.length === 2) {
          this.step = 2;
          return "Third point:";
        }
        if (this.points.length === 3) {
          this.step = 3;
          return "Fourth point:";
        }
      }
      return "Nothing to undo.";
    }
    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
        if (this.points.length === 3) {
            // Triangle case: P1, P2, P3
            const p1 = this.points[0];
            const p2 = this.points[1];
            const p3 = this.points[2];
            const solid = new Solid("S" + (++idCounter), [p1, p2, p3]);
            this.points = [];
            this.step = 0;
            return { action: "close", entity: solid };
        }
        return { action: "finish" };
    }
    return undefined;
  }

  getPreview(x: number, y: number) {
    const allPoints = [...this.points.map(p => ({ x: p.x, y: p.y }))];
    if (this.points.length >= 1 && this.points.length <= 3) {
      allPoints.push({ x, y });
      return { type: 'solidpoints', id: 'solid-points', points: allPoints } as any;
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
    if (this.step === 0) return "SOLID First point:";
    if (this.step === 1) return "Second point:";
    if (this.step === 2) return "Third point:";
    if (this.step === 3) return "Fourth point:";
    return "Third point:";
  }

  getCommandOptions() {
    return ["Close"];
  }
}
