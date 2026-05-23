import { Donut } from "../model/Donut"
import { Circle } from "../model/Circle"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class DonutCommand implements Command {
  step = 0
  static lastInnerRadius = 0.25
  static lastOuterRadius = 0.5
  innerRadius = DonutCommand.lastInnerRadius
  outerRadius = DonutCommand.lastOuterRadius
  center: {x: number, y: number} | null = null;

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, _doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "EXIT" || val === "") {
        this.step = 0;
        return { action: "finish" };
    }
    
    if (this.step === 1) {
      const n = parseFloat(val);
      if (!isNaN(n) && n >= 0) {
        this.innerRadius = n;
        DonutCommand.lastInnerRadius = this.innerRadius;
        this.step = 2;
        return this.getPrompt();
      }
      return "Invalid radius. " + this.getPrompt();
    }
    if (this.step === 2) {
      const n = parseFloat(val);
      if (!isNaN(n) && n >= 0) {
        this.outerRadius = n;
        DonutCommand.lastOuterRadius = this.outerRadius;
        return this.finish(id);
      }
      return "Invalid radius. " + this.getPrompt();
    }
  }

  onPoint(x: number, y: number, id: string, _units: UnitsConfig, _doc?: IDocument): CommandResponse {
    if (this.step === 0) {
        this.center = {x, y};
        this.step = 1;
        return this.getPrompt();
    }
    if (this.step === 1) {
        const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
        this.innerRadius = dist;
        DonutCommand.lastInnerRadius = this.innerRadius;
        this.step = 2;
        return this.getPrompt();
    }
    if (this.step === 2) {
        const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
        this.outerRadius = dist;
        DonutCommand.lastOuterRadius = this.outerRadius;
        return this.finish(id);
    }
    return this.getPrompt();
  }

  private finish(id: string) {
    const donut = new Donut(id, this.center!.x, this.center!.y, this.innerRadius, this.outerRadius);
    this.step = 0;
    this.center = null;
    return donut;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): import('./types').PreviewObject | null {
    if (this.step === 1) {
        const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
        return new Circle("PREVIEW", this.center!.x, this.center!.y, dist); 
    }
    if (this.step === 2) {
        const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
        return new Donut("PREVIEW", this.center!.x, this.center!.y, this.innerRadius, dist);
    }
    return null
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1) {
      const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
      return [`Inner R:(${FormatUtils.formatValue(dist, units)})`];
    }
    if (this.step === 2) {
      const dist = Math.hypot(x - this.center!.x, y - this.center!.y);
      return [`Outer R:(${FormatUtils.formatValue(dist, units)})`];
    }
    return null;
  }

  getReferencePoints() {
    if (this.step >= 1 && this.center) {
      return [this.center];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return "Center of donut:";
    if (this.step === 1) return `Inner radius of donut <${DonutCommand.lastInnerRadius}>:`;
    if (this.step === 2) return `Outer radius of donut <${DonutCommand.lastOuterRadius}>:`;
    return "";
  }
}
