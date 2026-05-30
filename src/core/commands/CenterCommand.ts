import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Circle } from "../model/Circle"
import { Arc } from "../model/Arc"
import { Line } from "../model/Line"

export class CenterCommand implements Command {
  step = 0;
  private initialSelection?: string[];

  constructor(selection?: string[]) {
    this.initialSelection = selection;
  }
  
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0 && this.initialSelection && this.initialSelection.length > 0 && doc) {
      return this.onInput(this.initialSelection[0], _id, _units, undefined, doc) || this.getPrompt();
    }
    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    // If we have an initial selection and this is the first input but not explicitly typed text
    if (this.step === 0 && text === "" && this.initialSelection && this.initialSelection.length > 0 && doc) {
      text = this.initialSelection[0];
    }
    const val = text.trim();
    if (val.toUpperCase() === "E" || val.toUpperCase() === "EXIT") {
      return { action: "finish" };
    }

    if (this.step === 0) {
      if (!doc) return this.getPrompt();
      const entity = doc.getEntity(val);
      if (entity instanceof Circle || entity instanceof Arc) {
        const cx = entity.cx;
        const cy = entity.cy;
        const r = entity.r;
        const extension = r * 0.2; // Extend center lines by 20% of radius
        const lineLen = r + extension;
        const elevation = entity.elevation || 0;
        
        const hLine = new Line(doc.getNextId("L"), cx - lineLen, cy, cx + lineLen, cy, elevation, 0);
        hLine.linetype = "DASHDOT";
        hLine.layer = entity.layer;
        
        const vLine = new Line(doc.getNextId("L"), cx, cy - lineLen, cx, cy + lineLen, elevation, 0);
        vLine.linetype = "DASHDOT";
        vLine.layer = entity.layer;

        return {
           type: 'action',
           action: 'centerline',
           entities: [hLine, vLine]
        };
      }
      return "Selected object must be a Circle or Arc.";
    }
  }

  getPrompt() {
    if (this.step === 0) return "Select circle or arc to draw center lines:";
    return "";
  }
}
