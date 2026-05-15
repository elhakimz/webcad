import { Text } from "../model/Text"
import { Command, CommandResponse } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { FormatUtils } from "../engine/FormatUtils"

export class TextCommand implements Command {
  step = 0
  startPt = { x: 0, y: 0 }
  height = 5
  rotation = 0
  currentMouseX = 0
  currentMouseY = 0

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.startPt = { x, y }
      this.step = 1
      return "Height <5>:"
    } else if (this.step === 1) {
        this.height = Math.sqrt((x - this.startPt.x) ** 2 + (y - this.startPt.y) ** 2);
        this.step = 2;
        return "Rotation angle <0>:";
    } else if (this.step === 2) {
        this.rotation = Math.atan2(y - this.startPt.y, x - this.startPt.x) * (180 / Math.PI);
        this.step = 3;
        return "Rotation set to " + this.rotation.toFixed(2) + ". Text:";
    }
    return this.getPrompt();
  }

  onInput(text: string, id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 1) {
      this.height = val === "" ? 5 : parseFloat(val)
      this.step = 2
      return "Rotation angle <0>:"
    } else if (this.step === 2) {
      this.rotation = val === "" ? 0 : parseFloat(val)
      this.step = 3
      return "Text:"
    } else if (this.step === 3) {
      const entity = new Text(id, this.startPt.x, this.startPt.y, this.height, this.rotation, val, doc?.currentElevation || 0, doc?.currentThickness || 0)
      const echo = `Text created. ${FormatUtils.formatPoint(this.startPt.x, this.startPt.y, units)}`
      ;(entity as unknown as { _echo: string })._echo = echo
      this.step = 0
      return entity
    }
  }

  getPreview(x: number, y: number, _units: UnitsConfig, doc?: IDocument) {
    this.currentMouseX = x;
    this.currentMouseY = y;
    
    if (this.step === 0) {
      const text = new Text("PREVIEW", x, y, this.height, this.rotation, "TEXT");
      text.elevation = doc?.currentElevation || 0;
      return text;
    } else if (this.step === 1) {
      const dx = x - this.startPt.x;
      const dy = y - this.startPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const h = dist > 0 ? dist : this.height;
      const text = new Text("PREVIEW", this.startPt.x, this.startPt.y, h, 0, "TEXT");
      text.elevation = doc?.currentElevation || 0;
      return text;
    } else if (this.step === 2) {
      const angle = Math.atan2(y - this.startPt.y, x - this.startPt.x) * (180 / Math.PI);
      const text = new Text("PREVIEW", this.startPt.x, this.startPt.y, this.height, angle, "TEXT");
      text.elevation = doc?.currentElevation || 0;
      return text;
    }
    return null;
  }

  getReferencePoints() {
    if (this.step === 1 || this.step === 2) {
      return [this.startPt];
    }
    return [];
  }

  getPrompt() {
    if (this.step === 0) return "TEXT start point:";
    if (this.step === 1) {
      const dx = this.currentMouseX - this.startPt.x;
      const dy = this.currentMouseY - this.startPt.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const h = dist > 0 ? dist : this.height;
      return `Height <${h.toFixed(2)}>:`;
    }
    if (this.step === 2) {
      const angle = Math.atan2(this.currentMouseY - this.startPt.y, this.currentMouseX - this.startPt.x) * (180 / Math.PI);
      const a = angle !== 0 ? angle : this.rotation;
      return `Rotation angle <${a.toFixed(2)}>:`;
    }
    return "Text:";
  }
}
