import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig } from "../model/Document";
import { Entity } from "../model/Entity";

export class ListCommand implements Command {
  selectedEntity: Entity | null = null;

  setEntity(entity: Entity) {
    this.selectedEntity = entity;
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.selectedEntity) {
      const action: CommandAction = { action: 'list', entity: this.selectedEntity };
      this.selectedEntity = null;
      return action as CommandResponse;
    }
    return "Select object:";
  }

  onInput(text: string, _id: string, _units: UnitsConfig): CommandResponse | undefined {
    if ((text === "" || text.toUpperCase() === "ENTER") && this.selectedEntity) {
      const action: CommandAction = { action: 'list', entity: this.selectedEntity };
      this.selectedEntity = null;
      return action as CommandResponse;
    }
    return "Select object:";
  }

  getPrompt() {
    return "LIST Select object:";
  }
}
