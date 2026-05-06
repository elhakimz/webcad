import { Command, CommandResponse } from "./types"

export class ArrayCommand implements Command {
  step = 0
  targetIds: string[] = []
  type: 'R' | 'P' = 'R'
  rows = 1
  cols = 1
  rowSpacing = 0
  colSpacing = 0

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      this.step = 1;
      return "Rectangular or Polar array (R/P) <R>:";
    }

    if (this.step === 1) {
      if (val === "P" || val === "POLAR") {
        this.type = 'P';
        return "Polar array not implemented yet. Rectangular or Polar array (R/P) <R>:";
      }
      this.type = 'R';
      this.step = 2;
      return "Number of rows (---) <1>:";
    }

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
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) return "Select objects:";
    if (this.step === 4) {
        // First point of unit cell
        (this as any).p1 = { x, y };
        this.step = 41;
        return "Second point of unit cell:";
    }
    if (this.step === 41) {
        const p1 = (this as any).p1;
        this.rowSpacing = y - p1.y;
        this.colSpacing = x - p1.x;
        return this.finish();
    }
    return this.getPrompt();
  }

  private finish() {
    const ids = [...this.targetIds];
    const rows = this.rows;
    const cols = this.cols;
    const rowSpacing = this.rowSpacing;
    const colSpacing = this.colSpacing;
    this.step = 0;
    this.targetIds = [];
    return { action: "array", ids, rows, cols, rowSpacing, colSpacing } as const;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "Rectangular or Polar array (R/P) <R>:";
    if (this.step === 2) return "Number of rows (---) <1>:";
    if (this.step === 3) return "Number of columns (|||) <1>:";
    if (this.step === 4) return "Unit cell or distance between rows (---):";
    if (this.step === 41) return "Second point of unit cell:";
    if (this.step === 5) return "Distance between columns (|||):";
    return "";
  }
}
