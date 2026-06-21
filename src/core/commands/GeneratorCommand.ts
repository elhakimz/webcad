import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Point, bulgeToArc } from "../engine/MathUtils"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Line } from "../model/Line"
import { Arc } from "../model/Arc"

export class GeneratorCommand implements Command {
  step = 0
  generatorName = ""
  params: Record<string, unknown> = {}
  insertPoint: Point | null = null
  selectedEntity: Entity | null = null

  constructor(generatorName = "", params: Record<string, unknown> = {}) {
    this.generatorName = generatorName;
    this.params = params;
  }

  setEntity(entity: Entity) {
    this.selectedEntity = entity;
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 0) {
      if (val) {
        try {
          // Decode URL-encoded parameters to preserve JSON structure with spaces intact
          const decoded = decodeURIComponent(val);
          const parts = decoded.split(";");
          this.generatorName = parts[0];
          if (parts[1]) {
            this.params = JSON.parse(parts[1]) as Record<string, unknown>;
          }
        } catch {
          this.generatorName = val;
        }
      }
      this.step = 1;
      return "Select polyline/line/arc path entity, or click insertion point:";
    }

    // In step 1, if we received a string (like an entity ID) and a document is available
    if (this.step === 1 && doc) {
      const entity = doc.getEntity(val) || this.selectedEntity;
      if (entity) {
        let coords: number[][] | null = null;
        if (entity instanceof Polyline) {
          const elev = entity.elevation || 0;
          const tempCoords: number[][] = [];
          const numSegs = 24; // Smooth tessellation of bulged segments

          for (let i = 0; i < entity.vertices.length; i++) {
            const v1 = entity.vertices[i];
            const z1 = v1.z !== undefined ? v1.z : elev;
            
            // Add the current vertex
            tempCoords.push([v1.x, v1.y, z1]);

            // If there's a next segment, and it has a bulge, tessellate it
            if (i < entity.vertices.length - 1 || entity.closed) {
              const v2 = entity.vertices[(i + 1) % entity.vertices.length];
              const z2 = v2.z !== undefined ? v2.z : elev;

              if (v1.bulge && Math.abs(v1.bulge) >= 1e-6) {
                const arc = bulgeToArc(v1, v2, v1.bulge);
                if (arc) {
                  let sweep = arc.endAngle - arc.startAngle;
                  if (arc.ccw && sweep < 0) sweep += Math.PI * 2;
                  if (!arc.ccw && sweep > 0) sweep -= Math.PI * 2;

                  // Generate intermediate points (excluding start and end to avoid duplication!)
                  for (let j = 1; j < numSegs; j++) {
                    const t = j / numSegs;
                    const angle = arc.startAngle + t * sweep;
                    const px = arc.cx + arc.r * Math.cos(angle);
                    const py = arc.cy + arc.r * Math.sin(angle);
                    const pz = z1 + (z2 - z1) * t;
                    tempCoords.push([px, py, pz]);
                  }
                }
              }
            }
          }

          // If closed polyline, append a copy of the first vertex to make the path complete
          if (entity.closed && entity.vertices.length > 0) {
            const v0 = entity.vertices[0];
            tempCoords.push([v0.x, v0.y, v0.z !== undefined ? v0.z : elev]);
          }
          coords = tempCoords;
        } else if (entity instanceof Line) {
          const elev = entity.elevation || 0;
          coords = [
            [entity.x1, entity.y1, elev],
            [entity.x2, entity.y2, elev]
          ];
        } else if (entity instanceof Arc) {
          const elev = entity.elevation || 0;
          coords = [];
          const steps = 16;
          const sa = entity.startAngle;
          const ea = entity.endAngle;
          const ccw = entity.ccw;
          
          let diff = ea - sa;
          if (ccw && diff < 0) diff += 2 * Math.PI;
          if (!ccw && diff > 0) diff -= 2 * Math.PI;
          
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = sa + t * diff;
            const px = entity.cx + entity.r * Math.cos(angle);
            const py = entity.cy + entity.r * Math.sin(angle);
            coords.push([px, py, elev]);
          }
        }

        if (coords) {
          // Inject the extracted path into generator params
          this.params.path = coords;
          // Set insertion point to the first vertex of the path
          this.insertPoint = { x: coords[0][0], y: coords[0][1] };
          return this.finish();
        }
      }
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1 || this.step === 0) {
      this.insertPoint = { x, y };
      return this.finish();
    }
    return this.getPrompt();
  }

  private finish(): CommandResponse {
    const res: CommandAction = {
      action: "generator_placed",
      generator: this.generatorName,
      point: this.insertPoint!,
      params: this.params
    };
    this.step = 0;
    this.selectedEntity = null;
    return res;
  }

  getPrompt() {
    if (this.step === 0) return "Generator name:";
    if (this.step === 1) return "Select polyline/line/arc path entity, or click insertion point:";
    return "";
  }
}
