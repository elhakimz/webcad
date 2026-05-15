import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"

export class ElevCommand implements Command {
  step = 0;
  elevation = 0;
  thickness = 0;

  getPrompt(doc?: IDocument): string {
    const elev = doc ? doc.currentElevation : 0;
    return `New current elevation <${elev}>:`;
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim();
    
    if (val.toUpperCase() === "E" || val.toUpperCase() === "EXIT" || val.toUpperCase() === "QUIT") {
      return { action: "finish" };
    }

    if (this.step === 0) {
      if (doc) {
        this.elevation = doc.currentElevation;
        this.thickness = doc.currentThickness;
      }
      
      if (val !== "") {
        const num = parseFloat(val);
        if (!isNaN(num)) this.elevation = num;
      }
      
      this.step = 1;
      return `New current thickness <${this.thickness}>:`;
    } else {
      if (val !== "") {
        const num = parseFloat(val);
        if (!isNaN(num)) this.thickness = num;
      }
      
      if (doc) {
        doc.currentElevation = this.elevation;
        doc.currentThickness = this.thickness;
      }
      
      return { action: "finish" };
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return "ELEV command expects text input.";
  }
}
