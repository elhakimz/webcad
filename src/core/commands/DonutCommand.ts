import { Donut } from "../model/Donut"
import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class DonutCommand implements Command {
  step = 0
  static lastInnerDia = 0.5
  static lastOuterDia = 1.0
  innerDia = DonutCommand.lastInnerDia
  outerDia = DonutCommand.lastOuterDia

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0) {
      const n = parseFloat(val);
      this.innerDia = isNaN(n) ? DonutCommand.lastInnerDia : n;
      DonutCommand.lastInnerDia = this.innerDia;
      this.step = 1;
      return `Outside diameter of donut <${this.outerDia}>:`;
    }
    if (this.step === 1) {
      const n = parseFloat(val);
      this.outerDia = isNaN(n) ? DonutCommand.lastOuterDia : n;
      DonutCommand.lastOuterDia = this.outerDia;
      this.step = 2;
      return "Center of donut:";
    }
    if (val === "EXIT" || val === "") {
        this.step = 0;
        return { action: "finish" };
    }
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
        // Unlikely to happen if we start with numeric prompt, but handled
        return this.getPrompt();
    }
    if (this.step === 1) {
        return this.getPrompt();
    }
    
    // Continuous center picking
    const donut = new Donut(id, x, y, this.innerDia / 2, this.outerDia / 2);
    // Don't advance step, allow more donuts
    return donut;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 2) {
      return new Donut("PREVIEW", x, y, this.innerDia / 2, this.outerDia / 2);
    }
    return null
  }

  getPrompt() {
    if (this.step === 0) return `Inside diameter of donut <${this.innerDia}>:`;
    if (this.step === 1) return `Outside diameter of donut <${this.outerDia}>:`;
    return "Center of donut:";
  }
}
