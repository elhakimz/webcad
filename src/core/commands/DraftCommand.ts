import { Command, CommandResponse, CommandAction, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";

export class DraftCommand implements Command {
  step = 0; // 0: Select Solid, 1: Select Neutral Face, 2: Select Faces to Draft, 3: Enter Angle
  entityId: string | null = null;
  neutralFaceIndex: number | null = null;
  targetFaceIndices: number[] = [];
  static lastAngle = 5.0;
  angle = DraftCommand.lastAngle;

  // Preview properties
  private startY: number | null = null;
  private previewSolid: Solid3D | null = null;
  private isDrafting: boolean = false;
  private lastRequestedAngle: number | null = null;

  constructor(selection?: string[]) {
    if (selection && selection.length > 0) {
      this.entityId = selection[0];
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, _doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    // Step 0: Select Solid
    if (this.step === 0) {
      let eid = text.trim();
      if (eid.toUpperCase().startsWith("SOLID:")) {
        eid = eid.split(":")[1].trim();
      }
      
      const entity = _doc ? _doc.getEntity(eid) : null;
      if (entity && (entity.constructor.name === "Solid3D" || (entity as any).type === "Solid3D")) {
        this.entityId = eid;
        this.step = 1;
        return this.getPrompt();
      }
      
      // Fallback for direct pure text match if document wasn't passed (rare)
      if (eid.toUpperCase().startsWith("S3D") || text.toUpperCase().startsWith("SOLID:")) {
        this.entityId = eid;
        this.step = 1;
        return this.getPrompt();
      }
      
      return "Select a solid to draft:";
    }

    // Step 1: Select Neutral Face
    if (this.step === 1) {
      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        const eid = parts[1];
        if (this.entityId && eid !== this.entityId) {
          return "Please select a face on the same solid.";
        }
        this.neutralFaceIndex = parseInt(parts[2]);
        this.step = 2;
        return this.getPrompt();
      }
      return this.getPrompt();
    }

    // Step 2: Select Target Faces
    if (this.step === 2) {
      if (val === "" || val === "ENTER") {
        if (this.targetFaceIndices.length === 0) {
          return "Select at least one face to draft:";
        }
        this.step = 3;
        // Trigger initial preview request
        this.requestPreview(this.angle, _doc);
        return this.getPrompt();
      }

      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        const faceIdx = parseInt(parts[2]);
        if (!this.targetFaceIndices.includes(faceIdx)) {
          this.targetFaceIndices.push(faceIdx);
        }
        return `Face ${faceIdx} added. Select more faces or press Enter:`;
      }
    }

    // Step 3: Enter Angle
    if (this.step === 3) {
      const a = parseFloat(val);
      if (!isNaN(a)) {
        this.angle = a;
        DraftCommand.lastAngle = this.angle;
        
        return {
          action: "draft_solid",
          id: this.entityId,
          faceIndices: [...this.targetFaceIndices],
          neutralFaceIndex: this.neutralFaceIndex,
          angle: this.angle
        } as any;
      }
      return `Invalid angle. Specify draft angle <${this.angle.toFixed(1)}>:`;
    }

    return this.getPrompt();
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  getPreview(_x: number, y: number, _units: UnitsConfig, doc?: IDocument): PreviewObject | null {
    if (this.step === 3) {
      if (this.startY === null) {
        this.startY = y;
      }
      
      // Calculate angle based on mouse Y movement (0.5 degrees per world unit)
      const dy = y - this.startY;
      let newAngle = Math.max(-89.9, Math.min(89.9, DraftCommand.lastAngle + dy * 0.5));
      newAngle = Math.round(newAngle * 10) / 10;
      
      if (newAngle !== this.angle) {
         this.angle = newAngle;
         this.requestPreview(this.angle, doc);
      }
      
      if (this.previewSolid) {
         return this.previewSolid;
      }
    }
    return null;
  }

  private requestPreview(angle: number, doc?: IDocument) {
    if (this.isDrafting || !this.entityId || this.neutralFaceIndex === null || this.targetFaceIndices.length === 0) return;
    
    // Throttle to 1 degree increments to avoid swamping the worker
    if (this.lastRequestedAngle !== null && Math.abs(angle - this.lastRequestedAngle) < 1.0) return;

    this.isDrafting = true;
    this.lastRequestedAngle = angle;
    
    const angleRad = (angle * Math.PI) / 180.0;
    const deflection = doc ? 0.1 / doc.facetres : 0.1;
    
    OpenCascadeService.getInstance().draftSolidFaces(
      this.entityId,
      this.targetFaceIndices,
      this.neutralFaceIndex,
      angleRad,
      deflection
    ).then(geometry => {
      const positions = Array.from(geometry.getAttribute('position').array) as number[];
      const indices = Array.from(geometry.getIndex()?.array || []) as number[];
      const solid = new Solid3D("preview_draft", positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
      this.previewSolid = solid;
      this.isDrafting = false;
      
      // If mouse moved significantly while processing, request next frame
      if (Math.abs(this.angle - angle) >= 1.0) {
        this.requestPreview(this.angle, doc);
      }
    }).catch(err => {
      this.isDrafting = false;
      // Suppress preview errors (e.g. self-intersection at extreme angles)
    });
  }

  getPrompt(): string {
    if (this.step === 0) return "Select solid to draft:";
    if (this.step === 1) return "Select neutral face (plane of no change):";
    if (this.step === 2) return `Select faces to draft (${this.targetFaceIndices.length} selected, press Enter when done):`;
    if (this.step === 3) return `Specify draft angle (move mouse up/down):`;
    return "DRAFT Command";
  }

  getDynamicInput(_x: number, _y: number, _units: UnitsConfig): string[] | null {
    if (this.step === 3) return [`Angle: ${this.angle.toFixed(1)} (enter value)`];
    return null;
  }
}
