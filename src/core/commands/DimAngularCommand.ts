import { Command, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { Dimension } from "../model/Dimension"

export class DimAngularCommand implements Command {
  step = 0
  p1: { x: number, y: number } | null = null
  p2: { x: number, y: number } | null = null
  vertex: { x: number, y: number } | null = null
  p3: { x: number, y: number } | null = null
  dimLinePt: { x: number, y: number } | null = null

  onInput(_text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    return this.getPrompt();
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      return "Specify second angle point:";
    }
    if (this.step === 1) {
      this.p2 = { x, y };
      this.step = 2;
      return "Specify vertex point:";
    }
    if (this.step === 2) {
      this.vertex = { x, y };
      this.step = 3;
      return "Specify dimension arc line location:";
    }
    if (this.step === 3) {
      this.dimLinePt = { x, y };
      const id = _id || "DIM";
      const dim = new Dimension(id, "ANGULAR", this.p1!.x, this.p1!.y, this.p2!.x, this.p2!.y, 10);
      dim.properties = { 
        vertex: this.vertex,
        dimLineLocation: this.dimLinePt
      };
      return dim;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Specify first angle point:";
    if (this.step === 1) return "Specify second angle point:";
    if (this.step === 2) return "Specify vertex point:";
    return "Specify dimension arc line location:";
  }

  getReferencePoints() {
    const pts = [];
    if (this.p1) pts.push(this.p1);
    if (this.p2) pts.push(this.p2);
    if (this.vertex) pts.push(this.vertex);
    return pts;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 3 && this.p1 && this.p2 && this.vertex) {
      const dim = new Dimension("PREVIEW", "ANGULAR", this.p1.x, this.p1.y, this.p2.x, this.p2.y, 10);
      dim.properties = { 
        vertex: this.vertex,
        dimLineLocation: { x, y }
      };
      return dim;
    }
    return null;
  }
}