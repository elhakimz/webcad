import { Command, CommandResponse } from "./types";

export class SaveCommand implements Command {
  onPoint(): CommandResponse { return "Enter filename to save:"; }

  onInput(text: string): CommandResponse | undefined {
    const filename = text.trim() || "drawing";
    const name = filename.endsWith(".dxf") ? filename : filename + ".dxf";
    return { action: "save", filename: name };
  }

  getPrompt() { return "Save drawing as <drawing.dxf>:"; }
}

export class LoadCommand implements Command {
  onPoint(): CommandResponse { return "Enter filename to load:"; }

  onInput(text: string): CommandResponse | undefined {
    const filename = text.trim();
    if (!filename) return "Filename required. Load drawing:";
    const name = filename.endsWith(".dxf") ? filename : filename + ".dxf";
    return { action: "load", filename: name };
  }

  getPrompt() { return "Load drawing (filename.dxf):"; }
}
