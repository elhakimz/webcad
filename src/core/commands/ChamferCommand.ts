import { Command, CommandAction } from "./types"
import { UnitsConfig } from "../model/Document"

export class ChamferCommand implements Command {
  step = 0
  static lastDist1 = 0
  static lastDist2 = 0
  dist1 = ChamferCommand.lastDist1
  dist2 = ChamferCommand.lastDist2
  id1: string | null = null
  id2: string | null = null
  pick1: { x: number, y: number } | null = null
  pick2: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
      const val = text.trim().toUpperCase();
      if (val === "D" || val === "DISTANCE") {
          this.step = 20;
          return `Enter first chamfer distance <${this.dist1.toFixed(2)}>:`;
      }

      if (this.step === 20) {
          const d = parseFloat(val);
          this.dist1 = isNaN(d) ? ChamferCommand.lastDist1 : d;
          ChamferCommand.lastDist1 = this.dist1;
          this.step = 21;
          return `Enter second chamfer distance <${this.dist2.toFixed(2)}>:`;
      }

      if (this.step === 21) {
          const d = parseFloat(val);
          this.dist2 = isNaN(d) ? ChamferCommand.lastDist2 : d;
          ChamferCommand.lastDist2 = this.dist2;
          this.step = 0;
          return "Select first line:";
      }

      if (this.step === 0) {
          this.id1 = text;
          if (pickPt) this.pick1 = pickPt;
          this.step = 1;
          return "Select second line:";
      }
      if (this.step === 1) {
          this.id2 = text;
          if (pickPt) this.pick2 = pickPt;
          return { action: "chamfer", id1: this.id1, id2: this.id2, dist1: this.dist1, dist2: this.dist2, pick1: this.pick1, pick2: this.pick2 } as CommandAction;
      }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
      if (this.step === 0) {
          this.pick1 = { x, y };
          this.step = 1;
          return "Select second line:";
      }
      if (this.step === 1) {
          this.pick2 = { x, y };
          return "Select second line:";
      }
      return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 20) return `Enter first chamfer distance <${this.dist1.toFixed(2)}>:`;
    if (this.step === 21) return `Enter second chamfer distance <${this.dist2.toFixed(2)}>:`;
    if (this.step === 0) return `CHAMFER (Dist1=${this.dist1.toFixed(2)}, Dist2=${this.dist2.toFixed(2)}) Select first line (or Distance):`;
    return "Select second line:";
  }
}