import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class CopyCommand implements Command {
  step = 0
  basePoint = { x: 0, y: 0 }
  targetIds: string[] = []

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      this.step = 1;
      return "Base point:";
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.basePoint = { x, y }
      this.step = 2
      return "Second point:"
    } else if (this.step === 2) {
      const dx = x - this.basePoint.x
      const dy = y - this.basePoint.y
      const ids = [...this.targetIds];
      this.step = 1; // AutoCAD allows multiple copies
      return { action: "copy", ids, dx, dy } as CommandResponse
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number, _units: UnitsConfig, doc?: IDocument): import('./types').PreviewObject | null {
    if (this.step === 2 && doc) {
      const dx = x - this.basePoint.x;
      const dy = y - this.basePoint.y;
      const entities = this.targetIds.map(id => doc.getEntity(id)).filter((e): e is import('../model/Entity').Entity => e !== undefined);
      const ghosts = entities.map(e => {
          const g = e.clone(e.id + "_ghost");
          if (g.move) g.move(dx, dy);
          return g;
      });
      return { type: 'entities', entities: ghosts };
    }
    return null
  }

  getReferencePoints() {
    if (this.step === 2) return [this.basePoint]
    return []
  }

  getBasePoint() {
      return this.step === 2 ? this.basePoint : null;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "Base point:";
    return "Second point:";
  }
}
