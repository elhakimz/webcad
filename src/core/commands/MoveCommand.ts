import { Command, CommandResponse } from "./types"

export class MoveCommand implements Command {
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
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      return "Select entity to move";
    }

    if (this.step === 1) {
      this.baseX = x;
      this.baseY = y;
      this.step = 2;
      return "Second point:";
    } else {
      const dx = x - this.baseX;
      const dy = y - this.baseY;
      const ids = [...this.targetIds];
      this.step = 0;
      this.targetIds = [];
      return { action: "move", ids, dx, dy };
    }
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
    if (this.step === 0) return "Select entity to move:";
    if (this.step === 1) return "Base point:";
    return "Second point:";
  }
}
