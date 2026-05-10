import { Command, PreviewObject, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Dimension } from "../model/Dimension"
import { Entity } from "../model/Entity"
import { Circle } from "../model/Circle"
import { Arc } from "../model/Arc"

export class DimDiameterCommand implements Command {
  step = 0
  entityId: string | null = null
  pickPt: { x: number, y: number } | null = null
  textAligned: boolean = false
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
      return this.getPrompt();
    }
    if (this.step === 1 && text) {
      const upper = text.toUpperCase();
      if (upper === 'A' || upper === 'ALIGNED') {
        this.textAligned = true;
        return this.getPrompt();
      }
      if (upper === 'D' || upper === 'DOGLEG') {
        this.textAligned = false;
        return this.getPrompt();
      }
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
      
      let targetX = x;
      let targetY = y;
      
      if (this.textAligned && this.pickPt) {
        targetX = this.pickPt.x;
        targetY = this.pickPt.y;
      }
      
      const dx = targetX - cx;
      const dy = targetY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 1e-6) {
        tx = cx + (dx / dist) * r;
        ty = cy + (dy / dist) * r;
      } else {
        tx = cx + r;
        ty = cy;
      }
    }

    const dim = new Dimension(id || "DIM", "DIAMETER", cx, cy, tx, ty, 10);
    
    if (doc) {
      dim.style.DIMTOH = doc.dimtoh;
      dim.style.DIMTAD = doc.dimtad;
    }
    
    // Position dimension line where user clicked to allow placement logic in Viewer to decide inside/outside
    dim.dimLineLocation = { x, y };
    dim.properties = { entityId: this.entityId, textAligned: this.textAligned };
    return dim;
  }

  getPrompt() {
    if (this.step === 0) return "Select arc or circle:";
    return this.textAligned ? "Specify dimension line location or [Dogleg]:" : "Specify dimension line location or [Aligned]:";
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
