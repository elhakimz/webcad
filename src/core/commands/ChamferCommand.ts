import { Command, CommandAction, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class ChamferCommand implements Command {
  step = 0 // 0: Ask Dist, 1: Select Obj1, 2: Select Obj2
  static lastDist1 = 2.0;
  static lastDist2 = 2.0;
  dist1 = ChamferCommand.lastDist1;
  dist2 = ChamferCommand.lastDist2;
  id1: string | null = null;
  id2: string | null = null;
  pick1: { x: number, y: number } | null = null;
  pick2: { x: number, y: number } | null = null;

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
      const val = text.trim();

      // If at step 0 and input is a number, update distances and move to step 1
      if (this.step === 0 && val !== "" && !isNaN(parseFloat(val))) {
          const d = parseFloat(val);
          this.dist1 = d;
          this.dist2 = d;
          ChamferCommand.lastDist1 = d;
          ChamferCommand.lastDist2 = d;
          this.step = 1;
          return this.getPrompt();
      }

      // Handle entity selection
      if (this.step === 0 || this.step === 1) {
          this.id1 = text;
          if (pickPt) this.pick1 = pickPt;
          this.step = 2;
          return this.getPrompt();
      }
      if (this.step === 2) {
          this.id2 = text;
          if (pickPt) this.pick2 = pickPt;
          return { action: "chamfer", id1: this.id1, id2: this.id2, dist1: this.dist1, dist2: this.dist2, pick1: this.pick1, pick2: this.pick2 } as CommandAction;
      }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
      if (this.step === 0 || this.step === 1) {
          this.pick1 = { x, y };
          this.step = 2;
      } else if (this.step === 2) {
          this.pick2 = { x, y };
      }
      return this.getPrompt();
  }

  getDynamicInput(_x: number, _y: number, _units: UnitsConfig): string[] | undefined {
    if (this.step === 0) {
      return [`CHAMFER: Enter distance <${this.dist1.toFixed(2)}> (enter value)`];
    }
    return undefined;
  }

  getPrompt() {
    if (this.step === 0) return `CHAMFER: Enter distance <${this.dist1.toFixed(2)}> or select first object:`;
    if (this.step === 1) return `Distance set to ${this.dist1.toFixed(2)}. Select first object:`;
    return "Select second object:";
  }
}