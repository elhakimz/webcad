import { Point } from "../model/Point"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class PointCommand implements Command {
  onInput(text: string, _id: string): import('./types').CommandResponse | undefined {
    if (text.toUpperCase() === 'EXIT') return { action: 'finish' };
    return undefined;
  }
  onPoint(x: number, y: number, id: string): CommandResponse {
    const pt = new Point(id, x, y)
    const echo = `Point created. ${FormatUtils.formatPoint(x, y)}`
    ;(pt as unknown as { _echo: string })._echo = echo
    return pt
  }

  getPrompt() {
    return "POINT point:";
  }
}
