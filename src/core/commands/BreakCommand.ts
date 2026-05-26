import { Command, CommandAction, CommandResponse, XMarkerPreview } from "./types"
import { UnitsConfig } from "../model/Document"

export class BreakCommand implements Command {
  step = 0
  id: string | null = null
  breakPt1: { x: number, y: number } | null = null
  breakPt2: { x: number, y: number } | null = null

  onInput(text: string, _id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
      if (this.step === 0) {
          this.id = text;
          this.step = 1;
          return "Specify first point:";
      }
      if (this.step === 1) {
          this.id = text;
          if (pickPt) this.breakPt1 = pickPt;
          this.step = 2;
          return "Specify second point:";
      }
      if (this.step === 2) {
          return { action: "break", id: this.id, pick1: this.breakPt1, pick2: pickPt } as CommandAction;
      }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
      if (this.step === 0) {
          this.step = 1;
          return "Specify first point:";
      }
      if (this.step === 1) {
          this.breakPt1 = { x, y };
          this.step = 2;
          return "Specify second point:";
      }
      if (this.step === 2) {
          return { action: "break", id: this.id, pick1: this.breakPt1, pick2: { x, y } } as CommandAction;
      }
      return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select object:";
    if (this.step === 1) return "Specify first point:";
    return "Specify second point:";
  }

  getPreview(x: number, y: number, _units: UnitsConfig): XMarkerPreview | null {
    if (this.step >= 1) {
      return { type: 'xmarker', x, y };
    }
    return null;
  }

  getReferencePoints() {
    const pts = [];
    if (this.breakPt1) pts.push(this.breakPt1);
    if (this.breakPt2) pts.push(this.breakPt2);
    return pts;
  }

  getBasePoint(): { x: number, y: number } | null {
    if (this.step === 1) return { x: 0, y: 0 };
    if (this.step === 2 && this.breakPt1) return this.breakPt1;
    return null;
  }
}