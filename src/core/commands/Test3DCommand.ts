import { Command, CommandResponse } from "./types"

export class Test3DCommand implements Command {
  step = 0;
  x = 0;
  y = 0;

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      this.x = x;
      this.y = y;
      this.step = 1;
      return "TEST3D: select height:";
    } else {
      const h = Math.abs(y - this.y) || 10;
      return { action: "create3d", entity: { id, shape: { type: 'box', x: this.x, y: this.y, h } } } as any;
    }
  }

  onInput(text: string, id: string) {
    if (this.step === 1) {
      const h = parseFloat(text);
      if (!isNaN(h)) {
        return { action: "create3d", entity: { id, shape: { type: 'box', x: this.x, y: this.y, h } } } as any;
      }
    }
  }

  getPrompt() {
    if (this.step === 0) return "TEST3D started: pick insertion point:";
    return "TEST3D: specify height:";
  }
}
