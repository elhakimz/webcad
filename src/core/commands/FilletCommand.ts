import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class FilletCommand implements Command {
  step = 0
  static lastRadius = 0;
  radius = FilletCommand.lastRadius;
  id1: string | null = null
  id2: string | null = null
  pick1: { x: number, y: number } | null = null
  pick2: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
      const val = text.trim().toUpperCase();
      if (val === "R" || val === "RADIUS") {
          this.step = 10;
          return `Enter fillet radius <${this.radius}>:`;
      }

      if (this.step === 10) {
          const r = parseFloat(val);
          this.radius = isNaN(r) ? FilletCommand.lastRadius : r;
          FilletCommand.lastRadius = this.radius;
          this.step = 0;
          return "Select first object:";
      }

      if (this.step === 0) {
          this.id1 = text;
          if (pickPt) this.pick1 = pickPt;
          this.step = 1;
          return "Select second object:";
      }
      if (this.step === 1) {
          this.id2 = text;
          if (pickPt) this.pick2 = pickPt;
          return { action: "fillet", id1: this.id1, id2: this.id2, radius: this.radius, pick1: this.pick1, pick2: this.pick2 } as any;
      }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
      if (this.step === 0) {
          this.pick1 = { x, y };
          this.step = 1;
          return "Select second object:";
      }
      if (this.step === 1) {
          this.pick2 = { x, y };
          // If we reach here via onPoint, we don't have entity IDs.
          // We rely on App.ts to call onInput with entity IDs for the actual fillet action.
          return "Select second object:";
      }
      return this.getPrompt();
  }


  getPrompt() {
    if (this.step === 10) return `Enter fillet radius <${this.radius}>:`;
    if (this.step === 0) return `FILLET (Radius=${this.radius.toFixed(2)}) Select first object (or Radius):`;
    return "Select second object:";
  }
}
