import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Point } from "../engine/MathUtils";

export class BlockCommand implements Command {
  step = 0
  blockName = ""
  basePoint: Point | null = null
  selectedIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.selectedIds = ids;
      this.step = 2; // Skip to Name if objects already selected
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      this.blockName = val;
      this.step = 1;
      return "Insertion base point:";
    }

    if (this.step === 2) {
        if (val === "") {
            if (this.selectedIds.length === 0) return "No objects selected. Select objects:";
            return this.finish();
        }
        this.selectedIds.push(val);
        return "Select objects:";
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.basePoint = { x, y };
      this.step = 2;
      return "Select objects:";
    }
    return this.getPrompt();
  }

  private finish(): CommandResponse {
    const res: CommandResponse = { 
        action: "block", 
        name: this.blockName, 
        basePoint: this.basePoint!, 
        ids: [...this.selectedIds] 
    };
    this.step = 0;
    this.selectedIds = [];
    return res;
  }

  getPrompt() {
    if (this.step === 0) return "Block name:";
    if (this.step === 1) return "Insertion base point:";
    if (this.step === 2) return "Select objects:";
    return "";
  }
}
