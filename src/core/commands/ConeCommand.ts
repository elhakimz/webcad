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
  height: number | null = null;
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: any, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;
    
    if (this.step === 0) {
      this.center = { x, y, z: currentZ };
      this.step = 1;
      return `Center point: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)} Specify base radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      this.radius = Math.sqrt(dx * dx + dy * dy);
      
      if (this.radius < 1e-6) {
        return "Base radius must be non-zero. Specify base radius:";
      }
      
      this.step = 2;
      return `Base radius: ${FormatUtils.formatDistance(this.radius, units)}. Specify height (move mouse up/down):`;
    } else if (this.step === 2) {
      if (!this.center || this.radius === null) return "Error: Center or radius not set.";
      const h = y - this.center.y;
      if (Math.abs(h) < 1e-6) {
        return "Height must be non-zero. Specify height (move mouse up/down):";
      }
      this.height = h;
      this.step = 3;
      return `Height: ${FormatUtils.formatDistance(h, units)}. Specify top radius (move mouse horizontally or press ENTER for 0):`;
    } else if (this.step === 3) {
      if (!this.center || this.radius === null || this.height === null) return "Error: Parameter missing.";
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r2 = Math.sqrt(dx * dx + dy * dy);
      return this.finishWithParams(this.height, r2, id, doc);
    }
    return "Specify base radius:";
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" && this.step !== 3) {
      return { action: "finish" };
    }
    if (val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const radius = parseFloat(text);
      if (isNaN(radius) || radius <= 0) {
        return "Invalid radius. Specify base radius:";
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
      this.height = height;
      this.step = 3;
      return "Specify top radius (move mouse horizontally or press ENTER for 0):";
    }

    if (this.step === 3) {
      let r2 = 0;
      if (text.trim() !== "") {
        r2 = parseFloat(text);
        if (isNaN(r2) || r2 < 0) {
          return "Invalid top radius. Specify top radius (or press ENTER for 0):";
        }
      }
      return this.finishWithParams(this.height!, r2, id, doc);
    }
  }

  private finishWithParams(height: number, r2: number, id: string, doc: any) {
    if (!this.center || this.radius === null) {
      this.step = 0;
      return "Error: Center or radius not set.";
    }

    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;
    
    return this.occService.createFrustum(this.center.x, this.center.y, this.center.z, this.radius, r2, height, deflection, id).then((geometry: THREE.BufferGeometry) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      
      const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      solid.brepSnapshot = geometry.userData?.brepSnapshot;
      solid.creationParams = {
        type: 'frustum',
        params: { x: this.center!.x, y: this.center!.y, z: this.center!.z, r1: this.radius!, r2: r2, h: height }
      };
      this.step = 0; // Reset
      return solid;
    }).catch((err: any) => {
      this.step = 0;
      return `Error creating cone/frustum: ${err.message || err.toString()}`;
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
        // 4 lines to apex (cone preview)
        new Line("v1", cx + r, cy, cx, cy, z, h),
        new Line("v2", cx - r, cy, cx, cy, z, h),
        new Line("v3", cx, cy + r, cx, cy, z, h),
        new Line("v4", cx, cy - r, cx, cy, z, h),
      ];
      return { type: 'entities' as const, entities };
    }
    if (this.step === 3 && this.center && this.radius !== null && this.height !== null) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r2 = Math.sqrt(dx * dx + dy * dy);
      const h = this.height;
      const z = this.center.z;
      const r1 = this.radius;
      const cx = this.center.x;
      const cy = this.center.y;

      const circleBottom = new Circle("cb", cx, cy, r1);
      circleBottom.elevation = z;

      const circleTop = new Circle("ct", cx, cy, r2);
      circleTop.elevation = z + h;

      const entities = [
        circleBottom,
        circleTop,
        // 4 lines connecting bottom and top circles
        new Line("v1", cx + r1, cy, cx + r2, cy, z, h),
        new Line("v2", cx - r1, cy, cx - r2, cy, z, h),
        new Line("v3", cx, cy + r1, cx, cy + r2, z, h),
        new Line("v4", cx, cy - r1, cx, cy - r2, z, h),
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
        `R1: ${FormatUtils.formatDistance(r, units)} (enter value)`
      ];
    }
    if (this.step === 2 && this.center) {
      const h = y - this.center.y;
      return [
        `H: ${FormatUtils.formatDistance(h, units)} (enter value)`
      ];
    }
    if (this.step === 3 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const r2 = Math.sqrt(dx * dx + dy * dy);
      return [
        `R2: ${FormatUtils.formatDistance(r2, units)} (enter value or press ENTER for 0)`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "CONE/FRUSTUM specify center point:";
    if (this.step === 1) return "Specify base radius (R1):";
    if (this.step === 2) return "Specify height (move mouse up/down or enter value):";
    return "Specify top radius (R2) [move mouse horizontally or press ENTER for 0]:";
  }
}
