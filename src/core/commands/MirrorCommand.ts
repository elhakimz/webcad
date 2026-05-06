import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class MirrorCommand implements Command {
  step = 0
  p1 = { x: 0, y: 0 }
  p2 = { x: 0, y: 0 }
  targetIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      this.step = 1;
      return "First point of mirror line:";
    }

    if (this.step === 3) {
      if (val !== "" && val !== "Y" && val !== "YES" && val !== "N" && val !== "NO") {
          return "Delete source objects? <N>:";
      }
      const deleteOriginal = (val === "Y" || val === "YES");
      const ids = [...this.targetIds];
      const p1 = this.p1;
      const p2 = this.p2;
      this.step = 0;
      this.targetIds = [];
      return { action: "mirror", ids, p1, p2, deleteOriginal } as CommandResponse;
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.p1 = { x, y }
      this.step = 2
      return "Second point:"
    } else if (this.step === 2) {
      this.p2 = { x, y }
      this.step = 3
      return "Delete source objects? <N>:"
    }
    return this.getPrompt();
  }

  getReferencePoints() {
    if (this.step === 2) return [this.p1]
    if (this.step === 3) return [this.p1, this.p2]
    return []
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "First point of mirror line:";
    if (this.step === 2) return "Second point:";
    if (this.step === 3) return "Delete source objects? <N>:";
    return "";
  }
}
