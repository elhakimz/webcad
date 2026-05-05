
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
    if (this.points.length === 2) {
        // Triangle preview
        return new Solid("PREVIEW", [this.points[0], this.points[1], {x, y}]);
    }
    if (this.points.length === 3) {
        // Quad preview (P1, P2, P4=current, P3)
        return new Solid("PREVIEW", [this.points[0], this.points[1], {x, y}, this.points[2]]);
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
}
