import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Polyline } from "../model/Polyline";
import { Line } from "../model/Line";
import * as THREE from "three";

/**
 * PYRAMID Command
 * Step 0: Specify center point
 * Step 1: Specify base radius
 * Step 2: Specify height
 */
export class PyramidCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  radius: number | null = null;
  sides: number = 4;
  occService: OpenCascadeService;
  private isExecuting: boolean = false;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.center = { x, y, z: currentZ };
      this.step = 1;
      return `PYRAMID Center: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)}. Specify base radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.radius = Math.sqrt(dx * dx + dy * dy);
      
      if (this.radius < 1e-6) {
        return "Radius must be non-zero. Specify base radius:";
      }
      
      this.step = 2;
      return `Base Radius: ${FormatUtils.formatDistance(this.radius, units)}. Specify height:`;
    } else if (this.step === 2) {
      if (!this.center || this.radius === null) return "Error: Center or radius not set.";
      const height = y - this.center.y; // Interaction
      
      if (Math.abs(height) < 1e-6) {
         return "Height must be non-zero. Specify height:";
      }

      return this.executeCreate(id, height, doc);
    }
    return "Specify height:";
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (val.startsWith("S")) {
      const s = parseInt(val.substring(1));
      if (!isNaN(s) && s >= 3) {
        this.sides = s;
        return `Sides set to ${s}. ${this.getPrompt()}`;
      }
    }

    if (this.step === 1) {
      const r = parseFloat(text);
      if (isNaN(r) || r <= 0) {
        return "Invalid radius. Specify base radius:";
      }
      this.radius = r;
      this.step = 2;
      return "Specify height:";
    }

    if (this.step === 2) {
      const h = parseFloat(text);
      if (isNaN(h) || h === 0) {
        return "Invalid height. Specify height:";
      }
      return this.executeCreate(id, h, doc);
    }
  }

  private executeCreate(id: string, height: number, doc?: IDocument): Promise<CommandResponse> {
    if (!this.center || this.radius === null) {
      this.step = 0;
      return Promise.resolve("Error: Parameters not set.");
    }

    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    this.isExecuting = true;
    const center = this.center;
    const radius = this.radius;
    const sides = this.sides;

    return this.occService.createPyramid(center.x, center.y, center.z, sides, radius, height, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'pyramid',
        params: { x: center.x, y: center.y, z: center.z, sides, radius, height }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating pyramid: ${msg}`;
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0) {
        const vertices = [];
        for (let i = 0; i < this.sides; i++) {
          const ang = (i / this.sides) * 2 * Math.PI;
          vertices.push({ x: this.center.x + r * Math.cos(ang), y: this.center.y + r * Math.sin(ang), bulge: 0 });
        }
        const poly = new Polyline("preview", vertices, true);
        poly.elevation = this.center.z;
        return poly;
      }
    }
    if (this.step === 2 && this.center && this.radius !== null) {
      const h = y - this.center.y;
      const cx = this.center.x;
      const cy = this.center.y;
      const cz = this.center.z;
      const r = this.radius;

      const baseVertices = [];
      const lines = [];
      for (let i = 0; i < this.sides; i++) {
        const ang = (i / this.sides) * 2 * Math.PI;
        const px = cx + r * Math.cos(ang);
        const py = cy + r * Math.sin(ang);
        baseVertices.push({ x: px, y: py, bulge: 0 });
        lines.push(new Line(`v${i}`, px, py, cx, cy, cz, h));
      }
      const base = new Polyline("base", baseVertices, true);
      base.elevation = cz;

      return { type: 'entities', entities: [base, ...lines] };
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 0) {
      return [`X: ${FormatUtils.formatDistance(x, units)}`, `Y: ${FormatUtils.formatDistance(y, units)}` ];
    }
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      return [`Radius: ${FormatUtils.formatDistance(Math.sqrt(dx*dx + dy*dy), units)}` ];
    }
    if (this.step === 2 && this.center) {
      return [`Height: ${FormatUtils.formatDistance(y - this.center.y, units)}` ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "PYRAMID specify center point or [Sides(S)]:";
    if (this.step === 1) return `Specify base radius (Sides: ${this.sides}):`;
    return "Specify height:";
  }

  getOptions() {
    return ["Sides"];
  }
}
