import { Command, CommandResponse } from "./types"

export class LinetypeCommand implements Command {
  onPoint(x: number, y: number, id: string): CommandResponse {
    return "Enter linetype option [?/Set] <?>:";
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    const parts = val.split(/\s+/);
    const opt = parts[0];

    if (opt === "?" || opt === "" || opt === "LIST") {
      return { action: "linetypeList" };
    }
    if (opt === "S" || opt === "SET") {
      const lt = parts[1] || "";
      if (lt) return { action: "linetypeSet", linetype: lt };
      return "New current linetype name:";
    }

    return "Invalid linetype option. [?/Set] <?>:";
  }

  getPrompt() {
    return "Enter linetype option [?/Set] <?>:";
  }
}
