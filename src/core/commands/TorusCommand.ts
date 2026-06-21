import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Circle } from "../model/Circle";
import * as THREE from "three";

/**
 * TORUS Command
 * Step 0: Specify center point
 * Step 1: Specify major radius
 * Step 2: Specify minor radius
 */
export class TorusCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  rMajor: number | null = null;
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
      return `TORUS Center: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)}. Specify major radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.rMajor = Math.sqrt(dx * dx + dy * dy);
      
      if (this.rMajor < 1e-6) {
        return "Major radius must be non-zero. Specify major radius:";
      }
      
      this.step = 2;
      return `Major Radius: ${FormatUtils.formatDistance(this.rMajor, units)}. Specify minor (tube) radius:`;
    } else if (this.step === 2) {
      if (!this.center || this.rMajor === null) return "Error: Center or major radius not set.";
      const dx = x - (this.center.x + this.rMajor);
      const dy = y - this.center.y;
      const rMinor = Math.sqrt(dx * dx + dy * dy);
      
      if (rMinor < 1e-6) {
         return "Minor radius must be non-zero. Specify minor radius:";
      }

      return this.executeCreate(id, rMinor, doc);
    }
    return "Specify minor radius:";
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const r = parseFloat(text);
      if (isNaN(r) || r <= 0) {
        return "Invalid radius. Specify major radius:";
      }
      this.rMajor = r;
      this.step = 2;
      return "Specify minor (tube) radius:";
    }

    if (this.step === 2) {
      const r = parseFloat(text);
      if (isNaN(r) || r <= 0) {
        return "Invalid radius. Specify minor radius:";
      }
      return this.executeCreate(id, r, doc);
    }
  }

  private executeCreate(id: string, rMinor: number, doc?: IDocument): Promise<CommandResponse> {
    if (!this.center || this.rMajor === null) {
      this.step = 0;
      return Promise.resolve("Error: Center or major radius not set.");
    }

    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    this.isExecuting = true;
    const center = this.center;
    const r1 = this.rMajor;
    const r2 = rMinor;

    return this.occService.createTorus(center.x, center.y, center.z, r1, r2, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'torus',
        params: { x: center.x, y: center.y, z: center.z, r1: r1, r2: r2 }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating torus: ${msg}`;
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
        const circle = new Circle("preview", this.center.x, this.center.y, r);
        circle.elevation = this.center.z;
        return circle;
      }
    }
    if (this.step === 2 && this.center && this.rMajor !== null) {
      const dx = x - (this.center.x + this.rMajor);
      const dy = y - this.center.y;
      const r2 = Math.sqrt(dx * dx + dy * dy);
      if (r2 > 0) {
        const r1 = this.rMajor;
        const cx = this.center.x;
        const cy = this.center.y;
        const cz = this.center.z;

        // Visual guide: outer ring and inner ring
        const outer = new Circle("outer", cx, cy, r1 + r2);
        outer.elevation = cz;
        const inner = new Circle("inner", cx, cy, r1 - r2);
        inner.elevation = cz;
        const core = new Circle("core", cx, cy, r1);
        core.elevation = cz;
        
        return { type: 'entities', entities: [outer, inner, core] };
      }
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 0) {
      return [
        `X: ${FormatUtils.formatDistance(x, units)}`,
        `Y: ${FormatUtils.formatDistance(y, units)}`
      ];
    }
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      return [
        `Major R: ${FormatUtils.formatDistance(r, units)}`
      ];
    }
    if (this.step === 2 && this.center && this.rMajor !== null) {
      const dx = x - (this.center.x + this.rMajor);
      const dy = y - this.center.y;
      const r2 = Math.sqrt(dx * dx + dy * dy);
      return [
        `Minor R: ${FormatUtils.formatDistance(r2, units)}`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "TORUS specify center point:";
    if (this.step === 1) return "Specify major radius:";
    return "Specify minor (tube) radius:";
  }
}
