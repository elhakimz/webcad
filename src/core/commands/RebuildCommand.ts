import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class RebuildCommand implements Command {
  targetId: string = "";

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetId = ids[0];
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.targetId) {
      return { action: "rebuild", id: this.targetId };
    }
    return "Select solid object to rebuild:";
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ALL") {
      return { action: "rebuild_all" };
    }
    if (!this.targetId && val !== "") {
      this.targetId = text.trim();
    }
    if (this.targetId) {
      return { action: "rebuild", id: this.targetId };
    }
    return "Selected object required. Rebuild object [ALL]:";
  }

  getPrompt() {
    if (this.targetId) return `Rebuild solid object ${this.targetId}?`;
    return "Select solid object to rebuild [ALL]:";
  }
  
  getOptions(): string[] {
    return ["ALL"];
  }
}
