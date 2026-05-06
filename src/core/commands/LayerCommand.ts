import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class LayerCommand implements Command {
  step = 0
  option = ""

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === 'EXIT' || val === '') return { action: 'finish' };

    if (this.step === 0) {
      if (val === "?" || val === "LIST") return { action: "layerList" } as CommandResponse;
      if (val === "N" || val === "NEW") { this.step = 1; this.option = "N"; return "New layer name:"; }
      if (val === "S" || val === "SET") { this.step = 1; this.option = "S"; return "Current layer name:"; }
      if (val === "ON") { this.step = 1; this.option = "ON"; return "Layer(s) to turn ON:"; }
      if (val === "OFF") { this.step = 1; this.option = "OFF"; return "Layer(s) to turn OFF:"; }
      if (val === "F" || val === "FREEZE") { this.step = 1; this.option = "F"; return "Layer(s) to FREEZE:"; }
      if (val === "T" || val === "THAW") { this.step = 1; this.option = "T"; return "Layer(s) to THAW:"; }
      if (val === "L" || val === "LOCK") { this.step = 1; this.option = "L"; return "Layer(s) to LOCK:"; }
      if (val === "U" || val === "UNLOCK") { this.step = 1; this.option = "U"; return "Layer(s) to UNLOCK:"; }
      if (val === "C" || val === "COLOR") { this.step = 1; this.option = "C"; return "Color (1-7):"; }
      if (val === "LT" || val === "LTYPE") { this.step = 1; this.option = "LT"; return "Linetype name:"; }
      if (val === "D" || val === "DELETE") { this.step = 1; this.option = "D"; return "Layer to delete:"; }
      if (val === "") return { action: "finish" } as CommandResponse;
      
      return "Invalid option. Enter option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
    }

    if (this.step === 1) {
      const opt = this.option;
      this.step = 0;
      this.option = "";

      if (opt === "N") return { action: "layerNew", name: val } as CommandResponse;
      if (opt === "S") return { action: "layerSetCurrent", name: val } as CommandResponse;
      if (opt === "ON") return { action: "layerOn", names: val } as CommandResponse;
      if (opt === "OFF") return { action: "layerOff", names: val } as CommandResponse;
      if (opt === "F") return { action: "layerFreeze", names: val } as CommandResponse;
      if (opt === "T") return { action: "layerThaw", names: val } as CommandResponse;
      if (opt === "L") return { action: "layerLock", names: val } as CommandResponse;
      if (opt === "U") return { action: "layerUnlock", names: val } as CommandResponse;
      if (opt === "D") return { action: "layerDelete", name: val } as CommandResponse;

      if (opt === "C") {
          this.option = val; // Store color
          this.step = 2; // Need layer name
          return "Layer name(s) for color " + val + ":";
      }

      if (opt === "LT") {
          this.option = val; // Store linetype
          this.step = 2;
          return "Layer name(s) for linetype " + val + ":";
      }
    }

    if (this.step === 2) {
        const value = this.option;
        const isColor = !isNaN(parseInt(value));
        this.step = 0;
        this.option = "";
        if (isColor) return { action: "layerColor", color: parseInt(value), names: val } as CommandResponse;
        return { action: "layerLinetype", linetype: value, names: val } as CommandResponse;
    }
  }

  getPrompt() {
    if (this.step === 0) return "Layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
    if (this.option === "N") return "New layer name:";
    if (this.option === "S") return "Current layer name:";
    return "";
  }
}
