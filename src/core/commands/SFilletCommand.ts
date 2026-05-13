import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { Solid3D } from "../model/Solid3D";
import { Selection3DEngine } from "../engine/Selection3DEngine";

export class SFilletCommand implements Command {
  step = 1;
  static lastRadius = 5.0;
  radius = SFilletCommand.lastRadius;
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

    // Handle Radius option at any time if we are in edge selection or mode selection
    if (val === "R" || val === "RADIUS") {
      this.step = 10; // State for entering radius
      return `Enter fillet radius <${this.radius}>:`;
    }

    if (this.step === 10) {
      const r = parseFloat(val);
      this.radius = isNaN(r) ? SFilletCommand.lastRadius : r;
      SFilletCommand.lastRadius = this.radius;
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
          return "Select second face (Ctrl+Shift+Click):";
        }
      }
      return "Please select a face using Ctrl+Shift+Click.";
    }

    if (this.step === 5) {
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
                return `Shared edge found: ${this.edgeIndex}. Enter fillet radius <${this.radius}>:`;
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
          return `Edge ${this.edgeIndex} selected. Enter fillet radius <${this.radius}>:`;
        }
      }
      return "Please select an edge using Ctrl+Click.";
    }

    if (this.step === 4) {
      const r = parseFloat(val);
      this.radius = isNaN(r) ? this.radius : r;
      SFilletCommand.lastRadius = this.radius;

      if (this.entityId && this.edgeIndex !== null) {
        return {
          action: "fillet_solid" as any, // Cast to any since it's a new action
          id: this.entityId,
          value: this.edgeIndex, // Use value for edge index
          radius: this.radius
        } as CommandAction;
      }
    }

    return this.getPrompt();
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    // Points are handled by app.ts and converted to entity/sub-entity IDs passed via onInput
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 0) return "SFILLET Select solid:";
    if (this.step === 1) return "Select edge by [E]dge or [F]aces <Edge>:";
    if (this.step === 2) return "Select first face:";
    if (this.step === 3) return "Select edge (Ctrl+Click):";
    if (this.step === 4) return `Enter fillet radius <${this.radius.toFixed(2)}>:`;
    if (this.step === 5) return "Select second face:";
    if (this.step === 10) return `Enter fillet radius <${this.radius.toFixed(2)}>:`;
    return "SFILLET Command";
  }
}
