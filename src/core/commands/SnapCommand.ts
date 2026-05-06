import { Command, CommandResponse } from "./types";

export class SnapCommand implements Command {
  onPoint(): CommandResponse { return "Snap spacing or [On/Off]:"; }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "snap", value: true } as any;
    if (val === "OFF") return { action: "snap", value: false } as any;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "snapSet", spacing: num } as any;
    }
    
    if (val === "") return { action: "snapToggle" } as any;
    return "Invalid option. Snap spacing or [On/Off]:";
  }

  getPrompt() { return "Snap spacing or [On/Off] <Toggle>:"; }
}
