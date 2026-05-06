import { Point } from "../model/Point"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class PointCommand implements Command {
  onPoint(x: number, y: number, id: string): CommandResponse {
    const point = new Point(id, x, y)
    const echo = FormatUtils.formatPoint(x, y, "Point")
    ;(point as unknown as { _echo: string })._echo = echo
    return point
  }

  onInput(text: string, id: string) {
    const val = text.trim().toUpperCase();
    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }
  }

  getPrompt() {
    return "POINT specify point:";
  }
}
