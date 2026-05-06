import { Hatch } from "../model/Hatch"
import { Command, CommandResponse, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { getAllPatternNames } from "../io/Patterns"

export class HatchCommand implements Command {
  step = 0
  pattern = "ANSI31"
  scale = 1.0
  angle = 0.0
  vertices: { x: number, y: number }[] = []

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    console.log(`[HatchCommand] onInput: val="${val}", step=${this.step}`);

    if (this.step === 0) {
      if (val === "P" || val === "PATTERN") {
        this.step = 1;
        return "Pattern name <ANSI31>:";
      }
      if (val === "?" || val === "HELP") {
        const names = getAllPatternNames();
        return "Available patterns:\n" + names.join(", ") + "\nHatch [Pattern/Select objects]:";
      }

      // Check if user typed a valid pattern name directly
      const names = getAllPatternNames();
      if (names.includes(val)) {
          this.pattern = val;
          this.step = 2;
          return "Scale <1.0>:";
      }

      if (val === "") {
         return "Hatch [Pattern/Select objects]:";
      }
      this.step = 3;
      return "Select objects or pick internal point:";
    }

    if (this.step === 1) {
      if (val === "?") {
        const names = getAllPatternNames();
        return "Available patterns:\n" + names.join(", ") + "\nPattern name <ANSI31>:";
      }
      this.pattern = val === "" ? "ANSI31" : val;
      this.step = 2;
      return "Scale <1.0>:";
    }

    if (this.step === 2) {
      this.scale = val === "" ? 1.0 : parseFloat(val);
      this.step = 3;
      return "Select objects or pick internal point:";
    }
    
    if (this.step === 3 && val === "") {
        return this.finish(_id);
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 3) {
      this.vertices.push({ x, y });
      return "Pick next point (Enter to finish):";
    }
    return this.getPrompt();
  }

  getPreview(_x: number, _y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 3 && this.vertices.length > 0) {
      return { type: 'plinepoints', points: [...this.vertices] };
    }
    return null;
  }

  getReferencePoints() {
    if (this.vertices.length > 0) {
      return [this.vertices[this.vertices.length - 1]];
    }
    return [];
  }

  private finish(id: string): CommandResponse {
    if (this.vertices.length < 3) return "Hatch requires at least 3 points.";
    const hatch = new Hatch(id, this.vertices, this.pattern, this.scale, this.angle);
    this.step = 0;
    this.vertices = [];
    return hatch;
  }

  getPrompt() {
    if (this.step === 0) return "Hatch [Pattern/Select]:";
    if (this.step === 1) return "Pattern name <ANSI31>:";
    if (this.step === 2) return "Scale <1.0>:";
    if (this.step === 3) return "Pick next point (Enter to finish):";
    return "";
  }
}
