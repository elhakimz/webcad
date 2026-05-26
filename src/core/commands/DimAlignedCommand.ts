import { Command, CommandResponse, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { Dimension } from "../model/Dimension"

export class DimAlignedCommand implements Command {
  step = 0
  p1: { x: number, y: number } | null = null
  p2: { x: number, y: number } | null = null
  dimLinePt: { x: number, y: number } | null = null

  onInput(_text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    return this.getPrompt();
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      return "Specify second extension line origin:";
    }
    if (this.step === 1) {
      this.p2 = { x, y };
      this.step = 2;
      return "Specify dimension line location:";
    }
    if (this.step === 2) {
      this.dimLinePt = { x, y };
      const id = _id || "DIM";
      const dim = new Dimension(id, "ALIGNED", this.p1!.x, this.p1!.y, this.p2!.x, this.p2!.y, 10);
      dim.dimLineLocation = this.dimLinePt;
      return dim;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Specify first extension line origin:";
    if (this.step === 1) return "Specify second extension line origin:";
    return "Specify dimension line location:";
  }

  getReferencePoints() {
    const pts = [];
    if (this.p1) pts.push(this.p1);
    if (this.p2) pts.push(this.p2);
    return pts;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 2 && this.p1 && this.p2) {
      const dim = new Dimension("PREVIEW", "ALIGNED", this.p1.x, this.p1.y, this.p2.x, this.p2.y, 10);
      dim.dimLineLocation = { x, y };
      return dim;
    }
    return null;
  }
}