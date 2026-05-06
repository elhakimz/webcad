import { Shape } from "../model/Shape"
import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { getAllShapeNames, getShapeSegments } from "../io/Shapes"

export class ShapeCommand implements Command {
  step = 0
  shapeName = ""
  insertionPt = { x: 0, y: 0 }
  scale = 1.0
  rotation = 0.0

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val === "?") {
        const names = getAllShapeNames();
        return "Available shapes:\n" + names.join(", ") + "\nShape name (or ?):";
      }
      this.shapeName = val;
      this.step = 1;
      return "Insertion point:";
    }

    if (this.step === 2) {
      const n = parseFloat(val);
      this.scale = isNaN(n) ? 1.0 : n;
      this.step = 3;
      return "Rotation angle <0>:";
    }

    if (this.step === 3) {
      const n = parseFloat(val);
      this.rotation = isNaN(n) ? 0.0 : n;
      const segments = getShapeSegments(this.shapeName);
      const entity = new Shape(id, this.shapeName, this.insertionPt.x, this.insertionPt.y, this.scale, this.rotation, segments);
      this.step = 0;
      return entity;
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.insertionPt = { x, y };
      this.step = 2;
      return "Scale <1.0>:";
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 1) {
      const segments = getShapeSegments(this.shapeName);
      return new Shape("PREVIEW", this.shapeName, x, y, this.scale, this.rotation, segments);
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "Shape name (or ?):";
    if (this.step === 1) return "Insertion point:";
    if (this.step === 2) return "Scale <1.0>:";
    if (this.step === 3) return "Rotation angle <0>:";
    return "";
  }
}
