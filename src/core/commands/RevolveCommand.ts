import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Circle } from "../model/Circle"
import { Spline } from "../model/Spline"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService";
import { bulgeToArc } from "../engine/MathUtils";
import * as THREE from "three"

export class RevolveCommand implements Command {
  step = 0
  selectedEntity: Entity | null = null
  axisPt1: { x: number, y: number, z: number } | null = null
  axisPt2: { x: number, y: number, z: number } | null = null
  angle = 360
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

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig, _doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;

    if (this.step === 0) {
      return "Select profile (Polyline, Circle, Spline):";
    }
    
    if (this.step === 1) {
      this.axisPt1 = { x, y, z: currentZ };
      this.step = 2;
      return "Specify end point of axis:";
    }
    
    if (this.step === 2) {
      this.axisPt2 = { x, y, z: currentZ };
      this.step = 3;
      return "Specify angle of revolution <360>:";
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
    
    if (this.step === 3) {
      // User typed angle
      if (val === "") {
        this.angle = 360;
      } else {
        const a = parseFloat(val);
        if (!isNaN(a)) {
          this.angle = a;
        } else {
          return "Invalid angle. Specify angle of revolution <360>:";
        }
      }
      
      return this.executeRevolve(id, doc);
    }
    
    return this.getPrompt();
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


  private executeRevolve(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.selectedEntity || !this.axisPt1 || !this.axisPt2) return Promise.resolve("Missing required parameters.");
    
    let points: {x: number, y: number, z: number}[] = [];
    let isClosed = false;
    const elevation = this.selectedEntity.elevation || 0;
    
    if (this.selectedEntity instanceof Polyline) {
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
            if (v1.bulge > 0) {
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
      
      if (!this.selectedEntity.closed && count > 0) {
        const lastV = this.selectedEntity.vertices[count - 1];
        points.push({ x: lastV.x, y: lastV.y, z: elevation });
      }
      
      isClosed = this.selectedEntity.closed;
    } else if (this.selectedEntity instanceof Circle) {
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
    
    // Calculate axis direction
    const dx = this.axisPt2.x - this.axisPt1.x;
    const dy = this.axisPt2.y - this.axisPt1.y;
    const dz = this.axisPt2.z - this.axisPt1.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (len < 1e-6) return Promise.resolve("Axis length cannot be zero.");
    
    const axisDir = { x: dx / len, y: dy / len, z: dz / len };
    
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    return this.occService.createRevolve(points, this.axisPt1, axisDir, this.angle, this.thickness, deflection, isClosed, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'revolve',
        params: { points, axisPoint: this.axisPt1!, axisDir, angle: this.angle,
                  thickness: this.thickness, isClosed }
      };
      if (this.selectedEntity) {
        solid.layer = this.selectedEntity.layer;
      }
      this.step = 0; // Reset
      return solid as CommandResponse;
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating revolve: ${msg}`;
    });
  }

  getPrompt() {
    if (this.step === 0) return "REVOLVE Select profile (Polyline, Circle, Spline):";
    if (this.step === 1) return "Specify start point of axis:";
    if (this.step === 2) return "Specify end point of axis:";
    if (this.step === 3) return "Specify angle of revolution <360>:";
    if (this.step === 4) return "Specify thickness for open profile:";
    return "";
  }

  getPreview(_x: number, _y: number, _units: UnitsConfig) {
    return null;
  }
}
