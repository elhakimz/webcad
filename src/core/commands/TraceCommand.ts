import { Trace } from "../model/Trace"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class TraceCommand implements Command {
  step = 0
  width = 5
  p1 = { x: 0, y: 0 }
  p2 = { x: 0, y: 0 }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim();
    if (this.step === 0) {
      this.width = val === "" ? 5 : parseFloat(val);
      this.step = 1;
      return "From point:";
    }
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 1) {
      this.p1 = { x, y }
      this.step = 2
      return FormatUtils.formatPoint(x, y, "P1")
    } else if (this.step === 2) {
      this.p2 = { x, y }
      const trace = new Trace(id, this.p1.x, this.p1.y, this.p2.x, this.p2.y, this.width)
      const echo = `Trace created. Width: ${FormatUtils.formatDistance(this.width)}`
      ;(trace as unknown as { _echo: string })._echo = echo
      
      // AutoCAD TRACE continues from last point
      this.p1 = { x, y }
      return trace
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number) {
    if (this.step === 2) {
      return new Trace("PREVIEW", this.p1.x, this.p1.y, x, y, this.width)
    }
    return null
  }

  getReferencePoints() {
    if (this.step === 2) return [this.p1]
    return []
  }

  getPrompt() {
    if (this.step === 0) return "TRACE width <5>:";
    if (this.step === 1) return "From point:";
    return "To point:";
  }
}
