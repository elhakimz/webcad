import { Hatch } from "../model/Hatch"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class HatchCommand implements Command {
  vertices: { x: number; y: number }[] = [];
  pattern = "ANSI31";
  scale = 1;
  angle = 0;
  step = 0; // 0=selecting boundary, 1=pattern, 2=scale, 3=angle

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.vertices.push({ x, y });
      const pLabel = "P" + this.vertices.length;
      return FormatUtils.formatPoint(x, y, pLabel);
    }
    return "";
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    // Step 0: Enter to finish boundary and go to pattern
    if (this.step === 0) {
      if (val === "") {
        if (this.vertices.length >= 3) {
          this.step = 1;
          return `Pattern name <${this.pattern}>:`;
        }
        return "Requires at least 3 points. Select next point:";
      }
    }

    // Step 1: Pattern name
    if (this.step === 1) {
      if (val === "" || val === "ANSI31" || val === "ANSI32" || val === "AR-CONCRETE") {
        this.pattern = val || "ANSI31";
        this.step = 2;
        return `Pattern scale <${this.scale.toFixed(1)}>:`;
      }
      return `Pattern name <${this.pattern}>:`;
    }

    // Step 2: Pattern scale
    if (this.step === 2) {
      const parsed = parseFloat(text);
      if (!isNaN(parsed) && parsed > 0) {
        this.scale = parsed;
      }
      this.step = 3;
      return `Pattern angle <${this.angle.toFixed(0)}>:`;
    }

    // Step 3: Pattern angle - create hatch
    if (this.step === 3) {
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) {
        this.angle = parsed;
      }
      
      // Create hatch entity with boundary vertices
      const hatch = new Hatch("H" + (++idCounter), [...this.vertices], this.pattern, this.scale, this.angle);
      
      // Reset for next hatch
      this.vertices = [];
      this.step = 0;
      
      return { action: "close", entity: hatch };
    }

    // Exit commands
    if (val === "E" || val === "EXIT" || val === "QUIT") {
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
    if (this.step === 0) return "Select boundary point:";
    if (this.step === 1) return `Pattern name <${this.pattern}>:`;
    if (this.step === 2) return `Pattern scale <${this.scale.toFixed(1)}>:`;
    return `Pattern angle <${this.angle.toFixed(0)}>:`;
  }
}