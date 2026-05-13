import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Circle } from "../model/Circle"
import { Spline } from "../model/Spline"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService.js";

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

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
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
      points = this.selectedEntity.vertices.map(v => ({ x: v.x, y: v.y, z: elevation }));
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
    
    return this.occService.createRevolve(points, this.axisPt1, axisDir, this.angle, this.thickness, deflection, isClosed, id).then((geometry: any) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
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
    }).catch((err: any) => {

      this.step = 0;
      return `Error creating revolve: ${err.message || err.toString()}`;
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

  getPreview(x: number, y: number, units: UnitsConfig) {
    return null;
  }
}
