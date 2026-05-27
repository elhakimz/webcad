import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { Solid3D } from "../model/Solid3D";
import { Selection3DEngine } from "../engine/Selection3DEngine";

export class SFilletCommand implements Command {
  step = 1; // 1: radius, 2: select edge/face
  static lastRadius = 5.0;
  radius = SFilletCommand.lastRadius;
  entityId: string | null = null;
  edgeIndex: number | null = null;
  face1: number | null = null;

  constructor(selection?: string[]) {
    if (selection && selection.length > 0) {
      this.entityId = selection[0];
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    // Step 1: Enter Radius
    if (this.step === 1) {
      if (val === "" || val === "ENTER") {
        this.step = 2;
        return this.getPrompt();
      }
      const r = parseFloat(val);
      if (!isNaN(r)) {
        this.radius = r;
        SFilletCommand.lastRadius = this.radius;
        this.step = 2;
        return this.getPrompt();
      }
      return "Invalid radius. Enter fillet radius <" + this.radius.toFixed(2) + ">:";
    }

    // Step 2: Select Edge or Face
    if (this.step === 2 || this.step === 5) {
      if (val === "" || val === "ENTER") {
        return { action: 'close' }; // Finish continuous selection
      }

      if (text.startsWith("EDGE:")) {
        const parts = text.split(":");
        if (parts.length >= 3) {
          this.entityId = parts[1];
          this.edgeIndex = parseInt(parts[2]);
          this.face1 = null; // Clear face selection if edge clicked
          
          let visualP1: {x:number, y:number, z:number} | undefined = undefined;
          let visualP2: {x:number, y:number, z:number} | undefined = undefined;
          
          if (parts.length >= 5) {
             const p1Parts = parts[3].split(',');
             const p2Parts = parts[4].split(',');
             if (p1Parts.length === 3 && p2Parts.length === 3) {
                visualP1 = { x: parseFloat(p1Parts[0]), y: parseFloat(p1Parts[1]), z: parseFloat(p1Parts[2]) };
                visualP2 = { x: parseFloat(p2Parts[0]), y: parseFloat(p2Parts[1]), z: parseFloat(p2Parts[2]) };
             }
          }
          
          return {
            action: "fillet_solid",
            id: this.entityId,
            value: this.edgeIndex,
            radius: this.radius,
            visualP1,
            visualP2
          } as any;
        }
      }

      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        if (parts.length === 3) {
          const newEntityId = parts[1];
          const faceIdx = parseInt(parts[2]);

          if (this.face1 === null || newEntityId !== this.entityId) {
            this.entityId = newEntityId;
            this.face1 = faceIdx;
            this.step = 5; // Waiting for second face
            return "Select adjacent face to fillet shared edge:";
          } else {
            // Second face selected
            const face2 = faceIdx;
            if (this.face1 === face2) return "Select a different, adjacent face:";
            
            if (doc && this.entityId) {
              const entity = doc.getEntity(this.entityId);
              if (entity instanceof Solid3D) {
                const sharedEdgeRes = Selection3DEngine.getSharedEdge(entity, this.face1, face2);
                if (sharedEdgeRes) {
                  this.edgeIndex = sharedEdgeRes.edgeIndex;
                  this.face1 = null; // Reset for next selection loop
                  this.step = 2;
                  
                  return {
                    action: "fillet_solid",
                    id: this.entityId,
                    value: this.edgeIndex,
                    radius: this.radius
                  } as CommandAction;
                } else {
                  this.face1 = null;
                  this.step = 2;
                  return "Faces do not share an edge. Select first face again:";
                }
              }
            }
          }
        }
      }
    }

    return this.getPrompt();
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step >= 2) {
      return { action: 'close' }; // Terminate on background click during selection
    }
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 1) return `Enter fillet radius <${this.radius.toFixed(2)}>:`;
    if (this.step === 2) return "Select edges or faces to fillet (Enter to finish):";
    if (this.step === 5) return "Select second (adjacent) face:";
    return "SFILLET Command";
  }

  getDynamicInput(_x: number, _y: number, _units: UnitsConfig): string[] | null {
    if (this.step === 1) return [`Radius: ${this.radius.toFixed(2)} (enter value)`];
    return null;
  }
}
