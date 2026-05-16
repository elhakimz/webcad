import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Circle } from "../model/Circle";
import * as THREE from "three";

export class TorusCommand implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  minorRadius: number | null = null;
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
      return `Center point: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)} Specify minor diameter:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.minorRadius = Math.sqrt(dx * dx + dy * dy) / 2;
      this.step = 2;
      return `Minor diameter: ${FormatUtils.formatDistance(this.minorRadius * 2, units)}. Specify major diameter:`;
    } else if (this.step === 2) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.majorRadius = Math.sqrt(dx * dx + dy * dy) / 2;
      return this.finish(id, doc);
    }
    return "Specify major diameter:";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const diameter = parseFloat(text);
      if (isNaN(diameter) || diameter <= 0) {
        return "Invalid minor diameter. Specify minor diameter:";
      }
      this.minorRadius = diameter / 2;
      this.step = 2;
      return "Specify major diameter:";
    }

    if (this.step === 2) {
      const diameter = parseFloat(text);
      if (isNaN(diameter) || diameter <= 0) {
        return "Invalid major diameter. Specify major diameter:";
      }
      this.majorRadius = diameter / 2;
      return this.finish(id, doc);
    }
  }

  private finish(id: string, doc: any) {
    const center = this.center;
    if (!center || this.majorRadius === null || this.minorRadius === null) {
      this.step = 0;
      return "Error: Incomplete data.";
    }

    const r1 = this.majorRadius;
    const r2 = this.minorRadius;
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;

    return this.occService.createTorus(center.x, center.y, center.z, r1, r2, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
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

  getPreview(x: number, y: number, _units: UnitsConfig, _doc?: IDocument): PreviewObject | null {
    if (!this.center) return null;
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const currentRadius = Math.sqrt(dx * dx + dy * dy) / 2;

    if (this.step === 1) {
      // Step 1: Just show the minor diameter circle being defined
      return new Circle("PREVIEW_MINOR", this.center.x, this.center.y, currentRadius, this.center.z);
    } else if (this.step === 2 && this.minorRadius !== null) {
      // Step 2: Show the fixed minor diameter circle AND the major diameter circle preview
      return {
        type: 'entities' as const,
        entities: [
          new Circle("PREVIEW_MINOR_FIXED", this.center.x, this.center.y, this.minorRadius, this.center.z),
          new Circle("PREVIEW_MAJOR", this.center.x, this.center.y, currentRadius, this.center.z)
        ]
      };
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
    if (this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const label = this.step === 1 ? "Minor D:" : "Major D:";
      return [
        `${label} ${FormatUtils.formatDistance(d, units)} (enter value)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "TORUS specify center point:";
    if (this.step === 1) return "Specify minor diameter:";
    return "Specify major diameter:";
  }
}
