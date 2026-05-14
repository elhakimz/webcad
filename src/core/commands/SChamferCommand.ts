import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { Solid3D } from "../model/Solid3D";
import { Selection3DEngine } from "../engine/Selection3DEngine";

export class SChamferCommand implements Command {
  step = 1;
  static lastDistance = 5.0;
  distance = SChamferCommand.lastDistance;
  entityId: string | null = null;
  edgeIndex: number | null = null;
  face1: number | null = null;
  face2: number | null = null;
  mode: 'EDGE' | 'FACE' = 'EDGE';

  constructor(selection?: string[]) {
    if (selection && selection.length > 0) {
      this.entityId = selection[0];
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    // Handle Distance option at any time if we are in edge selection or mode selection
    if (val === "D" || val === "DISTANCE") {
      this.step = 10; // State for entering distance
      return `Enter chamfer distance <${this.distance}>:`;
    }

    if (this.step === 10) {
      const d = parseFloat(val);
      this.distance = isNaN(d) ? SChamferCommand.lastDistance : d;
      SChamferCommand.lastDistance = this.distance;
      this.step = 1; // Go back to edge selection mode
      return "Select edge by [E]dge or [F]aces <Edge>:";
    }

    if (this.step === 1) {
      if (val === "F" || val === "FACES") {
        this.mode = 'FACE';
        this.step = 2;
        return "Select first face (Ctrl+Shift+Click):";
      } else if (val === "E" || val === "EDGE" || val === "") {
        this.mode = 'EDGE';
        this.step = 3;
        return "Select edge (Ctrl+Click):";
      }
    }

    if (this.step === 2) {
      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        if (parts.length === 3) {
          this.entityId = parts[1];
          this.face1 = parseInt(parts[2]);
          this.step = 5;
          return "Select second face to find shared edge, or press Enter to apply to all edges of this face:";
        }
      }
      return "Please select a face using Ctrl+Shift+Click.";
    }

    if (this.step === 5) {
      if (val === "" || val === "ENTER") {
        this.step = 4;
        return `Applying to all edges of face ${this.face1}. Enter chamfer distance <${this.distance}>:`;
      }
      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        if (parts.length === 3) {
          this.face2 = parseInt(parts[2]);
          
          if (this.face1 !== null && doc && this.entityId) {
            const entity = doc.getEntity(this.entityId);
            if (entity instanceof Solid3D) {
              const sharedEdgeRes = Selection3DEngine.getSharedEdge(entity, this.face1, this.face2);
              if (sharedEdgeRes) {
                this.edgeIndex = sharedEdgeRes.edgeIndex;
                this.step = 4;
                return `Shared edge found: ${this.edgeIndex}. Enter chamfer distance <${this.distance}>:`;
              } else {
                this.step = 2;
                return "Faces do not share an edge. Select first face again:";
              }
            }
          }
        }
      }
      return "Please select a face using Ctrl+Shift+Click.";
    }

    if (this.step === 3) {
      if (text.startsWith("EDGE:")) {
        const parts = text.split(":");
        if (parts.length === 3) {
          this.entityId = parts[1];
          this.edgeIndex = parseInt(parts[2]);
          this.step = 4;
          return `Edge ${this.edgeIndex} selected. Enter chamfer distance <${this.distance}>:`;
        }
      }
      return "Please select an edge using Ctrl+Click.";
    }

    if (this.step === 4) {
      const d = parseFloat(val);
      this.distance = isNaN(d) ? this.distance : d;
      SChamferCommand.lastDistance = this.distance;

      if (this.entityId) {
        if (this.edgeIndex !== null) {
          return {
            action: "chamfer_solid",
            id: this.entityId,
            value: this.edgeIndex,
            radius: this.distance
          } as CommandAction;
        } else if (this.face1 !== null) {
          return {
            action: "chamfer_solid_face",
            id: this.entityId,
            faceIndex: this.face1,
            radius: this.distance
          } as CommandAction;
        }
      }
    }

    return this.getPrompt();
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 0) return "SCHAMFER Select solid:";
    if (this.step === 1) return "Select edge by [E]dge or [F]aces <Edge>:";
    if (this.step === 2) return "Select first face:";
    if (this.step === 3) return "Select edge (Ctrl+Click):";
    if (this.step === 4) return `Enter chamfer distance <${this.distance.toFixed(2)}>:`;
    if (this.step === 5) return "Select second face:";
    if (this.step === 10) return `Enter chamfer distance <${this.distance.toFixed(2)}>:`;
    return "SCHAMFER Command";
  }
}
