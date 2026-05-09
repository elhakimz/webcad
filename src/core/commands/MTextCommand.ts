import { MText } from "../model/MText";
import { Line } from "../model/Line";
import { Command, CommandResponse, PreviewObject, XMarkerPreview } from "./types";
import { UnitsConfig } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";

export class MTextCommand implements Command {
  step = 0;
  firstCorner = { x: 0, y: 0 };
  width = 0;
  height = 0;
  textHeight = 2.5;
  currentMouseX = 0;
  currentMouseY = 0;

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      this.firstCorner = { x, y };
      this.step = 1;
      return "Specify opposite corner or [Height]:";
    } else if (this.step === 1) {
      this.width = Math.abs(x - this.firstCorner.x);
      this.height = Math.abs(y - this.firstCorner.y);
      
      // Fallback for zero width or height
      if (this.width === 0) this.width = 100;
      if (this.height === 0) this.height = this.textHeight; // Default to one line height roughly
      
      this.step = 2;
      return "Text:";
    } else if (this.step === 3) {
      const dx = x - this.firstCorner.x;
      const dy = y - this.firstCorner.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        this.textHeight = dist;
      }
      this.step = 1;
      return `Height set to ${this.textHeight.toFixed(2)}. Specify opposite corner or [Height]:`;
    }
    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 1) {
      if (val.toUpperCase() === "H" || val.toUpperCase() === "HEIGHT") {
        this.step = 3;
        return `Specify text height <${this.textHeight.toFixed(2)}>:`;
      }
      return "Please pick a point for the opposite corner or type 'H' for height.";
    } else if (this.step === 2) {
      // Create MText entity
      const entity = new MText(id, { ...this.firstCorner }, this.width, this.height, val);
      
      // Default properties
      entity.textHeight = this.textHeight;
      entity.lineSpacing = 1.0;
      entity.textAlign = "LEFT";
      
      entity.layoutMText(); // Compute layout lines and bounds
      
      const echo = `MText created. ${FormatUtils.formatPoint(this.firstCorner.x, this.firstCorner.y, units)}`;
      (entity as unknown as { _echo: string })._echo = echo;
      
      this.step = 0;
      return entity;
    } else if (this.step === 3) {
      const parsedVal = parseFloat(val);
      if (!isNaN(parsedVal) && parsedVal > 0) {
        this.textHeight = parsedVal;
        this.step = 1;
        return `Height set to ${this.textHeight.toFixed(2)}. Specify opposite corner or [Height]:`;
      }
      return `Invalid height. Specify text height <${this.textHeight.toFixed(2)}>:`;
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    this.currentMouseX = x;
    this.currentMouseY = y;
    
    if (this.step === 1) {
      return { type: 'xmarker', x: this.firstCorner.x, y: this.firstCorner.y } as XMarkerPreview;
    } else if (this.step === 3) {
      // Show a rubber band line from first corner to current mouse position to indicate height
      return new Line("PREVIEW", this.firstCorner.x, this.firstCorner.y, x, y);
    }
    return null;
  }

  getReferencePoints() {
    if (this.step === 1) {
      return [this.firstCorner];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return "MTEXT specify first corner:";
    if (this.step === 1) return "Specify opposite corner or [Height]:";
    if (this.step === 3) {
      const dx = this.currentMouseX - this.firstCorner.x;
      const dy = this.currentMouseY - this.firstCorner.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const h = dist > 0 ? dist : this.textHeight;
      return `Specify text height <${h.toFixed(2)}>:`;
    }
    return "Text:";
  }
}
