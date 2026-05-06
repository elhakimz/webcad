import { Command, CommandResponse } from "./types";

export class GridCommand implements Command {
  onPoint(): CommandResponse { return "Grid spacing(X) or [On/Off]:"; }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "grid", value: true } as any;
    if (val === "OFF") return { action: "grid", value: false } as any;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "gridSet", spacing: num } as any;
    }
    
    if (val === "") return { action: "gridToggle" } as any;
    return "Invalid option. Grid spacing(X) or [On/Off]:";
  }

  getPrompt() { return "Grid spacing(X) or [On/Off] <Toggle>:"; }
}
