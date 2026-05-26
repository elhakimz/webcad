import { Command, CommandResponse, PreviewObject } from "./types"
import { UnitsConfig } from "../model/Document"
import { Dimension } from "../model/Dimension"
import { Entity } from "../model/Entity"
import { Arc } from "../model/Arc"
import { Circle } from "../model/Circle"
import { Line } from "../model/Line"
import { getLineLineIntersectionInfinite } from "../engine/MathUtils"

export class DimAngularCommand implements Command {
  step = 0
  p1: { x: number, y: number } | null = null
  p2: { x: number, y: number } | null = null
  vertex: { x: number, y: number } | null = null
  dimLinePt: { x: number, y: number } | null = null
  
  selectedEntity1: Entity | null = null
  selectedEntity2: Entity | null = null
  
  pickPt1: { x: number, y: number } | null = null
  pickPt2: { x: number, y: number } | null = null

  setEntity(entity: Entity) {
    if (this.step === 0) {
      this.selectedEntity1 = entity;
    } else if (this.step === 1) {
      this.selectedEntity2 = entity;
    }
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (pickPt) {
      return this.onPoint(pickPt.x, pickPt.y, id, units);
    }
    // Handle ID from box selection or direct typing
    if (this.selectedEntity1 || this.selectedEntity2) {
      return this.onPoint(0, 0, text, units);
    }
    return this.getPrompt();
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      if (this.selectedEntity1 instanceof Arc) {
        this.vertex = { x: this.selectedEntity1.cx, y: this.selectedEntity1.cy };
        this.p1 = { 
          x: this.vertex.x + this.selectedEntity1.r * Math.cos(this.selectedEntity1.startAngle),
          y: this.vertex.y + this.selectedEntity1.r * Math.sin(this.selectedEntity1.startAngle)
        };
        this.p2 = { 
          x: this.vertex.x + this.selectedEntity1.r * Math.cos(this.selectedEntity1.endAngle),
          y: this.vertex.y + this.selectedEntity1.r * Math.sin(this.selectedEntity1.endAngle)
        };
        this.step = 3;
        return "Specify dimension arc line location:";
      } else if (this.selectedEntity1 instanceof Circle) {
        this.vertex = { x: this.selectedEntity1.cx, y: this.selectedEntity1.cy };
        this.p1 = { x: x, y: y }; // First point on circle
        this.step = 1;
        return "Specify second point on circle:";
      } else if (this.selectedEntity1 instanceof Line) {
        this.pickPt1 = { x, y }; // Store the click point for side detection
        this.step = 1;
        return "Select second line:";
      } else {
        // Fallback to 3-point mode
        this.p1 = { x, y };
        this.step = 1;
        return "Specify second angle point:";
      }
    }

    if (this.step === 1) {
      if (this.selectedEntity1 instanceof Line && this.selectedEntity2 instanceof Line) {
        this.pickPt2 = { x, y }; // Store the second click point for side detection
        const l1 = this.selectedEntity1 as Line;
        const l2 = this.selectedEntity2 as Line;
        const intersect = getLineLineIntersectionInfinite(
          { x: l1.x1, y: l1.y1 }, { x: l1.x2, y: l1.y2 },
          { x: l2.x1, y: l2.y1 }, { x: l2.x2, y: l2.y2 }
        );
        if (intersect) {
          this.vertex = intersect;
          // Use click points to determine which side of each line to measure
          const toPick1 = this.pickPt1 ? { x: this.pickPt1.x - intersect.x, y: this.pickPt1.y - intersect.y } : null;
          const toEnd1a = { x: l1.x1 - intersect.x, y: l1.y1 - intersect.y };
          const toEnd1b = { x: l1.x2 - intersect.x, y: l1.y2 - intersect.y };
          const dot1A = toPick1 ? toEnd1a.x * toPick1.x + toEnd1a.y * toPick1.y : 0;
          const dot1B = toPick1 ? toEnd1b.x * toPick1.x + toEnd1b.y * toPick1.y : 0;
          this.p1 = dot1A > dot1B ? { x: l1.x1, y: l1.y1 } : { x: l1.x2, y: l1.y2 };

          const toPick2 = this.pickPt2 ? { x: this.pickPt2.x - intersect.x, y: this.pickPt2.y - intersect.y } : null;
          const toEnd2a = { x: l2.x1 - intersect.x, y: l2.y1 - intersect.y };
          const toEnd2b = { x: l2.x2 - intersect.x, y: l2.y2 - intersect.y };
          const dot2A = toPick2 ? toEnd2a.x * toPick2.x + toEnd2a.y * toPick2.y : 0;
          const dot2B = toPick2 ? toEnd2b.x * toPick2.x + toEnd2b.y * toPick2.y : 0;
          this.p2 = dot2A > dot2B ? { x: l2.x1, y: l2.y1 } : { x: l2.x2, y: l2.y2 };

          this.step = 3;
          return "Specify dimension arc line location:";
        }
      } else if (this.selectedEntity1 instanceof Circle) {
        this.p2 = { x, y };
        this.step = 3;
        return "Specify dimension arc line location:";
      } else {
        this.p2 = { x, y };
        this.step = 2;
        return "Specify vertex point:";
      }
    }

    if (this.step === 2) {
      this.vertex = { x, y };
      this.step = 3;
      return "Specify dimension arc line location:";
    }

    if (this.step === 3) {
      this.dimLinePt = { x, y };
      const idStr = id || "DIM";
      const dim = new Dimension(idStr, "ANGULAR", this.p1!.x, this.p1!.y, this.p2!.x, this.p2!.y, 10);
      dim.dimLineLocation = this.dimLinePt;
      dim.properties = { 
        vertex: this.vertex
      };
      return dim;
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "Select arc, circle, line, or specify first point:";
    if (this.step === 1) {
      if (this.selectedEntity1 instanceof Line) return "Select second line:";
      if (this.selectedEntity1 instanceof Circle) return "Specify second point on circle:";
      return "Specify second angle point:";
    }
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
      dim.dimLineLocation = { x, y };
      dim.properties = { 
        vertex: this.vertex
      };
      return dim;
    }
    return null;
  }
}