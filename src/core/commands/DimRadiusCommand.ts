import { Command, PreviewObject, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Dimension } from "../model/Dimension"
import { Entity } from "../model/Entity"
import { Circle } from "../model/Circle"
import { Arc } from "../model/Arc"

export class DimRadiusCommand implements Command {
  step = 0
  entityId: string | null = null
  pickPt: { x: number, y: number } | null = null
  private selectedEntity: Entity | null = null

  setEntity(entity: Entity) {
    this.selectedEntity = entity;
    this.entityId = entity.id;
  }

  onInput(text: string, id: string, _units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (this.step === 0 && text) {
      this.entityId = text;
      if (pickPt) {
        this.pickPt = pickPt;
      }
      this.step = 1;
      return "Specify dimension line location:";
    }
    return this.getPrompt();
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 1) {
      return this.finishCommand(x, y, id, doc);
    }
    return this.getPrompt();
  }

  private finishCommand(x: number, y: number, id: string, doc?: IDocument): CommandResponse {
    let cx = x;
    let cy = y;
    let tx = x;
    let ty = y;

    if (this.selectedEntity instanceof Circle || this.selectedEntity instanceof Arc) {
      const entity = this.selectedEntity as Circle | Arc;
      cx = entity.cx;
      cy = entity.cy;
      const r = entity.r;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 1e-6) {
        tx = cx + (dx / dist) * r;
        ty = cy + (dy / dist) * r;
      } else {
        tx = cx + r;
        ty = cy;
      }
    }

    const dim = new Dimension(id || "DIM", "RADIUS", cx, cy, tx, ty, 10);
    
    if (doc) {
      dim.style.DIMTOH = doc.dimtoh;
      dim.style.DIMTAD = doc.dimtad;
    }
    
    const dx = tx - cx;
    const dy = ty - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ux = dist > 1e-6 ? dx / dist : 1;
    const uy = dist > 1e-6 ? dy / dist : 0;
    
    // Position text at 50% of the radius (middle of the line)
    dim.dimLineLocation = { x: cx + ux * (dist * 0.5), y: cy + uy * (dist * 0.5) };
    dim.properties = { entityId: this.entityId };
    return dim;
  }

  getPrompt() {
    if (this.step === 0) return "Select arc or circle:";
    return "Specify dimension line location:";
  }

  getReferencePoints() {
    return this.pickPt ? [this.pickPt] : [];
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1) {
      const id = "PREVIEW";
      const dim = this.finishCommand(x, y, id) as Dimension;
      return dim;
    }
    return null;
  }
}