import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig } from "../model/Document";

export class IdCommand implements Command {
  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return { type: 'action', action: 'id', pick1: { x, y } };
  }

  getPrompt() {
    return "ID Specify point:";
  }
}
