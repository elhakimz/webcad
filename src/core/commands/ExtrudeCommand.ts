import {Command, CommandResponse, PreviewObject} from "./types"
import {IDocument, UnitsConfig} from "../model/Document"
import {Entity} from "../model/Entity"
import {Polyline} from "../model/Polyline"
import {Circle} from "../model/Circle"
import {Spline} from "../model/Spline"
import {Solid3D} from "../model/Solid3D"
import {Line} from "../model/Line"
import {OpenCascadeService} from "../io/OpenCascadeService";
import {bulgeToArc} from "../engine/MathUtils";
import {FormatUtils} from "../engine/FormatUtils";
import * as THREE from "three";

export class ExtrudeCommand implements Command {
  step = 0
  selectedEntity: Entity | null = null
  height = 0
  thickness = 0
  basePt: { x: number; y: number; z: number } | null = null
  occService: OpenCascadeService

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  setEntity(entity: Entity) {
    if (this.step === 0) {
      if (entity instanceof Polyline || entity instanceof Circle || entity instanceof Spline) {
        this.selectedEntity = entity;
        const elevation = entity.elevation || 0;
        let bx = 0, by = 0;
        
        if (entity instanceof Circle) {
          bx = entity.cx;
          by = entity.cy;
        } else if (entity instanceof Polyline && entity.vertices.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          entity.vertices.forEach(v => {
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
          });
          bx = (minX + maxX) / 2;
          by = (minY + maxY) / 2;
        } else if (entity instanceof Spline && entity.sampledPoints.length > 0) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          entity.sampledPoints.forEach(v => {
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
          });
          bx = (minX + maxX) / 2;
          by = (minY + maxY) / 2;
        }
        
        this.basePt = { x: bx, y: by, z: elevation };
        this.step = 1;
      }
    }
  }

  onPoint(_x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse | Promise<CommandResponse> {
    if (this.step === 0) {
      return "Select profile (Polyline, Circle, Spline):";
    }
    
    if (this.step === 1) {
      if (!this.basePt) return "Error: Profile not selected.";
      this.height = y - this.basePt.y;
      if (this.isOpenProfile()) {
        this.step = 2;
        return this.getPrompt();
      }
      return this.executeExtrude(id, doc);
    }
    
    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
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
    
    if (this.step === 1) {
      const h = parseFloat(val);
      if (!isNaN(h) && h !== 0) {
        this.height = h;
        if (this.isOpenProfile()) {
          this.step = 2;
          return this.getPrompt();
        }
        return this.executeExtrude(id, doc);
      }
      return "Invalid height. Specify height:";
    }
    
    if (this.step === 2) {
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

  private getProfilePoints(): { points: { x: number; y: number; z: number }[]; isClosed: boolean } {
    if (!this.selectedEntity) return { points: [], isClosed: false };
    
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
    
    return { points, isClosed };
  }

  private executeExtrude(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.selectedEntity) return Promise.resolve("No profile selected.");
    
    const { points, isClosed } = this.getProfilePoints();
    if (points.length === 0) return Promise.resolve("No profile points sampled.");
    
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    return this.occService.createExtrude(points, this.height, this.thickness, deflection, isClosed, id).then((geometry: THREE.BufferGeometry) => {
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
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating extrude: ${msg}`;
    });
  }

  getPrompt() {
    if (this.step === 0) return "EXTRUDE Select profile (Polyline, Circle, Spline):";
    if (this.step === 1) return "Specify height (move mouse up/down or enter value):";
    if (this.step === 2) return "Specify thickness for open profile:";
    return "";
  }

  getPreview(x: number, y: number, _units: UnitsConfig, _doc?: IDocument): PreviewObject | null {
    if (this.step === 1 && this.selectedEntity && this.basePt) {
      const h = y - this.basePt.y;
      const { points, isClosed } = this.getProfilePoints();
      if (points.length === 0) return null;
      
      const entities: Entity[] = [];
      const elevation = this.selectedEntity.elevation || 0;
      const count = points.length;
      const limit = isClosed ? count : count - 1;
      
      for (let i = 0; i < limit; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % count];
        
        entities.push(new Line("b" + i, p1.x, p1.y, p2.x, p2.y, elevation));
        entities.push(new Line("t" + i, p1.x, p1.y, p2.x, p2.y, elevation + h));
      }
      
      for (let i = 0; i < count; i++) {
        const p = points[i];
        entities.push(new Line("v" + i, p.x, p.y, p.x, p.y, elevation, h));
      }
      
      return { type: 'entities' as const, entities };
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1 && this.basePt) {
      const h = y - this.basePt.y;
      return [
        `H: ${FormatUtils.formatDistance(h, units)}`
      ];
    }
    return null;
  }
}
