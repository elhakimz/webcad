import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Circle } from "../model/Circle"
import { Spline } from "../model/Spline"
import { Line } from "../model/Line"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService";
import { ProfileUtility } from "../engine/ProfileUtility";
import * as MathUtils from "../engine/MathUtils";
import * as THREE from "three"

export class RevolveCommand implements Command {
  step = 0
  selectedEntity: Entity | null = null
  axisPt1: { x: number, y: number, z: number } | null = null
  axisPt2: { x: number, y: number, z: number } | null = null
  axisEntityId?: string
  axisSegmentIndex?: number
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
      return "Specify end point of axis (or pick a line/segment):";
    }
    
    if (this.step === 2) {
      this.axisPt2 = { x, y, z: currentZ };
      this.step = 3;
      return "Specify angle of revolution <360>:";
    }

    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim();
    
    if (val.toUpperCase() === "E" || val.toUpperCase() === "EXIT") {
      return { action: "finish" };
    }

    if (this.step === 0) {
      if (doc) {
        const entity = doc.getEntity(val);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
      return "Entity not found. Select profile:";
    }

    if (this.step === 1 || this.step === 2) {
        if (doc) {
            const entity = doc.getEntity(val);
            if (entity && entity.id !== this.selectedEntity?.id) {
                if (entity instanceof Line) {
                    this.axisPt1 = { x: entity.x1, y: entity.y1, z: entity.elevation || 0 };
                    this.axisPt2 = { x: entity.x2, y: entity.y2, z: entity.elevation || 0 };
                    this.axisEntityId = entity.id;
                    this.step = 3;
                    return this.getPrompt();
                } else if (entity instanceof Polyline && pickPt) {
                    const res = MathUtils.getClosestPolylineSegment(entity, pickPt);
                    if (res) {
                        this.axisPt1 = { x: res.p1.x, y: res.p1.y, z: entity.elevation || 0 };
                        this.axisPt2 = { x: res.p2.x, y: res.p2.y, z: entity.elevation || 0 };
                        this.axisEntityId = entity.id;
                        this.axisSegmentIndex = res.index;
                        this.step = 3;
                        return this.getPrompt();
                    }
                }
            }
        }
    }
    
    if (this.step === 3) {
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
      
      if (this.isOpenProfile()) {
        this.step = 4;
        return this.getPrompt();
      }
      return this.executeRevolve(id, doc);
    }

    if (this.step === 4) {
      const t = parseFloat(val);
      if (!isNaN(t)) {
        this.thickness = t;
        return this.executeRevolve(id, doc);
      }
      return "Invalid thickness. Specify thickness:";
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
    return false;
  }

  private executeRevolve(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.selectedEntity || !this.axisPt1 || !this.axisPt2) return Promise.resolve("Missing required parameters.");
    
    const { points, isClosed } = ProfileUtility.getProfilePoints(this.selectedEntity);
    if (points.length === 0) return Promise.resolve("No profile points sampled.");
    
    const dx = this.axisPt2.x - this.axisPt1.x;
    const dy = this.axisPt2.y - this.axisPt1.y;
    const dz = this.axisPt2.z - this.axisPt1.z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (len < 1e-6) return Promise.resolve("Axis length cannot be zero.");
    
    const axisDir = { x: dx / len, y: dy / len, z: dz / len };
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    const hash = ProfileUtility.getGeometryHash(this.selectedEntity);

    return this.occService.createRevolve(points, this.axisPt1, axisDir, this.angle, this.thickness, deflection, isClosed, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'revolve',
        params: { 
          points, axisPoint: this.axisPt1!, axisDir, angle: this.angle,
          thickness: this.thickness, isClosed,
          sourceEntityId: this.selectedEntity?.id,
          sourceSnapshotHash: hash,
          axisEntityId: this.axisEntityId,
          axisSegmentIndex: this.axisSegmentIndex
        }
      };
      if (this.selectedEntity) {
        solid.layer = this.selectedEntity.layer;
      }
      this.step = 0; 
      return solid as CommandResponse;
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating revolve: ${msg}`;
    });
  }

  getPrompt() {
    if (this.step === 0) return "REVOLVE Select profile (Polyline, Circle, Spline):";
    if (this.step === 1) return "Specify start point of axis (or pick a line/segment):";
    if (this.step === 2) return "Specify end point of axis:";
    if (this.step === 3) return "Specify angle of revolution <360>:";
    if (this.step === 4) return "Specify thickness for open profile:";
    return "";
  }

  getPreview(x: number, y: number, _units: UnitsConfig) {
    if (this.selectedEntity && this.axisPt1) {
        const entities: Entity[] = [];
        const p2 = this.axisPt2 || { x, y, z: this.axisPt1.z };
        entities.push(new Line("axis_preview", this.axisPt1.x, this.axisPt1.y, p2.x, p2.y, this.axisPt1.z));
        return { type: 'entities' as const, entities };
    }
    return null;
  }
}
