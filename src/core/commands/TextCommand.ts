import { Text } from "../model/Text"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class TextCommand implements Command {
  step = 0
  startPt = { x: 0, y: 0 }
  height = 5
  rotation = 0

  onPoint(x: number, y: number, _id: string): CommandResponse {
    if (this.step === 0) {
      this.startPt = { x, y }
      this.step = 1
      return "Height <5>:"
    } else if (this.step === 1) {
        this.height = Math.sqrt((x - this.startPt.x) ** 2 + (y - this.startPt.y) ** 2);
        this.step = 2;
        return "Rotation angle <0>:";
    } else if (this.step === 2) {
        this.rotation = Math.atan2(y - this.startPt.y, x - this.startPt.x) * (180 / Math.PI);
        this.step = 3;
        return "Rotation set to " + this.rotation.toFixed(2) + ". Text:";
    }
    return this.getPrompt();
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 1) {
      this.height = val === "" ? 5 : parseFloat(val)
      this.step = 2
      return "Rotation angle <0>:"
    } else if (this.step === 2) {
      this.rotation = val === "" ? 0 : parseFloat(val)
      this.step = 3
      return "Text:"
    } else if (this.step === 3) {
      const entity = new Text(id, this.startPt.x, this.startPt.y, this.height, this.rotation, val)
      const echo = `Text created. ${FormatUtils.formatPoint(this.startPt.x, this.startPt.y)}`
      ;(entity as unknown as { _echo: string })._echo = echo
      this.step = 0
      return entity
    }
  }

  getPrompt() {
    if (this.step === 0) return "TEXT start point:";
    if (this.step === 1) return "Height <5>:";
    if (this.step === 2) return "Rotation angle <0>:";
    return "Text:";
  }
}
