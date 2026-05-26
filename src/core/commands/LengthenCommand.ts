import { Command, CommandAction, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class LengthenCommand implements Command {
  step = 0
  static lastMode: 'DELTA' | 'PERCENT' | 'TOTAL' = 'DELTA'
  mode: 'DELTA' | 'PERCENT' | 'TOTAL' = LengthenCommand.lastMode
  value = 0
  entityId: string | null = null
  pickPt: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val === "D" || val === "DELTA") {
        this.mode = 'DELTA';
        LengthenCommand.lastMode = this.mode;
        this.step = 1;
        return this.getPrompt();
      }
      if (val === "P" || val === "PERCENT") {
        this.mode = 'PERCENT';
        LengthenCommand.lastMode = this.mode;
        this.step = 1;
        return this.getPrompt();
      }
      if (val === "T" || val === "TOTAL") {
        this.mode = 'TOTAL';
        LengthenCommand.lastMode = this.mode;
        this.step = 1;
        return this.getPrompt();
      }

      if (val === "") {
        this.mode = LengthenCommand.lastMode;
        this.step = 1;
        return this.getPrompt();
      }

      if (pickPt) {
        this.entityId = val;
        this.pickPt = pickPt;
        return { action: "lengthen", id: this.entityId, mode: this.mode, value: this.value, pickPt: this.pickPt } as CommandAction;
      }

      return this.getPrompt();
    }

    if (this.step === 1) {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        this.value = num;
        this.step = 2;
        return "Select an object to change:";
      }
      return this.getPrompt();
    }

    if (this.step === 2 && pickPt) {
      this.entityId = text;
      this.pickPt = pickPt;
      return { action: "lengthen", id: this.entityId, mode: this.mode, value: this.value, pickPt: this.pickPt } as CommandAction;
    }

    return this.getPrompt();
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 2) {
      this.entityId = id;
      this.pickPt = { x, y };
      return { action: "lengthen", id: this.entityId, mode: this.mode, value: this.value, pickPt: this.pickPt } as CommandAction;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) {
      const modeLabel = this.mode === 'DELTA' ? 'Delta' : this.mode === 'PERCENT' ? 'Percent' : 'Total';
      return `Select object or [Delta/Percent/Total] <${modeLabel}>:`;
    }
    if (this.step === 1) {
      if (this.mode === 'DELTA') return `Enter delta length <${this.value.toFixed(2)}>:`;
      if (this.mode === 'PERCENT') return `Enter percentage <${this.value.toFixed(0)}>:`;
      return `Enter total length <${this.value.toFixed(2)}>:`;
    }
    return "Select an object to change:";
  }
}