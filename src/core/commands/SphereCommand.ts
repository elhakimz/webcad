import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService.js";
import { Circle } from "../model/Circle";
import * as THREE from "three";

export class SphereCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig, doc?: any, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.center = { x, y, z: currentZ };
      this.step = 1;
      return `Center point: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)} Specify radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      
      const facetres = doc ? doc.facetres : 5.0;
      const deflection = 0.1 / facetres;
      return this.executeCreate(id, radius, deflection);
    }
    return "Specify radius:";
  }

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const radius = parseFloat(text);
      if (isNaN(radius) || radius <= 0) {
        return "Invalid radius. Specify radius:";
      }
      const facetres = doc ? doc.facetres : 5.0;
      const deflection = 0.1 / facetres;
      return this.executeCreate(id, radius, deflection);
    }
  }

  private executeCreate(id: string, radius: number, deflection?: number): Promise<CommandResponse> {
    const center = this.center;
    if (!center) return Promise.resolve("Error: Center not set.");
    
    return this.occService.createSphere(center.x, center.y, center.z, radius, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'sphere',
        params: { x: center.x, y: center.y, z: center.z, r: radius }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating sphere: ${err.message || err.toString()}`;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig) {
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0) {
        return new Circle("preview", this.center.x, this.center.y, r);
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
        `R: ${FormatUtils.formatDistance(r, units)} (enter value)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "SPHERE specify center point:";
    return "Specify radius:";
  }
}
