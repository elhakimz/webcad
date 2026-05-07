import { Command, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { Dimension } from "../model/Dimension"

export class DimRadiusCommand implements Command {
  step = 0
  entityId: string | null = null
  pickPt: { x: number, y: number } | null = null

  onInput(_text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    return this.getPrompt();
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.entityId = id;
      this.pickPt = { x, y };
      this.step = 1;
      return "Specify dimension line location:";
    }
    if (this.step === 1 && this.pickPt) {
      const dim = new Dimension(_id || "DIM", "RADIUS", this.pickPt.x, this.pickPt.y, x, y, 10);
      dim.properties = { entityId: this.entityId, dimLineLocation: { x, y } };
      return dim;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select arc or circle:";
    return "Specify dimension line location:";
  }

  getReferencePoints() {
    return this.pickPt ? [this.pickPt] : [];
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.pickPt) {
      const dim = new Dimension("PREVIEW", "RADIUS", this.pickPt.x, this.pickPt.y, x, y, 10);
      dim.properties = { entityId: this.entityId, dimLineLocation: { x, y } };
      return dim;
    }
    return null;
  }
}