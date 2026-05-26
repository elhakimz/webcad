import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Polyline } from "../model/Polyline";
import { Line } from "../model/Line";
import * as THREE from "three";

/**
 * WEDGE Command
 * Step 0: First corner
 * Step 1: Other corner (defines base DX, DY)
 * Step 2: Height (DZ)
 * Step 3: Top Length X (LTX)
 */
export class WedgeCommand implements Command {
  step = 0;
  p1: { x: number; y: number; z: number } | null = null;
  dx: number | null = null;
  dy: number | null = null;
  dz: number | null = null;
  occService: OpenCascadeService;
  private isExecuting: boolean = false;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.p1 = { x, y, z: currentZ };
      this.step = 1;
      return `WEDGE First corner: ${FormatUtils.formatPoint(x, y, units, "P1", currentZ)}. Specify other corner:`;
    } else if (this.step === 1) {
      if (!this.p1) return "Error: First corner not set.";
      this.dx = x - this.p1.x;
      this.dy = y - this.p1.y;
      
      if (Math.abs(this.dx) < 1e-6 || Math.abs(this.dy) < 1e-6) {
        return "Base dimensions must be non-zero. Specify other corner:";
      }
      
      this.step = 2;
      return `Base: ${FormatUtils.formatDistance(this.dx, units)} x ${FormatUtils.formatDistance(this.dy, units)}. Specify height:`;
    } else if (this.step === 2) {
      if (!this.p1 || this.dx === null || this.dy === null) return "Error: Base not set.";
      this.dz = y - this.p1.y; // Simplified height interaction
      
      if (Math.abs(this.dz) < 1e-6) {
         return "Height must be non-zero. Specify height:";
      }

      this.step = 3;
      return `Height: ${FormatUtils.formatDistance(this.dz, units)}. Specify top length in X (LTX):`;
    } else if (this.step === 3) {
      if (!this.p1 || this.dx === null || this.dy === null || this.dz === null) return "Error: Wedge parameters not set.";
      const minX = Math.min(this.p1.x, this.p1.x + this.dx);
      const ltx = Math.abs(x - minX);
      return this.executeCreate(id, ltx, doc);
    }
    return "Specify top length:";
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
       // Coordinate input handled by app.ts calling onPoint
    }

    if (this.step === 2) {
      const h = parseFloat(text);
      if (isNaN(h) || h === 0) return "Invalid height. Specify height:";
      this.dz = h;
      this.step = 3;
      return "Specify top length X:";
    }

    if (this.step === 3) {
      const ltx = parseFloat(text);
      if (isNaN(ltx)) return "Invalid length. Specify top length X:";
      return this.executeCreate(id, ltx, doc);
    }
  }

  private executeCreate(id: string, ltx: number, doc?: IDocument): Promise<CommandResponse> {
    if (!this.p1 || this.dx === null || this.dy === null || this.dz === null) {
      this.step = 0;
      return Promise.resolve("Error: Parameters not set.");
    }

    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    this.isExecuting = true;
    const p1 = this.p1;
    const x2 = this.p1.x + this.dx;
    const y2 = this.p1.y + this.dy;
    const height = this.dz;

    return this.occService.createWedge(p1.x, p1.y, p1.z, x2, y2, height, ltx, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      
      // Calculate normalized params for storage
      const adx = Math.abs(this.dx!);
      const ady = Math.abs(this.dy!);
      const adz = Math.abs(this.dz!);
      const minX = Math.min(this.p1!.x, x2);
      const minY = Math.min(this.p1!.y, y2);
      const minZ = height < 0 ? p1.z + height : p1.z;

      solid.creationParams = {
        type: 'wedge',
        params: { x: minX, y: minY, z: minZ, dx: adx, dy: ady, dz: adz, ltx }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating wedge: ${msg}`;
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.p1) {
      const dx = x - this.p1.x;
      const dy = y - this.p1.y;
      if (Math.abs(dx) > 0 && Math.abs(dy) > 0) {
        const poly = new Polyline("preview", [
            { x: this.p1.x, y: this.p1.y, bulge: 0 },
            { x: x, y: this.p1.y, bulge: 0 },
            { x: x, y: y, bulge: 0 },
            { x: this.p1.x, y: y, bulge: 0 }
        ], true);
        poly.elevation = this.p1.z;
        return poly;
      }
    }
    if (this.step === 2 && this.p1 && this.dx !== null && this.dy !== null) {
      const h = y - this.p1.y;
      const minX = Math.min(this.p1.x, this.p1.x + this.dx);
      const minY = Math.min(this.p1.y, this.p1.y + this.dy);
      const z = this.p1.z;
      const adx = Math.abs(this.dx);
      const ady = Math.abs(this.dy);

      const base = new Polyline("b", [
        { x: minX, y: minY, bulge: 0 }, { x: minX + adx, y: minY, bulge: 0 },
        { x: minX + adx, y: minY + ady, bulge: 0 }, { x: minX, y: minY + ady, bulge: 0 }
      ], true);
      base.elevation = z;

      const top = base.clone("t");
      top.elevation = z + h;

      const v1 = new Line("v1", minX, minY, minX, minY, z, h);
      const v2 = new Line("v2", minX + adx, minY, minX + adx, minY, z, h);
      const v3 = new Line("v3", minX + adx, minY + ady, minX + adx, minY + ady, z, h);
      const v4 = new Line("v4", minX, minY + ady, minX, minY + ady, z, h);

      return { type: 'entities', entities: [base, top, v1, v2, v3, v4] };
    }
    if (this.step === 3 && this.p1 && this.dx !== null && this.dy !== null && this.dz !== null) {
        const minX = Math.min(this.p1.x, this.p1.x + this.dx);
        const minY = Math.min(this.p1.y, this.p1.y + this.dy);
        const z = this.p1.z;
        const adx = Math.abs(this.dx);
        const ady = Math.abs(this.dy);
        const adz = this.dz;

        const ltx = Math.abs(x - minX);
        const altx = Math.min(adx, Math.max(0, ltx));

        const base = new Polyline("b", [
            { x: minX, y: minY, bulge: 0 }, { x: minX + adx, y: minY, bulge: 0 },
            { x: minX + adx, y: minY + ady, bulge: 0 }, { x: minX, y: minY + ady, bulge: 0 }
        ], true);
        base.elevation = z;

        const top = new Polyline("t", [
            { x: minX, y: minY, bulge: 0 }, { x: minX + altx, y: minY, bulge: 0 },
            { x: minX + altx, y: minY + ady, bulge: 0 }, { x: minX, y: minY + ady, bulge: 0 }
        ], true);
        top.elevation = z + adz;

        const v1 = new Line("v1", minX, minY, minX, minY, z, adz);
        const v2 = new Line("v2", minX + adx, minY, minX + altx, minY, z, adz);
        const v3 = new Line("v3", minX + adx, minY + ady, minX + altx, minY + ady, z, adz);
        const v4 = new Line("v4", minX, minY + ady, minX, minY + ady, z, adz);

        return { type: 'entities', entities: [base, top, v1, v2, v3, v4] };
    }
    return null;
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 0) {
      return [`X: ${FormatUtils.formatDistance(x, units)}`, `Y: ${FormatUtils.formatDistance(y, units)}` ];
    }
    if (this.step === 1 && this.p1) {
      return [`DX: ${FormatUtils.formatDistance(x - this.p1.x, units)}`, `DY: ${FormatUtils.formatDistance(y - this.p1.y, units)}` ];
    }
    if (this.step === 2 && this.p1) {
      return [`H: ${FormatUtils.formatDistance(y - this.p1.y, units)}` ];
    }
    if (this.step === 3 && this.p1) {
      const minX = Math.min(this.p1.x, this.p1.x + this.dx!);
      return [`LTX: ${FormatUtils.formatDistance(Math.abs(x - minX), units)}` ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "WEDGE specify first corner:";
    if (this.step === 1) return "Specify other corner:";
    if (this.step === 2) return "Specify height:";
    return "Specify top length X (LTX):";
  }
}
