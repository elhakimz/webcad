import { Solid } from "../model/Solid"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

export class SolidCommand implements Command {
  vertices: { x: number; y: number }[] = []
  drawnEntityId: string | null = null

  onPoint(x: number, y: number, id: string): CommandResponse {
    this.vertices.push({ x, y });
    const pLabel = "P" + this.vertices.length;
    const echo = FormatUtils.formatPoint(x, y, pLabel);

    if (this.vertices.length === 1) {
      this.drawnEntityId = id;
      return `${echo}\nSecond point:`;
    } else if (this.vertices.length === 2) {
      return `${echo}\nThird point:`;
    } else {
      const solid = new Solid(this.drawnEntityId!, [...this.vertices]);
      if (this.vertices.length === 4) {
          this.vertices = [];
          this.drawnEntityId = null;
      }
      return solid;
    }
  }

  onInput(text: string) {
    const val = text.trim().toUpperCase();
    if (val === "" || val === "E" || val === "EXIT" || val === "QUIT") {
      return { action: "finish" };
    }
  }

  getPreview(x: number, y: number) {
    if (this.vertices.length > 0) {
      const previewVertices = [...this.vertices, { x, y }];
      return { type: 'solidpoints', points: previewVertices } as any;
    }
    return null;
  }

  getReferencePoints() {
    return this.vertices;
  }

  getPrompt() {
    if (this.vertices.length === 0) return "SOLID First point:";
    if (this.vertices.length === 1) return "Second point:";
    if (this.vertices.length === 2) return "Third point:";
    return "Fourth point:";
  }
}
