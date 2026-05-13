import { Point } from "../model/Point"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class PointCommand implements Command {
  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (text.toUpperCase() === 'EXIT') return { action: 'finish' };
    return undefined;
  }
  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    const pt = new Point(id, x, y, doc?.currentElevation || 0, doc?.currentThickness || 0)
    const echo = `Point created. ${FormatUtils.formatPoint(x, y, units, "P", doc?.currentElevation || 0)}`
    ;(pt as unknown as { _echo: string })._echo = echo
    return pt
  }

  getPrompt() {
    return "POINT point:";
  }
}
