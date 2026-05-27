import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"

export class ThicknessCommand implements Command {
  getPrompt(doc?: IDocument): string {
    const thick = doc ? doc.currentThickness : 0;
    return `New current thickness <${thick}>:`;
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim();
    
    if (val === "") {
      const current = doc ? doc.currentThickness : 0;
      return `Current thickness is ${current}.`;
    }

    const num = parseFloat(val);
    if (!isNaN(num)) {
      return { action: "thicknessSet", value: num };
    }
    
    return "Invalid thickness value. Command aborted.";
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return "THICKNESS command expects text input.";
  }
}
