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

function getFormattedDateTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `DWG-${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export class DBSaveCommand implements Command {
  projectName: string = "";

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { 
    const defaultName = getFormattedDateTime();
    return `Enter project name to save to database <${defaultName}>:`; 
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim();
    if (val !== "") {
      if (this.projectName) {
        this.projectName += " " + val;
      } else {
        this.projectName = val;
      }
    }
    const finalName = this.projectName || getFormattedDateTime();
    return { action: "dbsave", projectName: finalName };
  }

  getPrompt() { 
    const defaultName = getFormattedDateTime();
    return `Save project to database <${defaultName}>:`; 
  }
}

export class DBLoadCommand implements Command {
  projectName: string = "";

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return "Enter project name to load from database (or ? for list):";
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim();
    if (val === "?") {
      return { action: "dblistFiles" };
    }
    if (val !== "") {
      if (this.projectName) {
        this.projectName += " " + val;
      } else {
        this.projectName = val;
      }
    }
    const finalName = this.projectName;
    if (!finalName) return "Project name required. Load project from database:";
    return { action: "dbload", projectName: finalName };
  }

  getPrompt() {
    return "Load project from database (or ? for list):";
  }
}
