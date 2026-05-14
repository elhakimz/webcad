import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";

export class ShellCommand implements Command {
  step = 0;
  static lastThickness = 1.0;
  thickness = ShellCommand.lastThickness;
  entityId: string | null = null;
  faceIndices: number[] = [];

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, _doc?: IDocument): CommandResponse | undefined {
    const val = text.trim();

    if (this.step === 0) {
      // Empty Enter: advance to thickness step (works even with no faces = fully closed hollow)
      if (val === "") {
        if (!this.entityId) {
          return "No face selected. Ctrl+Shift+Click a face first.";
        }
        this.step = 1;
        return `Enter wall thickness <${this.thickness.toFixed(2)}>:`;
      }

      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        if (parts.length === 3) {
          // Entity ID comes from the first face click
          if (!this.entityId) {
            this.entityId = parts[1];
          }
          const faceIdx = parseInt(parts[2]);
          if (!this.faceIndices.includes(faceIdx)) {
            this.faceIndices.push(faceIdx);
          }
          return `Face ${faceIdx} added (${this.faceIndices.length} selected). Ctrl+Shift+Click more faces, or Enter to continue:`;
        }
      }

      return this.getPrompt();
    }

    if (this.step === 1) {
      const t = parseFloat(val);
      if (!isNaN(t) && t > 0) {
        this.thickness = t;
      }
      ShellCommand.lastThickness = this.thickness;

      if (!this.entityId) {
        return "No solid selected. Restart the command and Ctrl+Shift+Click a face.";
      }

      if (this.faceIndices.length === 0) {
        return {
          action: "shell",
          id1: this.entityId,
          thickness: this.thickness,
          faceIndices: this.faceIndices,
          removeFaces: false
        } as CommandAction;
      } else {
        this.step = 2;
        return "Remove selected faces? [Yes/No] <Yes>:";
      }
    }

    if (this.step === 2) {
      let removeFaces = true;
      if (val.toUpperCase() === "N" || val.toUpperCase() === "NO") {
        removeFaces = false;
      }
      return {
        action: "shell",
        id1: this.entityId,
        thickness: this.thickness,
        faceIndices: this.faceIndices,
        removeFaces: removeFaces
      } as CommandAction;
    }

    return undefined;
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig, _doc?: IDocument): CommandResponse {
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 0) {
      if (this.faceIndices.length === 0) {
        return "SHELL Ctrl+Shift+Click faces to remove, then Enter (Enter alone = hollow all):";
      }
      return `${this.faceIndices.length} face(s) selected. Ctrl+Shift+Click more, or Enter to set thickness:`;
    }
    if (this.step === 1) return `Enter wall thickness <${this.thickness.toFixed(2)}>:`;
    if (this.step === 2) return "Remove selected faces? [Yes/No] <Yes>:";
    return "SHELL Command";
  }
}
