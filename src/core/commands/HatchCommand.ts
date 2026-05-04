import { Hatch } from "../model/Hatch"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"
import { getPattern, getAllPatternNames } from "../io/Patterns"

let idCounter = 0;

export class HatchCommand implements Command {
  vertices: { x: number; y: number }[] = [];
  pattern = "ANSI31";
  scale = 1;
  angle = 0;
  step = 0;

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.vertices.push({ x, y });
      const pLabel = "P" + this.vertices.length;
      return FormatUtils.formatPoint(x, y, pLabel);
    }
    return "";
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 0) {
      if (val === "") {
        if (this.vertices.length >= 3) {
          this.step = 1;
          return `Pattern name <${this.pattern}>`;
        }
        return "Requires at least 3 points. Select next point:";
      }
    }

    if (this.step === 1) {
      const upperVal = val.toUpperCase();
      const patterns = getAllPatternNames().join(", ");

      if (val === "" || getPattern(upperVal) || getPattern(val)) {
        this.pattern = val || "ANSI31";
        this.step = 2;
        return `Pattern scale <${this.scale.toFixed(1)}>:`;
      }
      return `Pattern name <ANSI31> (${patterns}):`;
    }

    if (this.step === 2) {
      const parsed = parseFloat(text);
      if (!isNaN(parsed) && parsed > 0) {
        this.scale = parsed;
      }
      this.step = 3;
      return `Pattern angle <${this.angle.toFixed(0)}>:`;
    }

    if (this.step === 3) {
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) {
        this.angle = parsed;
      }

      const hatch = new Hatch("H" + (++idCounter), [...this.vertices], this.pattern, this.scale, this.angle);

      this.vertices = [];
      this.step = 0;

      return { action: "close", entity: hatch };
    }

    const upperVal = val.toUpperCase();
    if (upperVal === "E" || upperVal === "EXIT" || upperVal === "QUIT") {
      if (this.vertices.length >= 3) {
        const hatch = new Hatch("H" + (++idCounter), [...this.vertices], this.pattern, this.scale, this.angle);
        this.vertices = [];
        this.step = 0;
        return { action: "close", entity: hatch };
      }
      return { action: "finish" };
    }
  }

  getPrompt() {
    const patterns = getAllPatternNames().join(", ");
    if (this.step === 0) return "Select boundary point:";
    if (this.step === 1) return `Pattern name <ANSI31> (${patterns}):`;
    if (this.step === 2) return `Pattern scale <${this.scale.toFixed(1)}>:`;
    return `Pattern angle <${this.angle.toFixed(0)}>:`;
  }
}