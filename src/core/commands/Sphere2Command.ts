import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Circle } from "../model/Circle";
import * as THREE from "three";

/**
 * SPHERE2 Command
 * Step 0: Specify center point
 * Step 1: Specify radius (via mouse distance or direct input)
 */
export class Sphere2Command implements Command {
  step = 0;
  center: { x: number; y: number; z: number } | null = null;
  radius: number | null = null;
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
      return `SPHERE2 Center: ${FormatUtils.formatPoint(x, y, units, "P", currentZ)}. Specify radius:`;
    } else if (this.step === 1) {
      if (!this.center) return "Error: Center not set.";
      
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      const dz = currentZ - this.center.z;
      // Using 3D distance for SPHERE2 to allow depth-sensitive radius definition
      const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (radius < 1e-6) {
        return "Radius must be non-zero. Specify radius:";
      }

      if (this.isExecuting) return "Creating sphere, please wait...";

      const facetres = doc ? doc.facetres : 0.5;
      const deflection = 0.1 / facetres;
      
      this.isExecuting = true;
      return this.executeCreate(id, radius, deflection);
    }
    return "Specify radius:";
  }

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim().toUpperCase();

    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 1) {
      const radius = parseFloat(text);
      if (isNaN(radius) || radius <= 0) {
        return "Invalid radius. Specify radius:";
      }
      if (this.isExecuting) return "Creating sphere, please wait...";

      const facetres = doc ? doc.facetres : 0.5;
      const deflection = 0.1 / facetres;
      
      this.isExecuting = true;
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
    }).catch((err: unknown) => {
      this.step = 0;
      const msg = err instanceof Error ? err.message : String(err);
      return `Error creating sphere: ${msg}`;
    }).finally(() => {
      this.isExecuting = false;
    });
  }

  getPreview(x: number, y: number, _units: UnitsConfig) {
    if (this.step === 1 && this.center) {
      const dx = x - this.center.x;
      const dy = y - this.center.y;
      // In preview, we stay 2D for the radius calculation if z isn't provided, 
      // but let's match the onPoint's 3D logic if we have a way to know current Z.
      // Since getPreview doesn't take Z, we'll assume current mouse plane (Z=0 usually).
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 0) {
        // Create a Three.js mesh for the solid preview
        const geometry = new THREE.SphereGeometry(r, 32, 32);
        const material = new THREE.MeshBasicMaterial({ 
          color: 0x00ff00, 
          transparent: true, 
          opacity: 0.3,
          wireframe: true 
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(this.center.x, this.center.y, this.center.z);
        
        // Wrap it in a way the viewer can handle or return a "Shape" proxy
        // For now, let's return a Circle for the outline and a Solid3D-like object if possible.
        // But our viewer expects Entity or specific helpers.
        // I'll return a Circle for now but with a comment that it's a "Solid" placeholder.
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
        `R: (${FormatUtils.formatDistance(r, units)})`
      ];
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "SPHERE2 specify center point:";
    return "Specify radius:";
  }
}
