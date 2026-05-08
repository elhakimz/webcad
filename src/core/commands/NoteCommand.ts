import { Command, CommandResponse, CommandAction, PreviewObject } from "./types";
import { UnitsConfig } from "../model/Document";
import { Note } from "../model/Note";
import { Entity } from "../model/Entity";
import { SelectionEngine } from "../engine/SelectionEngine";

export class NoteCommand implements Command {
  step = 0;
  targetEntityId: string | null = null;
  anchorPoint: { x: number; y: number } | null = null;
  bendPoint: { x: number; y: number } | null = null;
  text: string = "";

  setEntity(entity: Entity) {
    if (this.step === 0) {
      this.targetEntityId = entity.id;
      this.step = 1;
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig, doc?: any): CommandResponse {
    if (this.step === 0) {
      if (doc && doc.entities) {
        const entities = Array.from(doc.entities.values()) as Entity[];
        const tolerance = 5; // Default tolerance
        const entity = SelectionEngine.getEntityAt(x, y, tolerance, entities);
        if (entity) {
          this.targetEntityId = entity.id;
          this.anchorPoint = { x, y };
          this.step = 2; // Go to bend point
          return "Specify bend point:";
        }
      }
      // User clicked a point instead of selecting an entity.
      // Treat as free point.
      this.targetEntityId = null;
      this.anchorPoint = { x, y };
      this.step = 2; // Skip to bend point
      return "Specify bend point:";
    } else if (this.step === 1) {
      this.anchorPoint = { x, y };
      this.step = 2;
      return "Specify bend point:";
    } else if (this.step === 2) {
      this.bendPoint = { x, y };
      this.step = 3;
      return "Enter note text:";
    }
    return undefined;
  }

  onInput(text: string, id: string, _units: UnitsConfig): CommandResponse | undefined {
    if (this.step === 0 && (text === "" || text.toUpperCase() === "ENTER")) {
      // User pressed Enter to skip selection.
      this.targetEntityId = null;
      this.step = 1;
      return "Specify anchor point:";
    } else if (this.step === 3) {
      this.text = text;
      const note = new Note(id, this.targetEntityId, this.anchorPoint!, this.bendPoint!, this.text);
      this.reset();
      return note; // Return the entity to be added to the document
    }
    return undefined;
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1) {
      // User is picking anchor point (after skipping selection)
      return new Note("preview", this.targetEntityId, {x, y}, {x, y}, "Preview");
    }
    if (this.step === 2) {
      // User picked anchor, now picking bend point
      return new Note("preview", this.targetEntityId, this.anchorPoint!, {x, y}, this.text || "Preview");
    }
    if (this.step === 3) {
      // User picked bend point, now entering text
      return new Note("preview", this.targetEntityId, this.anchorPoint!, this.bendPoint!, this.text || "Preview");
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "ANNOTATE Select object or [Enter] for free point:";
    if (this.step === 1) return "Specify anchor point on entity:";
    if (this.step === 2) return "Specify bend point:";
    if (this.step === 3) return "Enter note text:";
    return "";
  }

  private reset() {
    this.step = 0;
    this.targetEntityId = null;
    this.anchorPoint = null;
    this.bendPoint = null;
    this.text = "";
  }
}
