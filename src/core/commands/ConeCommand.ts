import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import * as THREE from "three";

export class ConeCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  radius: number | null = null;
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: any, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.center = { x, y, z: currentZ };
      this.step = 1;
      return `Center point: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)} Specify radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.radius = Math.sqrt(dx * dx + dy * dy);
      this.step = 2;
      return `Radius: ${FormatUtils.formatDistance(this.radius, units)}. Specify height:`;
    } else if (this.step === 2) {
      if (!this.center || this.radius === null) return "Error: Center or radius not set.";
      const height = z !== undefined ? z - this.center.z : 0;
      if (height === 0) return "Specify height:";
      const facetres = doc ? doc.facetres : 0.5;
      const deflection = 0.1 / facetres;
      return this.executeCreate(id, this.radius, height, deflection);
    }
    return "Specify height:";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const radius = parseFloat(text);
      if (isNaN(radius) || radius <= 0) {
        return "Invalid radius. Specify radius:";
      }
      this.radius = radius;
      this.step = 2;
      return "Specify height:";
    }

    if (this.step === 2) {
      const height = parseFloat(text);
      if (isNaN(height) || height === 0) {
        return "Invalid height. Specify height:";
      }

      if (!this.center || this.radius === null) return "Error: Center or radius not set.";

      const rx = this.radius;
      const h = height;
      const facetres = doc ? doc.facetres : 0.5;
      const deflection = 0.1 / facetres;

      return this.executeCreate(id, rx, h, deflection);
    }
  }

  private executeCreate(id: string, radius: number, height: number, deflection: number): Promise<CommandResponse> {
    return this.occService.createCone(this.center!.x, this.center!.y, this.center!.z, radius, height, deflection).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices);
      this.step = 0; // Reset
      return solid;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating cone: ${err.message || err.toString()}`;
    });
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "CONE specify center point:";
    if (this.step === 1) return "Specify radius:";
    return "Specify height:";
  }
}
