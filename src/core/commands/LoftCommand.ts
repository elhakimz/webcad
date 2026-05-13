import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { Circle } from "../model/Circle"
import { Polyline } from "../model/Polyline"
import { Point } from "../model/Point"
import { OpenCascadeService } from "../io/OpenCascadeService"
import { Solid3D } from "../model/Solid3D"
import { SelectionEngine } from "../engine/SelectionEngine"

export class LoftCommand implements Command {
  step = 1
  profiles: Entity[] = []
  isSolid = true
  isRuled = false

  setEntity(entity: Entity) {
    if (this.step === 1) {
      // Check if entity is already in the list
      if (this.profiles.some(p => p.id === entity.id)) {
        return;
      }
      this.profiles.push(entity);
    }
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const upper = text.toUpperCase().trim();

    if (this.step === 1) {
      if (text === '') {
        if (this.profiles.length < 2) {
          return "Select at least 2 profiles. Select profile:";
        }
        this.step = 2;
        return this.getPrompt();
      }
      
      if (doc) {
        const entity = doc.getEntity(text);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
      return this.getPrompt();
    }

    if (this.step === 2) {
      if (upper === 'SURFACE' || upper === 'SURF') {
        this.isSolid = false;
        this.step = 3;
      } else if (upper === 'SOLID' || upper === 'S' || text === '') {
        this.isSolid = true;
        this.step = 3;
      } else {
        return "Invalid option. Mode [Solid/Surface] <Solid>:";
      }
      return this.getPrompt();
    }

    if (this.step === 3) {
      if (upper === 'RULED' || upper === 'R') {
        this.isRuled = true;
        this.step = 4;
      } else if (upper === 'SMOOTH' || upper === 'S' || text === '') {
        this.isRuled = false;
        this.step = 4;
      } else {
        return "Invalid option. Transition [Ruled/Smooth] <Smooth>:";
      }

      if (this.step === 4) {
        return this.executeLoft(id, doc);
      }
    }

    return this.getPrompt();
  }

  private getPointsFromEntity(entity: Entity): {x: number, y: number, z: number}[] {
    const points: {x: number, y: number, z: number}[] = [];
    const elevation = entity.elevation || 0;
    
    if (entity instanceof Polyline) {
      return entity.vertices.map(v => ({ x: v.x, y: v.y, z: elevation }));
    } else if (entity instanceof Point) {
      return [{ x: entity.x, y: entity.y, z: elevation }];
    } else if (entity instanceof Circle) {
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: entity.cx + entity.r * Math.cos(angle),
          y: entity.cy + entity.r * Math.sin(angle),
          z: elevation
        });
      }
      return points;
    }
    return points;
  }

  private async executeLoft(newId: string, doc?: IDocument): Promise<CommandResponse> {
    const occService = OpenCascadeService.getInstance();
    
    try {
      const facetres = doc?.facetres ?? 5.0;
      const deflection = 0.1 / facetres;
      
      const profilesData = this.profiles.map(p => ({
        id: p.id,
        points: this.getPointsFromEntity(p),
        closed: p instanceof Circle || (p instanceof Polyline && p.closed)
      }));
      
      // We will need to implement createLoft in OpenCascadeService!
      const geometry = await (occService as any).createLoft(profilesData, this.isSolid, this.isRuled, deflection, newId);
      
      const positions = Array.from(geometry.attributes.position.array as Float32Array);
      const indices = Array.from(geometry.index.array as Uint16Array | Uint32Array);
      
      const solid = new Solid3D(newId, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      
      // Carry layer from the first profile
      if (this.profiles.length > 0) {
        solid.layer = this.profiles[0].layer;
      }

      return {
        action: "loft_result",
        result: solid,
        deleteIds: [] // Do not delete profiles by default
      } as CommandAction;
      
    } catch (error: any) {
      return `Error creating loft: ${error.message}`;
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 1) {
      if (doc) {
        const tolerance = 5; // Default tolerance
        const entity = SelectionEngine.getEntityAtSpatial(x, y, tolerance, doc);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
    }
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 1) {
      return `Select profiles in order (Selected: ${this.profiles.length}). Press Enter to finish:`;
    }
    if (this.step === 2) return "Mode [Solid/Surface] <Solid>:";
    if (this.step === 3) return "Transition [Ruled/Smooth] <Smooth>:";
    return "Press Enter to complete.";
  }
}
