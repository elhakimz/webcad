// src/core/sketcher/constraints/ConstraintFactory.ts
import { ConstraintBase } from "../Constraint";
import { Coincident } from "./Coincident";
import { Horizontal } from "./Horizontal";
import { Vertical } from "./Vertical";
import { Distance } from "./Distance";
import { Radius } from "./Radius";
import { Parallel } from "./Parallel";
import { Perpendicular } from "./Perpendicular";
import { Tangent } from "./Tangent";
import { Angle } from "./Angle";
import { Concentric } from "./Concentric";
import { ArcPointsOnCircle } from "./ArcPointsOnCircle";
import { ArcLineTangent } from "./ArcLineTangent";
import { EqualLength } from "./EqualLength";
import { EqualRadius } from "./EqualRadius";
import { Symmetric } from "./Symmetric";
import { Midpoint } from "./Midpoint";
import { WhereDragged } from "./WhereDragged";

export class ConstraintFactory {
  static create(data: any): ConstraintBase | null {
    switch (data.type) {
      case 'Coincident':
        return new Coincident(data.ptA, data.ptB);
      case 'Horizontal':
        return new Horizontal(data.ptA, data.ptB);
      case 'Vertical':
        return new Vertical(data.ptA, data.ptB);
      case 'Distance':
        return new Distance(data.ptA, data.ptB, data.value);
      case 'Radius':
        return new Radius(data.circle, data.value);
      case 'Parallel':
        return new Parallel(data.lineA, data.lineB);
      case 'Perpendicular':
        return new Perpendicular(data.lineA, data.lineB);
      case 'Tangent':
        return new Tangent(data.line, data.circle);
      case 'Angle':
        return new Angle(data.lineA, data.lineB, data.angleDeg);
      case 'Concentric':
        return new Concentric(data.entityA, data.entityB);
      case 'ArcPointsOnCircle':
        return new ArcPointsOnCircle(data.arc);
      case 'ArcLineTangent':
        return new ArcLineTangent(data.arc, data.line, data.atStart);
      case 'EqualLength':
        return new EqualLength(data.entityA, data.entityB);
      case 'EqualRadius':
        return new EqualRadius(data.circleA, data.circleB);
      case 'Symmetric':
        return new Symmetric(data.ptA, data.ptB, data.axisEntity);
      case 'Midpoint':
        return new Midpoint(data.pt, data.entityA);
      case 'WhereDragged':
        return new WhereDragged(data.pt, data.tx, data.ty);
      default:
        console.warn(`Unknown constraint type: ${data.type}`);
        return null;
    }
  }
}
