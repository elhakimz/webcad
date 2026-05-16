import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Polyline } from "../model/Polyline";
import { Line } from "../model/Line";

export class BoxCommand implements Command {
  step = 0;
  p1: { x: number; y: number; z: number } | null = null;
  p2: { x: number; y: number; z: number } | null = null;
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: any, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.p1 = { x, y, z: currentZ };
      this.step = 1;
      return `Corner 1: ${FormatUtils.formatPoint(x, y, units)} Z: ${currentZ.toFixed(2)}. Specify other corner:`;
    } else if (this.step === 1) {
      this.p2 = { x, y, z: currentZ };
      this.step = 2;
      return "Base defined. Specify height (move mouse up/down):";
    } else if (this.step === 2) {
      if (!this.p1) return "Error: First corner not set.";
      const height = y - this.p1.y; // Interaction: up increases, down decreases
      return this.finishWithHeight(height, id, doc);
    }
    return "Specify height:";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 2) {
      const height = parseFloat(text);
      if (isNaN(height) || height === 0) {
        return "Invalid height. Specify height:";
      }
      return this.finishWithHeight(height, id, doc);
    }
  }

  private finishWithHeight(height: number, id: string, doc: any) {
    if (!this.p1 || !this.p2) {
        this.step = 0;
        return "Error: Points not set.";
    }

    const dx = Math.abs(this.p2.x - this.p1.x);
    const dy = Math.abs(this.p2.y - this.p1.y);
    const dz = Math.abs(height);
    
    const minX = Math.min(this.p1.x, this.p2.x);
    const minY = Math.min(this.p1.y, this.p2.y);
    const minZ = this.p1.z;

    const actualMinZ = height < 0 ? minZ + height : minZ;
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;

    return this.occService.createBox(minX, minY, actualMinZ, dx, dy, dz, deflection, id).then((geometry: any) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'box',
        params: { x: minX, y: minY, z: actualMinZ, dx, dy, dz }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating box: ${err.message || err.toString()}`;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig, _doc?: IDocument): PreviewObject | null {
    if (this.step === 1 && this.p1) {
      const vertices = [
        { x: this.p1.x, y: this.p1.y, bulge: 0 },
        { x: x, y: this.p1.y, bulge: 0 },
        { x: x, y: y, bulge: 0 },
        { x: this.p1.x, y: y, bulge: 0 }
      ];
      return new Polyline("preview", vertices, true);
    }
    if (this.step === 2 && this.p1 && this.p2) {
      const h = y - this.p1.y;
      const minX = Math.min(this.p1.x, this.p2.x);
      const minY = Math.min(this.p1.y, this.p2.y);
      const maxX = Math.max(this.p1.x, this.p2.x);
      const maxY = Math.max(this.p1.y, this.p2.y);
      const z = this.p1.z;

      const entities = [
        // Base
        new Line("p", minX, minY, maxX, minY, z),
        new Line("p", maxX, minY, maxX, maxY, z),
        new Line("p", maxX, maxY, minX, maxY, z),
        new Line("p", minX, maxY, minX, minY, z),
        // Top
        new Line("p", minX, minY, maxX, minY, z + h),
        new Line("p", maxX, minY, maxX, maxY, z + h),
        new Line("p", maxX, maxY, minX, maxY, z + h),
        new Line("p", minX, maxY, minX, minY, z + h),
        // Verticals (using thickness for vertical lines)
        new Line("v1", minX, minY, minX, minY, z, h),
        new Line("v2", maxX, minY, maxX, minY, z, h),
        new Line("v3", maxX, maxY, maxX, maxY, z, h),
        new Line("v4", minX, maxY, minX, maxY, z, h),
      ];
      return { type: 'entities' as const, entities };
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
    if (this.step === 1 && this.p1) {
      const dx = x - this.p1.x;
      const dy = y - this.p1.y;
      return [
        `X: ${FormatUtils.formatDistance(x, units)}`,
        `Y: ${FormatUtils.formatDistance(y, units)}`,
        `DX: ${FormatUtils.formatDistance(dx, units)}`,
        `DY: ${FormatUtils.formatDistance(dy, units)}`
      ];
    }
    if (this.step === 2 && this.p1) {
      const h = y - this.p1.y;
      return [
        `H: ${FormatUtils.formatDistance(h, units)} (enter value)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "BOX specify first corner:";
    if (this.step === 1) return "Specify other corner:";
    return "Specify height (move mouse up/down or enter value):";
  }
}
