import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Polyline } from "../model/Polyline"

export class SketchCommand implements Command {
  tolerance = 2.0;
  points: { x: number; y: number }[] = [];
  isDrawing = false;
  step = 0;

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    if (this.step === 0) {
      const val = parseFloat(text);
      if (!isNaN(val) && val > 0) {
        this.tolerance = val;
      }
      this.step = 1;
      return "Press and drag to sketch. Release to finish.";
    }
    return undefined;
  }

  startSketch(x: number, y: number): CommandResponse {
    if (this.step !== 1) return "";
    this.isDrawing = true;
    this.points = [{ x, y }];
    return `Sketching... (${this.points.length} points)`;
  }

  updateSketch(x: number, y: number): CommandResponse {
    if (!this.isDrawing) return "";
    if (this.points.length === 0) return "";

    const last = this.points[this.points.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= this.tolerance) {
      this.points.push({ x, y });
      return `Sketching... (${this.points.length} points)`;
    }
    return "";
  }

  finishSketch(id: string): CommandResponse | { action: "close"; entity: Polyline } | undefined {
    if (!this.isDrawing) return "";
    this.isDrawing = false;

    if (this.points.length < 2) {
      this.points = [];
      return "Sketch too short. Press and drag to sketch.";
    }

    const polyline = new Polyline(
      id,
      this.points.map(p => ({ x: p.x, y: p.y, bulge: 0 })),
      false
    );

    this.points = [];
    this.step = 0;

    return { action: "close", entity: polyline };
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return "";
  }

getPrompt() {
    if (this.step === 0) return `Sketch tolerance <${this.tolerance.toFixed(1)}>`;
    if (this.isDrawing) return "Sketching... (release to finish)";
    return "Press and drag to sketch. Release to finish.";
  }

  getPreview(x: number, y: number, _units: UnitsConfig): Polyline | null {
    if (this.step !== 1) return null;

    let previewPoints = [...this.points];

    if (this.isDrawing && this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= this.tolerance) {
        previewPoints = [...previewPoints, { x, y }];
      }
    }

    if (previewPoints.length < 2) return null;

    return new Polyline(
      "PREVIEW",
      previewPoints.map(p => ({ x: p.x, y: p.y, bulge: 0 })),
      false
    );
  }
}
