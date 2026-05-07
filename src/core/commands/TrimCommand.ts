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
    console.log("[TRIM CMD] onInput called with text:", text, "step:", this.step);

    if (this.step === 0) {
      if (val === "") {
        if (this.boundaryIds.length === 0) return "No boundaries selected. Select cutting edges:";
        this.step = 1;
        console.log("[TRIM CMD] Now at step 1, boundaries:", this.boundaryIds);
        return "Select object to trim:";
      }
      // Boundary IDs are passed via onInput from App.ts click
      this.boundaryIds.push(val);
      console.log("[TRIM CMD] Added boundary:", val);
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
      console.log("[TRIM CMD] Returning TRIM action with id:", val, "boundaries:", this.boundaryIds);
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
