import { Command, CommandResponse } from "./types";

export class OrthoCommand implements Command {
  onPoint(): CommandResponse { return "ORTHO [On/Off]:"; }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "ON") return { action: "ortho", value: true } as any;
    if (val === "OFF") return { action: "ortho", value: false } as any;
    if (val === "") return { action: "orthoToggle" } as any;
    return "Invalid option. ORTHO [On/Off]:";
  }

  getPrompt() { return "ORTHO [On/Off] <Toggle>:"; }
}
