import { Entity } from "../model/Entity"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class RotateCommand implements Command {
  step = 0
  targetIds: string[] = []
  entities: Entity[] = []
  baseX = 0
  baseY = 0
  private lastAngle: number | null = null

  constructor(ids?: string[], entities?: Entity[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.entities = entities || [];
      this.step = 1;
    }
  }

  onInput(text: string): CommandResponse | undefined {
    // Step 0: Select object (receives ID)
    if (this.step === 0 && text) {
      this.targetIds = [text];
      this.step = 1;
      return "Base point:";
    }

    if (this.step === 2) {
      const val = parseFloat(text);
      if (!isNaN(val)) {
        const angle = val * (Math.PI / 180);
        return this.finish(angle);
      }
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      return "Select entity to rotate";
    }

    if (this.step === 1) {
      this.baseX = x;
      this.baseY = y;
      this.step = 2;
      return "Rotation angle:";
    } else {
      const angle = Math.atan2(y - this.baseY, x - this.baseX);
      const deg = angle * (180 / Math.PI);
      return this.finish(angle, `Rotation angle: ${deg.toFixed(1)}`);
    }
  }

  private finish(angle: number, echo?: string) {
    const ids = [...this.targetIds];
    const bx = this.baseX;
    const by = this.baseY;
    this.step = 0;
    this.targetIds = [];
    this.entities = [];
    const res = { action: "rotate", ids, baseX: bx, baseY: by, angle } as any;
    if (echo) res._echo = echo;
    return res;
  }

  getPreview(x: number, y: number): Entity | null {
    if (this.step === 2 && this.entities.length > 0) {
      const angle = Math.atan2(y - this.baseY, x - this.baseX);
      
      // We can only return one entity as a preview currently in our App.ts/Viewer.ts setup,
      // but we can return a "Group" or a dummy if needed. 
      // For now, let's just use the first entity to show rotation, or a special marker.
      // Actually, returning a text entity with the angle might be what's requested.
      
      const deg = angle * (180 / Math.PI);
      this.lastAngle = deg;

      // Special return to signal App.ts to display the angle
      return { type: 'rotation_preview', angle, baseX: this.baseX, baseY: this.baseY } as any;
    }
    return null;
  }

  getReferencePoints() {
    if (this.step >= 1) {
      return [{ x: this.baseX, y: this.baseY }];
    }
    return [];
  }

  getBasePoint(): { x: number; y: number } | null {
    if (this.step >= 1) {
      return { x: this.baseX, y: this.baseY };
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "Select entity to rotate:";
    if (this.step === 1) return "Base point:";
    const angleText = this.lastAngle !== null ? ` (R:${this.lastAngle.toFixed(2)})` : "";
    return `Rotation angle${angleText}:`;
  }
}
