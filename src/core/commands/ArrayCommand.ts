import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig } from "../model/Document"

export class ArrayCommand implements Command {
  step = 0
  targetIds: string[] = []
  arrayType: 'R' | 'P' = 'R'
  
  // Rectangular
  rows = 1
  cols = 1
  rowSpacing = 0
  colSpacing = 0

  // Polar
  center: { x: number, y: number } | null = null
  count = 2
  angleToFill = 360
  rotateObjects = true

  private p1: { x: number, y: number } | null = null

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (val !== "") {
        this.targetIds = [val];
        this.step = 1;
        return "Rectangular or Polar array (R/P) <R>:";
      }
      return "Select objects:";
    }

    if (this.step === 1) {
      if (val === "P" || val === "POLAR") {
        this.arrayType = 'P';
        this.step = 10; // Start Polar flow
        return "Center point of array:";
      }
      this.arrayType = 'R';
      this.step = 2; // Start Rectangular flow
      return "Number of rows (---) <1>:";
    }

    // --- Rectangular Flow ---
    if (this.step === 2) {
      const n = parseInt(val);
      this.rows = isNaN(n) ? 1 : n;
      this.step = 3;
      return "Number of columns (|||) <1>:";
    }

    if (this.step === 3) {
      const n = parseInt(val);
      this.cols = isNaN(n) ? 1 : n;
      if (this.rows === 1 && this.cols === 1) return this.finish();
      this.step = 4;
      return "Unit cell or distance between rows (---):";
    }

    if (this.step === 4) {
      const n = parseFloat(val);
      if (!isNaN(n)) {
        this.rowSpacing = n;
        this.step = 5;
        return "Distance between columns (|||):";
      }
    }

    if (this.step === 5) {
      const n = parseFloat(val);
      if (!isNaN(n)) {
        this.colSpacing = n;
        return this.finish();
      }
    }

    // --- Polar Flow ---
    if (this.step === 11) {
      const n = parseInt(val);
      if (!isNaN(n) && n > 1) {
        this.count = n;
        this.step = 12;
        return "Angle to fill (+=ccw, -=cw) <360>:";
      }
    }

    if (this.step === 12) {
      const n = parseFloat(val);
      this.angleToFill = isNaN(n) ? 360 : n;
      this.step = 13;
      return "Rotate objects as they are arrayed? <Y>:";
    }

    if (this.step === 13) {
      this.rotateObjects = (val !== "N" && val !== "NO");
      return this.finish();
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) return "Select objects:";
    
    // Rectangular distance picking
    if (this.step === 4) {
        this.p1 = { x, y };
        this.step = 41;
        return "Second point of unit cell:";
    }
    if (this.step === 41 && this.p1) {
        this.rowSpacing = y - this.p1.y;
        this.colSpacing = x - this.p1.x;
        return this.finish();
    }

    // Polar center picking
    if (this.step === 10) {
      this.center = { x, y };
      this.step = 11;
      return "Number of items:";
    }

    return this.getPrompt();
  }

  private finish(): CommandResponse {
    const ids = [...this.targetIds];
    const arrayType = this.arrayType;
    const res: CommandAction = { action: "array", ids, arrayType };

    if (arrayType === 'R') {
      res.rows = this.rows;
      res.cols = this.cols;
      res.rowSpacing = this.rowSpacing;
      res.colSpacing = this.colSpacing;
    } else {
      res.center = this.center!;
      res.count = this.count;
      res.angleToFill = this.angleToFill;
      res.rotateObjects = this.rotateObjects;
    }

    this.step = 0;
    this.targetIds = [];
    return res;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "Rectangular or Polar array (R/P) <R>:";
    
    if (this.step === 2) return "Number of rows (---) <1>:";
    if (this.step === 3) return "Number of columns (|||) <1>:";
    if (this.step === 4) return "Unit cell or distance between rows (---):";
    if (this.step === 41) return "Second point of unit cell:";
    if (this.step === 5) return "Distance between columns (|||):";

    if (this.step === 10) return "Center point of array:";
    if (this.step === 11) return "Number of items:";
    if (this.step === 12) return "Angle to fill (+=ccw, -=cw) <360>:";
    if (this.step === 13) return "Rotate objects as they are arrayed? <Y>:";
    
    return "";
  }
}
