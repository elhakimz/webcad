import { Command, CommandResponse } from "./types"

export class ZoomCommand implements Command {
  step = 0
  p1: { x: number; y: number } | null = null

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "A" || val === "ALL" || val === "E" || val === "EXTENTS") {
      return { action: "zoom", zoomType: "all" };
    }
    if (val === "W" || val === "WINDOW") {
      this.step = 0;
      return "Specify first corner:";
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      return "Specify opposite corner:";
    } else {
      const p2 = { x, y };
      const p1 = this.p1!;
      this.step = 0;
      return { action: "zoom", zoomType: "window", p1, p2 };
    }
  }
}
