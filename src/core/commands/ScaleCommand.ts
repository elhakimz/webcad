import { Command, CommandResponse } from "./types"

export class ScaleCommand implements Command {
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
        return this.finish(val);
      }
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      return "Select entity to scale";
    }

    if (this.step === 1) {
      this.baseX = x;
      this.baseY = y;
      this.step = 2;
      return "Scale factor:";
    } else {
      const dx = x - this.baseX;
      const dy = y - this.baseY;
      const factor = Math.sqrt(dx * dx + dy * dy);
      // Note: Using distance as factor is a bit arbitrary without a reference,
      // but it's a common interactive pattern.
      return this.finish(factor);
    }
  }

  private finish(factor: number) {
    const ids = [...this.targetIds];
    const bx = this.baseX;
    const by = this.baseY;
    this.step = 0;
    this.targetIds = [];
    return { action: "scale", ids, baseX: bx, baseY: by, factor } as const;
  }

  getReferencePoints() {
    if (this.step >= 1) {
      return [{ x: this.baseX, y: this.baseY }];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return "Select entity to scale:";
    if (this.step === 1) return "Base point:";
    return "Scale factor:";
  }
}
