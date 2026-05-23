import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document";
import { PersistenceService } from "../persistence/PersistenceService";

export class SaveCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "Enter filename to save:"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const filename = text.trim() || "drawing";
    const name = filename.endsWith(".dxf") ? filename : filename + ".dxf";
    return { action: "save", filename: name };
  }

  getPrompt() { return "Save drawing as <drawing.dxf>:"; }
}

export class LoadCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "Enter filename to load (or ? for list):"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const filename = text.trim();
    if (filename === "?") return { action: "listFiles" };
    if (!filename) return "Filename required. Load drawing:";
    const name = filename.endsWith(".dxf") ? filename : filename + ".dxf";
    return { action: "load", filename: name };
  }

  getPrompt() { return "Load drawing (filename.dxf or ?):"; }
}

export class NewCommand implements Command {
  step = 0;
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return "Start a new drawing? (Y/N):"; }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0) {
      if (val === "Y" || val === "YES") {
        return { action: "new" };
      } else {
        return "Command canceled.";
      }
    }
  }

  getPrompt() { return "Start a new drawing? (Y/N):"; }
}

export class DBSaveCommand implements Command {
  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    const currentName = PersistenceService.getInstance().activeProjectName || "Untitled";
    return `Enter project name to save to database <${currentName}>:`; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const currentName = PersistenceService.getInstance().activeProjectName || "Untitled";
    const projName = text.trim() || currentName;
    return { action: "dbsave", projectName: projName };
  }

  getPrompt() { 
    const currentName = PersistenceService.getInstance().activeProjectName || "Untitled";
    return `Save project to database <${currentName}>:`; 
  }
}
