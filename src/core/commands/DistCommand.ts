import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig } from "../model/Document";

export class DistCommand implements Command {
  step = 0;
  p1: { x: number, y: number } | null = null;

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      return { type: 'prompt', text: "Specify second point:" };
    } else {
      const p1 = this.p1!;
      this.step = 0;
      this.p1 = null;
      return { type: 'action', action: 'dist', pick1: p1, pick2: { x, y } };
    }
  }

  getPrompt() {
    if (this.step === 0) return "DIST Specify first point:";
    return "Specify second point:";
  }
}
