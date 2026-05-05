import { Command, CommandResponse } from "./types"

export class ZoomCommand implements Command {
  step = 0
  p1: { x: number; y: number } | null = null
  center: { x: number; y: number } | null = null

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    
    if (val === "" || val === "A" || val === "ALL" || val === "E" || val === "EXTENTS") {
      return { action: "zoom", zoomType: "all" };
    }
    if (val === "W" || val === "WINDOW") {
      this.step = 0;
      this.p1 = null;
      return "Specify first corner:";
    }
    if (val === "C" || val === "CENTER") {
      this.step = 10;
      return "Specify center point:";
    }
    const num = parseFloat(text);
    if (!isNaN(num) && this.step === 10) {
      this.center = { x: num, y: 0 };
      return "Specify magnification or zoom factor:";
    }
    if (!isNaN(num)) {
      return { action: "zoom", zoomType: "factor", factor: num };
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.p1 = { x, y };
      this.step = 1;
      return "Specify opposite corner:";
    } else if (this.step === 1) {
      const p2 = { x, y };
      const p1 = this.p1!;
      this.step = 0;
      return { action: "zoom", zoomType: "window", p1, p2 };
    } else if (this.step === 10) {
      this.center = { x, y };
      this.step = 11;
      return "Specify zoom factor:";
    }
    return { action: "zoom", zoomType: "all" };
  }

  getPrompt() {
    return "ZOOM [All/Window/Center/<Window corner>]:";
  }
}