import { Point } from "../model/Point"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class PointCommand implements Command {
  onPoint(x: number, y: number): CommandResponse {
    const echo = FormatUtils.formatPoint(x, y, "Point");
    const point = new Point("PT" + (++idCounter), x, y);
    // Add echo to the point object for App to use
    (point as unknown as { _echo: string })._echo = `${echo}\nPoint created.`;
    return point;
  }

  onInput(text: string) {
    const val = text.trim().toUpperCase();
    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }
  }
}
