import { Command, CommandAction, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class FilletCommand implements Command {
  step = 0 // 0: Ask Radius, 1: Select Obj1, 2: Select Obj2
  static lastRadius = 2.0;
  radius = FilletCommand.lastRadius;
  id1: string | null = null
  id2: string | null = null
  pick1: { x: number, y: number } | null = null
  pick2: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
      const val = text.trim();
      
      // If we are at step 0 and input is a number, update radius and move to step 1
      if (this.step === 0 && val !== "" && !isNaN(parseFloat(val))) {
          const r = parseFloat(val);
          this.radius = r;
          FilletCommand.lastRadius = r;
          this.step = 1;
          return this.getPrompt();
      }

      // Handle entity selection
      if (this.step === 0 || this.step === 1) {
          // If at step 0 and they clicked an object, they accepted the default radius
          this.id1 = text;
          if (pickPt) this.pick1 = pickPt;
          this.step = 2;
          return this.getPrompt();
      }
      
      if (this.step === 2) {
          this.id2 = text;
          if (pickPt) this.pick2 = pickPt;
          return { action: "fillet", id1: this.id1, id2: this.id2, radius: this.radius, pick1: this.pick1, pick2: this.pick2 } as CommandAction;
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
      return [`FILLET: Enter radius <${this.radius.toFixed(2)}> (enter value)`];
    }
    return undefined;
  }

  getPrompt() {
    if (this.step === 0) return `FILLET: Enter radius <${this.radius.toFixed(2)}> or select first object:`;
    if (this.step === 1) return `Radius set to ${this.radius.toFixed(2)}. Select first object:`;
    return "Select second object:";
  }
}
