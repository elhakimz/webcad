import { Command, CommandResponse } from "./types"

export class RotateCommand implements Command {
  step = 0
  targetIds: string[] = []
  baseX = 0
  baseY = 0

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
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
      return this.finish(angle);
    }
  }

  private finish(angle: number) {
    const ids = [...this.targetIds];
    const bx = this.baseX;
    const by = this.baseY;
    this.step = 0;
    this.targetIds = [];
    return { action: "rotate", ids, baseX: bx, baseY: by, angle } as const;
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
    return "Rotation angle:";
  }
}
