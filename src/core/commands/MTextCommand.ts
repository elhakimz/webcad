import { MText } from "../model/MText";
import { Line } from "../model/Line";
import { Command, CommandResponse, PreviewObject, XMarkerPreview } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
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
      
      // Update text height based on box height if not zero
      if (this.height > 0) {
        this.textHeight = this.height;
      }
      
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

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
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
      entity.elevation = doc?.currentElevation || 0;
      entity.thickness = doc?.currentThickness || 0;
      
      // Default properties
      entity.textHeight = this.textHeight;
      entity.lineSpacing = 1.0;
      entity.textAlign = "LEFT";
      
      entity.layoutMText(); // Compute layout lines and bounds
      
      const echo = `MText created. ${FormatUtils.formatPoint(this.firstCorner.x, this.firstCorner.y, units, "P", doc?.currentElevation || 0)}`;
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

  getPreview(x: number, y: number, _units: UnitsConfig, doc?: IDocument): PreviewObject | null {
    this.currentMouseX = x;
    this.currentMouseY = y;
    
    if (this.step === 0) {
      const mtext = new MText("PREVIEW", { x, y }, 10, 5, "Lorem Ipsum");
      mtext.textHeight = this.textHeight;
      mtext.elevation = doc?.currentElevation || 0;
      mtext.layoutMText();
      return mtext;
    } else if (this.step === 1) {
      const width = Math.abs(x - this.firstCorner.x);
      const height = Math.abs(y - this.firstCorner.y);
      const w = width > 0 ? width : 10;
      const h = height > 0 ? height : 5;
      const mtext = new MText("PREVIEW", { ...this.firstCorner }, w, h, "Lorem Ipsum");
      mtext.textHeight = h > 0 ? h : 2.5; // Use box height as text height
      mtext.elevation = doc?.currentElevation || 0;
      mtext.layoutMText();
      return mtext;
    } else if (this.step === 3) {
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
