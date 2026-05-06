import { Command, CommandResponse } from "./types"

export class ScaleCommand implements Command {
  step = 0
  targetIds: string[] = []
  baseX = 0
  baseY = 0
  private lastFactor: number | null = null

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    // Step 0: Select object (receives ID)
    if (this.step === 0 && text) {
      this.targetIds = [text];
      this.step = 1;
      return "Base point:";
    }

    if (this.step === 2) {
      const val = parseFloat(text);
      if (!isNaN(val) && val > 0) {
        return this.finish(val);
      }
    }
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      return "Select entity to scale";
    }

    if (this.step === 1) {
      this.baseX = x;
      this.baseY = y;
      this.step = 2;
      return "Scale factor:";
    } else {
      const dist = Math.sqrt(Math.pow(x - this.baseX, 2) + Math.pow(y - this.baseY, 2));
      const factor = dist; 
      return this.finish(factor, `Scale factor: ${factor.toFixed(2)}`);
    }
  }

  private finish(factor: number, echo?: string) {
    const ids = [...this.targetIds];
    const bx = this.baseX;
    const by = this.baseY;
    this.step = 0;
    this.targetIds = [];
    const res = { action: "scale", ids, baseX: bx, baseY: by, factor } as any;
    if (echo) res._echo = echo;
    return res;
  }

  getPreview(x: number, y: number) {
    if (this.step === 2) {
      const dist = Math.sqrt(Math.pow(x - this.baseX, 2) + Math.pow(y - this.baseY, 2));
      this.lastFactor = dist;
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
    if (this.step === 0) return "Select entity to scale:";
    if (this.step === 1) return "Base point:";
    const factorText = this.lastFactor !== null ? ` <${this.lastFactor.toFixed(2)}>` : "";
    return `Scale factor${factorText}:`;
  }
}
