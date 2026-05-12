import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Solid3D } from "../model/Solid3D"
import { OpenCascadeService } from "../io/OpenCascadeService.js"
import * as THREE from 'three';

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

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse | Promise<CommandResponse> {
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

  private executeBoolean(id: string, doc?: IDocument): Promise<CommandResponse> {
    if (!this.idA || !this.idB) return Promise.resolve("Missing required parameters.")
    
    const facetres = doc ? doc.facetres : 5.0
    const deflection = 0.1 / facetres
    

    
    const entityA = doc?.getEntity(this.idA!) as any;
    const entityB = doc?.getEntity(this.idB!) as any;
    const rotA = entityA?.rotation || { x: 0, y: 0, z: 0 };
    const rotB = entityB?.rotation || { x: 0, y: 0, z: 0 };

    const centerA = { x: 0, y: 0, z: 0 };
    const centerB = { x: 0, y: 0, z: 0 };

    if (entityA && entityA.positions) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(entityA.positions, 3));
      geo.computeBoundingBox();
      const c = geo.boundingBox!.getCenter(new THREE.Vector3());
      
      const posA = entityA.position || { x: 0, y: 0, z: 0 };
      centerA.x = c.x + posA.x;
      centerA.y = c.y + posA.y;
      centerA.z = c.z + posA.z;
    }

    if (entityB && entityB.positions) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(entityB.positions, 3));
      geo.computeBoundingBox();
      const c = geo.boundingBox!.getCenter(new THREE.Vector3());
      
      const posB = entityB.position || { x: 0, y: 0, z: 0 };
      centerB.x = c.x + posB.x;
      centerB.y = c.y + posB.y;
      centerB.z = c.z + posB.z;
    }

    return (this.occService as any).createBoolean(this.operation, this.idA, this.idB, id, deflection, rotA, rotB, centerA, centerB).then((geometry: any) => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[]
      const indices = Array.from(geometry.getIndex()?.array || []) as number[]
      
      const solid = new Solid3D(id, positions, indices)
      
      // Inherit layer from A
      if (doc) {
        const entityA = doc.getEntity(this.idA!)
        if (entityA) {
          solid.layer = entityA.layer
        }
      }
      
      this.step = 0 // Reset
      
      // Export BREP for rehydration!
      return this.occService.exportBRep(id).then((brepBytes) => {
        solid.brepSnapshot = brepBytes;
        return {
          action: "boolean_result",
          result: solid,
          deleteIds: [this.idA!, this.idB!]
        } as unknown as CommandResponse;
      }).catch((err) => {
        console.error("Failed to export BREP for new boolean result:", err);
        // Still return the solid!
        return {
          action: "boolean_result",
          result: solid,
          deleteIds: [this.idA!, this.idB!]
        } as unknown as CommandResponse;
      });
    }).catch((err: any) => {
      this.step = 0
      return `Error performing boolean: ${err.message || err.toString()}`
    })
  }

  getPrompt() {
    if (this.step === 0) return `${this.operation.toUpperCase()} Select first solid (A):`
    if (this.step === 1) return "Select second solid (B):"
    return ""
  }

  getPreview(x: number, y: number, units: UnitsConfig) {
    return null
  }
}
