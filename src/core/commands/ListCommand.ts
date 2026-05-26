import { Command, CommandResponse } from "./types";
import { UnitsConfig } from "../model/Document";
import { Entity } from "../model/Entity";

export class ListCommand implements Command {
  selectedEntity: Entity | null = null;

  setEntity(entity: Entity) {
    this.selectedEntity = entity;
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.selectedEntity) {
      const action: CommandResponse = { type: 'action', action: 'list', entity: this.selectedEntity };
      this.selectedEntity = null;
      return action;
    }
    return { type: 'prompt', text: "Select object:" };
  }

  onInput(_text: string, _id: string, _units: UnitsConfig): CommandResponse | undefined {
    if (this.selectedEntity) {
      const action: CommandResponse = { type: 'action', action: 'list', entity: this.selectedEntity };
      this.selectedEntity = null;
      return action;
    }
    return { type: 'prompt', text: "Select object:" };
  }

  getPrompt() {
    return "LIST Select object:";
  }
}
