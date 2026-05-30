import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";

export class ProfileCommand implements Command {
  step = 0; // 0: Select Face, 1: Specify Placement Point
  entityId: string | null = null;
  faceIndex: number | null = null;

  onInput(text: string, _id: string, units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    const val = text.trim().toUpperCase();

    if (this.step === 0) {
      if (text.startsWith("FACE:")) {
        const parts = text.split(":");
        this.entityId = parts[1];
        this.faceIndex = parseInt(parts[2]);
        this.step = 1;
        return this.getPrompt();
      }
      return "Select a face of a 3D solid:";
    }

    if (this.step === 1) {
      if (val === "EXIT" || val === "QUIT") {
        this.step = 0;
        return "Command canceled.";
      }
    }

    return this.getPrompt();
  }

  onPoint(x: number, y: number, _id: string, units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 1) {
      const action: CommandAction = {
        action: "profile",
        id: this.entityId!,
        faceIndex: this.faceIndex!,
        basePoint: { x, y }
      };
      this.step = 0;
      return action;
    }
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 0) return "PROFILE: Select a solid face to extract:";
    if (this.step === 1) return "Specify placement point for the 2D profile:";
    return "PROFILE Command";
  }

  getPreview() {
    return null;
  }
}
