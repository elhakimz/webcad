import { Command, CommandResponse } from "./types";

export class GridCommand implements Command {
  onPoint(): CommandResponse { return "Grid spacing(X) or [On/Off]:"; }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "grid", value: true } as CommandResponse;
    if (val === "OFF") return { action: "grid", value: false } as CommandResponse;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "gridSet", spacing: num } as CommandResponse;
    }
    
    if (val === "") return { action: "gridToggle" } as CommandResponse;
    return "Invalid option. Grid spacing(X) or [On/Off]:";
  }

  getPrompt() { return "Grid spacing(X) or [On/Off] <Toggle>:"; }
}
