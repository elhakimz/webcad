import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService.js";
import { Polyline } from "../model/Polyline";

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
      
      if (!this.p1) return "Error: First corner not set.";

      const dx = Math.abs(this.p2.x - this.p1.x);
      const dy = Math.abs(this.p2.y - this.p1.y);
      const dz = Math.abs(this.p2.z - this.p1.z);
      
      if (dz < 1e-6) {
        this.step = 2;
        return `Base defined. Specify height:`;
      }
      
      const minX = Math.min(this.p1.x, this.p2.x);
      const minY = Math.min(this.p1.y, this.p2.y);
      const minZ = Math.min(this.p1.z, this.p2.z);
      
      const facetres = doc ? doc.facetres : 5.0;
      const deflection = 0.1 / facetres;
      
      return this.occService.createBox(minX, minY, minZ, dx, dy, dz, deflection, id).then((geometry: any) => {
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        
        const solid = new Solid3D(id, positions, indices);
        solid.creationParams = {
          type: 'box',
          params: { x: minX, y: minY, z: minZ, dx, dy, dz }
        };
        this.step = 0; // Reset
        return solid;
      }).catch((err: any) => {
        this.step = 0;
        return `Error creating box: ${err.message || err.toString()}`;
      });
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

      if (!this.p1 || !this.p2) return "Error: Points not set.";

      const dx = Math.abs(this.p2.x - this.p1.x);
      const dy = Math.abs(this.p2.y - this.p1.y);
      const dz = Math.abs(height);
      
      const minX = Math.min(this.p1.x, this.p2.x);
      const minY = Math.min(this.p1.y, this.p2.y);
      const minZ = Math.min(this.p1.z, this.p2.z);

      const actualMinZ = height < 0 ? minZ + height : minZ;
      const facetres = doc ? doc.facetres : 5.0;
      const deflection = 0.1 / facetres;

      return this.occService.createBox(minX, minY, actualMinZ, dx, dy, dz, deflection, id).then((geometry: any) => {
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        const solid = new Solid3D(id, positions, indices);
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
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    if (this.step === 1 && this.p1) {
      const vertices = [
        { x: this.p1.x, y: this.p1.y, bulge: 0 },
        { x: x, y: this.p1.y, bulge: 0 },
        { x: x, y: y, bulge: 0 },
        { x: this.p1.x, y: y, bulge: 0 }
      ];
      return new Polyline("preview", vertices, true);
    }
    if (this.step === 2 && this.p1) {
      // Height step, return the base rectangle
      const vertices = [
        { x: this.p1.x, y: this.p1.y, bulge: 0 },
        { x: this.p2!.x, y: this.p1.y, bulge: 0 },
        { x: this.p2!.x, y: this.p2!.y, bulge: 0 },
        { x: this.p1.x, y: this.p2!.y, bulge: 0 }
      ];
      return new Polyline("preview", vertices, true);
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
    if (this.step === 2) {
      return [
        `H: (enter value)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "BOX specify first corner:";
    if (this.step === 2) return "Specify height:";
    return "Specify other corner:";
  }
}
