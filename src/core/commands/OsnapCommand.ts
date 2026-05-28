import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";

export class OsnapCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return { type: 'action', action: "osnapToggle" };
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { type: 'action', action: "osnap", value: true };
    if (val === "OFF") return { type: 'action', action: "osnap", value: false };
    
    if (val === "") return { type: 'action', action: "osnapToggle" };
    return { type: 'prompt', text: "Invalid option. OSNAP [On/Off]:" };
  }

  getPrompt() { return "OSNAP [On/Off] <Toggle>:"; }
}
