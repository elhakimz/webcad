import { Command, CommandResponse } from "./types"

export class LinetypeCommand implements Command {
  onPoint(_x: number, _y: number, _id: string): CommandResponse {
    return this.getPrompt();
  }

  onInput(text: string, _id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === "?" || val === "LIST") return { action: "linetypeList" } as CommandResponse;
    if (val === "") return "Linetype name (or ?):";
    return { action: "linetypeSet", linetype: val } as CommandResponse;
  }

  getPrompt() {
    return "LINETYPE name (or ?) <CONTINUOUS>:";
  }
}
