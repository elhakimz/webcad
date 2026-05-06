import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Point } from "../engine/MathUtils";

export class InsertCommand implements Command {
  step = 0
  blockName = ""
  insertPoint: Point | null = null
  scaleX = 1.0
  scaleY = 1.0
  rotation = 0.0

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val === "?") {
          return { action: "blockList" } as CommandResponse;
      }
      this.blockName = val;
      this.step = 1;
      return "Insertion point:";
    }

    if (this.step === 2) {
      const n = parseFloat(val);
      this.scaleX = isNaN(n) ? 1.0 : n;
      this.step = 3;
      return `Y scale factor (default=X) <${this.scaleX}>:`;
    }

    if (this.step === 3) {
      const n = parseFloat(val);
      this.scaleY = isNaN(n) ? this.scaleX : n;
      this.step = 4;
      return "Rotation angle <0>:";
    }

    if (this.step === 4) {
      const n = parseFloat(val);
      this.rotation = isNaN(n) ? 0.0 : n;
      return this.finish();
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.insertPoint = { x, y };
      this.step = 2;
      return "X scale factor <1>:";
    }
    return this.getPrompt();
  }

  private finish(): CommandResponse {
    const res: CommandResponse = {
      action: "insert",
      name: this.blockName,
      point: this.insertPoint!,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      rotation: this.rotation
    };
    this.step = 0;
    return res;
  }

  getPrompt() {
    if (this.step === 0) return "Block name (or ?):";
    if (this.step === 1) return "Insertion point:";
    if (this.step === 2) return "X scale factor <1>:";
    if (this.step === 3) return `Y scale factor (default=X) <${this.scaleX}>:`;
    if (this.step === 4) return "Rotation angle <0>:";
    return "";
  }
}
