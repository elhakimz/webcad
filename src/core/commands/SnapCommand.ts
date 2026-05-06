import { Command, CommandResponse } from "./types";

export class SnapCommand implements Command {
  onPoint(): CommandResponse { return "Snap spacing(X) or [On/Off]:"; }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "snap", value: true } as CommandResponse;
    if (val === "OFF") return { action: "snap", value: false } as CommandResponse;
    
    const num = parseFloat(text);
    if (!isNaN(num) && num > 0) {
        return { action: "snapSet", spacing: num } as CommandResponse;
    }

    if (val === "") return { action: "snapToggle" } as CommandResponse;
    return "Invalid option. Snap spacing(X) or [On/Off]:";
  }

  getPrompt() { return "Snap spacing(X) or [On/Off] <Toggle>:"; }
}
