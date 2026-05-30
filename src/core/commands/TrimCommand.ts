import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class TrimCommand implements Command {
  step = 0
  boundaryIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.boundaryIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val === "") {
        this.step = 1;
        return "Select object to trim:";
      }
      // Boundary IDs are passed via onInput from App.ts click
      this.boundaryIds.push(val);
      return "Select cutting edges:";
    }

    if (this.step === 1) {
      if (val === "") {
        // User pressed Enter but hasn't selected target yet - just re-prompt
        if (this.boundaryIds.length === 0) return "No boundaries. Select cutting edges:";
        return "Select object to trim:";
      }
      // User typed an ID to trim?
      // Typically TRIM is done by picking a segment. 
      // But we can support ID as well.
      return { action: "trim", boundaryIds: [...this.boundaryIds], id: val } as CommandResponse;
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) return "Select cutting edges:";
    if (this.step === 1) {
      // Need to find which entity is at (x,y)
      // This is handled by App.ts click logic which passes the ID.
      // If we are here, it means we clicked empty space.
      return "Select object to trim:";
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select cutting edges:";
    if (this.step === 1) return "Select object to trim:";
    return "";
  }
}
