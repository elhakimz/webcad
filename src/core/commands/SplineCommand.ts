import { Spline } from "../model/Spline";
import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { Point } from "../engine/MathUtils";

export class SplineCommand implements Command {
  step = 0;
  controlPoints: Point[] = [];
  degree = 3;

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    this.controlPoints.push({ x, y });
    this.step++;
    
    // Auto-finalize if user presses enter or reaches a certain state? 
    // No, CAD splines usually continue until Enter/Close.
    return `Point ${this.step} specified.`;
  }

  onInput(text: string, id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const t = text.trim().toUpperCase();
    if (t === "" || t === "ENTER") {
      if (this.controlPoints.length < 4) {
        return "Minimum 4 points required for cubic spline.";
      }
      const knots = this.generateKnots();
      const spline = new Spline(id, this.controlPoints, this.degree, knots, false, doc?.currentElevation || 0, doc?.currentThickness || 0);
      this.reset();
      return spline;
    }
    if (t === "EXIT" || t === "QUIT") {
      this.reset();
      return "Command canceled.";
    }
    if (t === "U" || t === "UNDO") {
      if (this.controlPoints.length > 0) {
        this.controlPoints.pop();
        this.step--;
        return "Last point undone.";
      }
    }
  }

  private generateKnots(): number[] {
    const k = this.degree;
    const nPlus1 = this.controlPoints.length;
    const knots: number[] = [];
    // Clamped uniform knot vector
    for (let i = 0; i <= k; i++) knots.push(0);
    for (let i = 1; i < nPlus1 - k; i++) knots.push(i);
    const maxVal = Math.max(1, nPlus1 - k);
    for (let i = 0; i <= k; i++) knots.push(maxVal);
    return knots;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.controlPoints.length === 0) return null;
    
    const pts = [...this.controlPoints, { x, y }];
    if (pts.length < 2) return null;

    // For preview, if we have enough points, show a spline
    // Otherwise show lines connecting points
    if (pts.length >= 4) {
      const k = this.degree;
      const nPlus1 = pts.length;
      const knots: number[] = [];
      for (let i = 0; i <= k; i++) knots.push(0);
      for (let i = 1; i < nPlus1 - k; i++) knots.push(i);
      const maxVal = Math.max(1, nPlus1 - k);
      for (let i = 0; i <= k; i++) knots.push(maxVal);

      return {
        type: 'spline_preview',
        controlPoints: pts,
        degree: this.degree,
        knots
      };
    } else {
      // Return a polyline preview of the control hull
      return {
        type: 'polyline_preview',
        vertices: pts.map(p => ({ ...p, bulge: 0 })),
        closed: false
      };
    }
  }

  getPrompt(): string {
    if (this.step === 0) return "SPLINE first point:";
    return `Specify next point (Enter to finish, currently ${this.step} points):`;
  }

  private reset() {
    this.step = 0;
    this.controlPoints = [];
  }

  getReferencePoints() {
    return this.controlPoints;
  }
}
