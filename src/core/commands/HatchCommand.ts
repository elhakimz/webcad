import { Hatch } from "../model/Hatch"
import { Command, CommandResponse } from "./types"
import { SelectionEngine } from "../engine/SelectionEngine"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"

export class HatchCommand implements Command {
  step = 0
  pattern = 'ANSI31'
  scale = 1.0
  angle = 0
  vertices: { x: number; y: number }[] = []
  boundaryId: string | null = null

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      // Find boundary polyline at this point
      // (This logic usually lives in App but Hatch needs it)
      // For now, let's collect vertices if the user clicks points
      this.vertices.push({ x, y });
      return `Point ${this.vertices.length} added.`;
    }
    return "Unknown state";
  }

  onInput(text: string, id: string) {
    const val = text.trim().toUpperCase();

    if (val === "" && this.step === 0 && this.vertices.length >= 3) {
      this.step = 1;
      return "Pattern name <ANSI31>:";
    }

    if (this.step === 1) {
      if (val !== "") this.pattern = val;
      this.step = 2;
      return "Scale <1.00>:";
    }

    if (this.step === 2) {
      const n = parseFloat(text);
      if (!isNaN(n)) this.scale = n;
      this.step = 3;
      return "Angle <0>:";
    }

    if (this.step === 3) {
      const n = parseFloat(text);
      if (!isNaN(n)) this.angle = n;
      return this.finish(id);
    }

    if (val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }
  }

  private finish(id: string) {
    const hatch = new Hatch(
      id,
      [...this.vertices],
      this.pattern,
      this.scale,
      this.angle
    );
    this.step = 0;
    this.vertices = [];
    const echo = `Hatch created with pattern ${this.pattern}.`;
    ;(hatch as unknown as { _echo: string })._echo = echo;
    return hatch;
  }

  getPrompt() {
    if (this.step === 0) return "HATCH: Select boundary points (Enter to finish):";
    if (this.step === 1) return "Pattern name <ANSI31>:";
    if (this.step === 2) return "Scale <1.00>:";
    return "Angle <0>:";
  }
}
