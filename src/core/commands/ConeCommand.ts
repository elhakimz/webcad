import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Circle } from "../model/Circle";
import { Line } from "../model/Line";
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
      
      if (this.radius < 1e-6) {
        return "Radius must be non-zero. Specify radius:";
      }
      
      this.step = 2;
      return `Radius: ${FormatUtils.formatDistance(this.radius, units)}. Specify height (move mouse up/down):`;
    } else if (this.step === 2) {
      if (!this.center || this.radius === null) return "Error: Center or radius not set.";
      const height = y - this.center.y; // Interaction: up increases, down decreases
      return this.finishWithHeight(height, id, doc);
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
      return this.finishWithHeight(height, id, doc);
    }
  }

  private finishWithHeight(height: number, id: string, doc: any) {
    if (!this.center || this.radius === null) {
      this.step = 0;
      return "Error: Center or radius not set.";
    }

    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    return this.occService.createCone(this.center.x, this.center.y, this.center.z, this.radius, height, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'cone',
        params: { x: this.center!.x, y: this.center!.y, z: this.center!.z, r: this.radius!, h: height }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating cone: ${err.message || err.toString()}`;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig, _doc?: IDocument): PreviewObject | null {
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
    if (this.step === 2 && this.center && this.radius !== null) {
      const h = y - this.center.y;
      const z = this.center.z;
      const r = this.radius;
      const cx = this.center.x;
      const cy = this.center.y;

      const circleBottom = new Circle("cb", cx, cy, r);
      circleBottom.elevation = z;

      const entities = [
        circleBottom,
        // 4 lines to apex
        new Line("v1", cx + r, cy, cx, cy, z, h),
        new Line("v2", cx - r, cy, cx, cy, z, h),
        new Line("v3", cx, cy + r, cx, cy, z, h),
        new Line("v4", cx, cy - r, cx, cy, z, h),
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
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      return [
        `R: ${FormatUtils.formatDistance(r, units)} (enter value)`
      ];
    }
    if (this.step === 2 && this.center) {
      const h = y - this.center.y;
      return [
        `H: ${FormatUtils.formatDistance(h, units)} (enter value)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "CONE specify center point:";
    if (this.step === 1) return "Specify radius:";
    return "Specify height (move mouse up/down or enter value):";
  }
}
