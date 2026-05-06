import { Text } from "../model/Text"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"
import { Entity } from "../model/Entity"

export class TextCommand implements Command {
  step = 0
  x = 0; y = 0;
  height = 10.0; // Default to 10 for consistency with tests
  rotation = 0;

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      this.x = x;
      this.y = y;
      this.step = 1;
      const echo = FormatUtils.formatPoint(x, y, "Start point")
      return `${echo}\nHeight <${this.height.toFixed(2)}>:`;
    } else if (this.step === 1) {
      // If user clicks a point for height
      const h = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2));
      this.height = h;
      this.step = 2;
      return `Height set to ${this.height.toFixed(4)}\nRotation angle <${this.rotation}>:`;
    } else {
      // If user clicks a point for rotation
      const rad = Math.atan2(y - this.y, x - this.x);
      this.rotation = rad * (180 / Math.PI);
      this.step = 3;
      return `Rotation set to ${this.rotation.toFixed(2)}\nText:`;
    }
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    if (this.step === 1) {
      const val = parseFloat(text);
      if (!isNaN(val) && val > 0) this.height = val;
      this.step = 2;
      return `Rotation angle <${this.rotation}>:`;
    }
    if (this.step === 2) {
      const val = parseFloat(text);
      if (!isNaN(val)) this.rotation = val;
      this.step = 3;
      return "Text:";
    }
    if (this.step === 3) {
      return this.finish(text, id);
    }
  }

  private finish(content: string, id: string) {
    const entity = new Text(id, this.x, this.y, this.height, this.rotation, content);
    this.step = 0;
    const echo = `Text created: "${content}"`;
    ;(entity as unknown as { _echo: string })._echo = echo
    return entity;
  }

  getPreview(x: number, y: number): Entity | null {
    if (this.step === 1) {
        // Preview height
        const h = Math.sqrt(Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2));
        return new Text("PREVIEW", this.x, this.y, h || 1, 0, "ABC");
    }
    if (this.step === 2) {
        const rad = Math.atan2(y - this.y, x - this.x);
        return new Text("PREVIEW", this.x, this.y, this.height, rad * (180 / Math.PI), "ABC");
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "TEXT specify start point:";
    if (this.step === 1) return `Height <${this.height.toFixed(2)}>:`;
    if (this.step === 2) return `Rotation angle <${this.rotation}>:`;
    return "Text:";
  }
}
