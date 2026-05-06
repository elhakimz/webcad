import { Command, CommandResponse } from "./types"

export class Test3DCommand implements Command {
  step = 0
  p1 = { x: 0, y: 0 }
  width = 10
  height = 10

  onPoint(x: number, y: number, _id: string): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y }
      this.step = 1
      return "Width <10>:"
    }
    return this.getPrompt();
  }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim();
    if (this.step === 1) {
      this.width = val === "" ? 10 : parseFloat(val)
      this.step = 2
      return "Height <10>:"
    } else if (this.step === 2) {
      this.height = val === "" ? 10 : parseFloat(val)
      this.step = 0
      return { action: "create3d", fromX: this.p1.x, fromY: this.p1.y, toX: this.p1.x + this.width, toY: this.p1.y + this.height } as CommandResponse;
    }
  }

  getPrompt() {
    if (this.step === 0) return "TEST3D first corner:";
    if (this.step === 1) return "Width <10>:";
    return "Height <10>:";
  }
}
