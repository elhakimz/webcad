import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService.js"
import * as THREE from 'three';
import { GeneratorProgressModal } from "../../ui/GeneratorProgressModal.js"


export class BooleanCommand implements Command {
  step = 0
  operation: 'fuse' | 'cut' | 'common'
  idA: string | null = null
  idB: string | null = null
  occService: OpenCascadeService

  constructor(operation: 'fuse' | 'cut' | 'common', selection?: string[]) {
    this.operation = operation
    this.occService = OpenCascadeService.getInstance()
    if (selection && selection.length > 0) {
      this.idA = selection[0]
      this.step = 1
      if (selection.length > 1) {
        this.idB = selection[1]
      }
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig, _doc?: IDocument): CommandResponse | Promise<CommandResponse> {
    return this.getPrompt()
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const val = text.trim()

    if (val.toUpperCase() === "E" || val.toUpperCase() === "EXIT") {
      return { action: "finish" }
    }

    if (this.step === 1 && val === "" && this.idB) {
      return this.executeBoolean(id, doc)
    }

    if (this.step === 0) {
      if (doc) {
        const entity = doc.getEntity(val)
        if (entity && entity instanceof Solid3D) {
          this.idA = val
          this.step = 1
          return "Select second solid (B):"
        }
      }
      return "Solid A not found. Select first solid (A):"
    }

    if (this.step === 1) {
      if (doc) {
        const entity = doc.getEntity(val)
        if (entity && entity instanceof Solid3D) {
          if (val === this.idA) {
            return "Cannot operate on the same solid. Select second solid (B):"
          }
          this.idB = val
          return this.executeBoolean(id, doc)
        }
      }
      return "Solid B not found. Select second solid (B):"
    }
  }

  private async ensureShapeCached(entityId: string, doc?: IDocument): Promise<void> {
    // Try to prime the worker cache by importing the solid's brepSnapshot
    const entity = doc?.getEntity(entityId) as any;
    if (entity?.brepSnapshot) {
      try {
        await this.occService.importBRep(entityId, entity.brepSnapshot);
      } catch (e) {
        // Ignore — if it was already cached the worker will still have it
      }
    }
  }

  private executeBoolean(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.idA || !this.idB) return Promise.resolve("Missing required parameters.")

    const progress = new GeneratorProgressModal("Boolean Operation");
    progress.show();
    progress.update(10, `Initializing ${this.operation.toUpperCase()}...`);

    const facetres = doc ? doc.facetres : 5.0
    const deflection = 0.1 / facetres

    const entityA = doc?.getEntity(this.idA!) as any;
    const entityB = doc?.getEntity(this.idB!) as any;
    const rotA = entityA?.rotation || { x: 0, y: 0, z: 0 };
    const rotB = entityB?.rotation || { x: 0, y: 0, z: 0 };

    const centerA = entityA?.position || { x: 0, y: 0, z: 0 };
    const centerB = entityB?.position || { x: 0, y: 0, z: 0 };

    // Ensure both shapes are in the OCC worker cache before attempting the boolean
    progress.update(25, "Preparing operands in kernel cache...");
    return Promise.all([
      this.ensureShapeCached(this.idA!, doc),
      this.ensureShapeCached(this.idB!, doc),
    ]).then(() => {
      progress.update(50, `Executing OpenCascade B-Rep ${this.operation.toUpperCase()}...`);
      return (this.occService as any).createBoolean(this.operation, this.idA, this.idB, id, deflection);
    })
      .then(async (geometry: any) => {
        progress.update(85, "Rebuilding 3D boundary representation...");
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        const solid = new Solid3D(id, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);

        if (doc) {
          const entA = doc.getEntity(this.idA!);
          if (entA) solid.layer = entA.layer;
        }

        this.step = 0;
        if (!geometry.userData?.brepSnapshot) {
          console.warn("[BooleanCommand] BREP snapshot missing from worker response.");
        } else {
          solid.brepSnapshot = geometry.userData.brepSnapshot;
        }

        progress.update(100, "Boolean operation successfully completed!");
        await new Promise(resolve => setTimeout(resolve, 300));
        progress.close();

        return {
          action: "boolean_result",
          result: solid,
          deleteIds: [this.idA!, this.idB!]
        } as unknown as CommandResponse;
      })
      .catch(async (err: any) => {
        this.step = 0;
        progress.update(0, `Error: ${err.message || err.toString()}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        progress.close();
        return `Error performing boolean: ${err.message || err.toString()}`;
      });
  }

  getPrompt() {
    if (this.step === 0) return `${this.operation.toUpperCase()} Select first solid (A):`
    if (this.step === 1) return "Select second solid (B):"
    return ""
  }

  getPreview(_x: number, _y: number, _units: UnitsConfig) {
    return null
  }
}
