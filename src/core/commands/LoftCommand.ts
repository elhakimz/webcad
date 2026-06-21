import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { Circle } from "../model/Circle"
import { Polyline } from "../model/Polyline"
import { Point } from "../model/Point"
import { OpenCascadeService } from "../io/OpenCascadeService"
import { Solid3D } from "../model/Solid3D"
import { SelectionEngine } from "../engine/SelectionEngine"
import { GeneratorProgressModal } from "../../ui/GeneratorProgressModal"
import { bulgeToArc } from "../engine/MathUtils"


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
      const count = entity.vertices.length;
      const limit = entity.closed ? count : count - 1;
      
      for (let i = 0; i < limit; i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % count];
        
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
      
      if (!entity.closed && count > 0) {
        const lastV = entity.vertices[count - 1];
        points.push({ x: lastV.x, y: lastV.y, z: elevation });
      }
      
      return points;
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
    const progress = new GeneratorProgressModal("Loft Operation");
    progress.show();
    
    try {
      console.log("executeLoft",newId)
      progress.update(15, "Analyzing loft profile geometry...");
      const facetres = doc?.facetres ?? 5.0;
      const deflection = 0.1 / facetres;
      
      const profilesData = this.profiles.map(p => ({
        id: p.id,
        points: this.getPointsFromEntity(p),
        closed: p instanceof Circle || (p instanceof Polyline && p.closed)
      }));

      console.log("executeLoft",profilesData)

      progress.update(45, "Running OpenCascade loft generation...");
      const geometry = await occService.createLoft(profilesData, this.isSolid, this.isRuled, deflection, newId);
      console.log("executeLoft",geometry)

      if (!geometry) {
        throw new Error('Loft geometry generation returned null or undefined');
      }
      
      progress.update(80, "Constructing solid boundary representation...");
      const positions = Array.from(geometry.attributes.position.array as Float32Array);
      if (!geometry.index) {
        throw new Error('Loft geometry is missing an index buffer');
      }
      const indices = Array.from(geometry.index.array as Uint16Array | Uint32Array);


      const solid = new Solid3D(newId, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      
      // Carry layer from the first profile
      if (this.profiles.length > 0) {
        solid.layer = this.profiles[0].layer;
      }

      console.log("executeLoft",solid)

      progress.update(100, "Loft successfully completed!");
      await new Promise(resolve => setTimeout(resolve, 300));

      return {
        action: "loft_result",
        result: solid,
        deleteIds: [] // Do not delete profiles by default
      } as CommandAction;
      
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      progress.update(0, `Error: ${msg}`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return `ERROR creating loft: ${msg}`;
    } finally {
      progress.close();
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
