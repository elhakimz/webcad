import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Circle } from "../model/Circle"
import { Spline } from "../model/Spline"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService.js";
import { bulgeToArc } from "../engine/MathUtils";

export class ExtrudeCommand implements Command {
  step = 0
  selectedEntity: Entity | null = null
  height = 0
  thickness = 0
  occService: OpenCascadeService

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  setEntity(entity: Entity) {
    if (this.step === 0) {
      if (entity instanceof Polyline || entity instanceof Circle || entity instanceof Spline) {
        this.selectedEntity = entity;
        this.step = 1;
      }
    }
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse | Promise<CommandResponse> {
    if (this.step === 0) {
      return "Select profile (Polyline, Circle, Spline):";
    }
    
    if (this.step === 1) {
      // User clicked a point for height
      // We can't easily determine height from a single click in 2D without a base point
      // So we fallback to prompting for height input!
      return "Specify height:";
    }
    
    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim();
    
    if (val.toUpperCase() === "E" || val.toUpperCase() === "EXIT") {
      return { action: "finish" };
    }

    if (this.step === 0) {
      // User typed ID
      if (doc) {
        const entity = doc.getEntity(val);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
      return "Entity not found. Select profile:";
    }
    
    if (this.step === 1) {
      // User typed height
      const h = parseFloat(val);
      if (!isNaN(h) && h !== 0) {
        this.height = h;
        return this.executeExtrude(id, doc);
      }
      return "Invalid height. Specify height:";
    }
    
    if (this.step === 2) {

      // User typed thickness
      const t = parseFloat(val);
      if (!isNaN(t)) {
        this.thickness = t;
        return this.executeExtrude(id, doc);
      }
      return "Invalid thickness. Specify thickness:";
    }
  }

  private isOpenProfile(): boolean {
    if (this.selectedEntity instanceof Polyline) {
      return !this.selectedEntity.closed;
    }
    if (this.selectedEntity instanceof Spline) {
      return !this.selectedEntity.isClosed;
    }
    return false; // Circle is always closed
  }


  private executeExtrude(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.selectedEntity) return Promise.resolve("No profile selected.");
    
    let points: {x: number, y: number, z: number}[] = [];
    let isClosed = false;
    const elevation = this.selectedEntity.elevation || 0;
    
    if (this.selectedEntity instanceof Polyline) {
      points = [];
      const count = this.selectedEntity.vertices.length;
      const limit = this.selectedEntity.closed ? count : count - 1;
      
      for (let i = 0; i < limit; i++) {
        const v1 = this.selectedEntity.vertices[i];
        const v2 = this.selectedEntity.vertices[(i + 1) % count];
        
        if (v1.bulge && Math.abs(v1.bulge) >= 1e-6) {
          const arcParams = bulgeToArc(v1, v2, v1.bulge);
          if (arcParams) {
            const startAngle = arcParams.startAngle;
            const endAngle = arcParams.endAngle;
            let sweep = endAngle - startAngle;
            if (arcParams.ccw) {
              if (sweep < 0) sweep += 2 * Math.PI;
            } else {
              if (sweep > 0) sweep -= 2 * Math.PI;
            }
            const segments = 16;
            for (let j = 0; j < segments; j++) {
              const angle = startAngle + (j / segments) * sweep;
              points.push({
                x: arcParams.cx + arcParams.r * Math.cos(angle),
                y: arcParams.cy + arcParams.r * Math.sin(angle),
                z: elevation
              });
            }
          } else {
            points.push({ x: v1.x, y: v1.y, z: elevation });
          }
        } else {
          points.push({ x: v1.x, y: v1.y, z: elevation });
        }
      }
      
      // If not closed, add the last vertex!
      if (!this.selectedEntity.closed && count > 0) {
        const lastV = this.selectedEntity.vertices[count - 1];
        points.push({ x: lastV.x, y: lastV.y, z: elevation });
      }
      
      isClosed = this.selectedEntity.closed;
    } else if (this.selectedEntity instanceof Circle) {
      // Sample N points without repeating the start — closure is passed explicitly
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: this.selectedEntity.cx + this.selectedEntity.r * Math.cos(angle),
          y: this.selectedEntity.cy + this.selectedEntity.r * Math.sin(angle),
          z: elevation
        });
      }
      isClosed = true;
    } else if (this.selectedEntity instanceof Spline) {
      points = this.selectedEntity.sampledPoints.map(v => ({ x: v.x, y: v.y, z: elevation }));
      isClosed = this.selectedEntity.isClosed;
    }
    
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    return this.occService.createExtrude(points, this.height, this.thickness, deflection, isClosed, id).then((geometry: any) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'extrude',
        params: { points, height: this.height, thickness: this.thickness, isClosed }
      };
      if (this.selectedEntity) {
        solid.layer = this.selectedEntity.layer;
      }
      this.step = 0; // Reset
      return solid as CommandResponse;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating extrude: ${err.message || err.toString()}`;
    });
  }

  getPrompt() {
    if (this.step === 0) return "EXTRUDE Select profile (Polyline, Circle, Spline):";
    if (this.step === 1) return "Specify height:";
    if (this.step === 2) return "Specify thickness for open profile:";
    return "";
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    return null;
  }
}
