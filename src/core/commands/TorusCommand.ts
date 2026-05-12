import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService.js";
import * as THREE from "three";

export class TorusCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  majorRadius: number | null = null;
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: any, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.center = { x, y, z: currentZ };
      this.step = 1;
      return `Center point: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)} Specify major radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.majorRadius = Math.sqrt(dx * dx + dy * dy);
      this.step = 2;
      return `Major radius: ${FormatUtils.formatDistance(this.majorRadius, units)}. Specify minor radius:`;
    }
    return "Specify minor radius:";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const radius = parseFloat(text);
      if (isNaN(radius) || radius <= 0) {
        return "Invalid major radius. Specify major radius:";
      }
      this.majorRadius = radius;
      this.step = 2;
      return "Specify minor radius:";
    }

    if (this.step === 2) {
      const minorRadius = parseFloat(text);
      if (isNaN(minorRadius) || minorRadius <= 0) {
        return "Invalid minor radius. Specify minor radius:";
      }

      const center = this.center;
      if (!center) return "Error: Center not set.";
      if (this.majorRadius === null) return "Error: Major radius not set.";

      const r1 = this.majorRadius;
      const r2 = minorRadius;
      const facetres = doc ? doc.facetres : 0.5;
      const deflection = 0.1 / facetres;

      return this.occService.createTorus(center.x, center.y, center.z, r1, r2, deflection, id).then((geometry: THREE.BufferGeometry) => {
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        
        const solid = new Solid3D(id, positions, indices);
        solid.creationParams = {
          type: 'torus',
          params: { x: center.x, y: center.y, z: center.z, r1, r2 }
        };
        this.step = 0; // Reset
        return solid;
      }).catch((err: any) => {
        this.step = 0;
        return `Error creating torus: ${err.message || err.toString()}`;
      });
    }
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "TORUS specify center point:";
    if (this.step === 1) return "Specify major radius:";
    return "Specify minor radius:";
  }
}
