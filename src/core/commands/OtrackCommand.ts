import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class OtrackCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return { type: 'action', action: "otrackToggle" };
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "otrack", value: true };
    if (val === "OFF") return { type: 'action', action: "otrack", value: false };
    
    if (val === "") return { type: 'action', action: "otrackToggle" };
    return { type: 'prompt', text: "Invalid option. OTRACK [On/Off]:" };
  }

  getPrompt() { return "OTRACK [On/Off] <Toggle>:"; }
}
