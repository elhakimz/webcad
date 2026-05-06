import { Shape } from "../model/Shape"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"
import { parseSHP, executeShape, Shape as ShapeData } from "../io/SHPParser"
import shapeFile from "../../../data/shapes.shp?raw"

const defaultShapes = parseSHP(shapeFile || "");

export class ShapeCommand implements Command {
  shapeName = "";
  x = 0;
  y = 0;
  scale = 1;
  rotation = 0;
  step = 0;
  selectedShape: ShapeData | null = null;

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 0) {
      if (val === "") {
        const names = Array.from(defaultShapes.keys()).sort().join(", ");
        return `Available shapes: ${names}. Enter shape name:`;
      }

      if (val.toUpperCase() === "LIST") {
        const names = Array.from(defaultShapes.keys()).sort().join(", ");
        return `Available shapes: ${names}. Enter shape name:`;
      }

      const upperName = val.toUpperCase();
      if (!defaultShapes.has(upperName)) {
        return `Shape not found: ${val}. Enter shape name:`;
      }

      this.shapeName = upperName;
      this.selectedShape = defaultShapes.get(upperName) || null;
      this.step = 1;
      return "Specify insertion point:";
    }

    if (this.step === 2) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        this.scale = parsed;
      }
      this.step = 3;
      return `Rotation angle <${this.rotation.toFixed(0)}>:`;
    }

    if (this.step === 3) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        this.rotation = parsed;
      }

      const segments = this.selectedShape ? executeShape(this.selectedShape) : [];
      const shape = new Shape(
        id,
        this.shapeName,
        this.x,
        this.y,
        this.scale,
        this.rotation,
        segments
      );

      this.reset();
      return { action: "close", entity: shape };
    }

    const upperVal = val.toUpperCase();
    if (upperVal === "E" || upperVal === "EXIT" || upperVal === "QUIT") {
      this.reset();
      return { action: "finish" };
    }
  }

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 1) {
      this.x = x;
      this.y = y;
      this.step = 2;
      return `${FormatUtils.formatPoint(x, y, "IP")}\nScale <${this.scale.toFixed(1)}>:`;
    }
    return "";
  }

  private reset() {
    this.shapeName = "";
    this.x = 0;
    this.y = 0;
    this.scale = 1;
    this.rotation = 0;
    this.step = 0;
    this.selectedShape = null;
  }

  getPreview(x: number, y: number) {
    if (this.step === 1) {
      return { type: 'xmarker', id: 'shape-ip', x, y } as any;
    }
    if (this.step >= 2) {
      return { type: 'xmarker', id: 'shape-ip', x: this.x, y: this.y } as any;
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "Enter shape name (or LIST):";
    if (this.step === 1) return "Specify insertion point:";
    if (this.step === 2) return `Scale <${this.scale.toFixed(1)}>:`;
    return `Rotation angle <${this.rotation.toFixed(0)}>:`;
  }
}
