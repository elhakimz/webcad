import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"

export class LayerCommand implements Command {
  step = 0
  option = ""

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return { type: 'prompt', text: this.getPrompt() };
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (val === 'EXIT' || val === '') return { type: 'action', action: 'finish' };

    if (this.step === 0) {
      if (val === "?" || val === "LIST") return { type: 'action', action: "layerList" };
      if (val === "N" || val === "NEW") { this.step = 1; this.option = "N"; return { type: 'prompt', text: "New layer name:" }; }
      if (val === "S" || val === "SET") { this.step = 1; this.option = "S"; return { type: 'prompt', text: "Current layer name:" }; }
      if (val === "ON") { this.step = 1; this.option = "ON"; return { type: 'prompt', text: "Layer(s) to turn ON:" }; }
      if (val === "OFF") { this.step = 1; this.option = "OFF"; return { type: 'prompt', text: "Layer(s) to turn OFF:" }; }
      if (val === "F" || val === "FREEZE") { this.step = 1; this.option = "F"; return { type: 'prompt', text: "Layer(s) to FREEZE:" }; }
      if (val === "T" || val === "THAW") { this.step = 1; this.option = "T"; return { type: 'prompt', text: "Layer(s) to THAW:" }; }
      if (val === "L" || val === "LOCK") { this.step = 1; this.option = "L"; return { type: 'prompt', text: "Layer(s) to LOCK:" }; }
      if (val === "U" || val === "UNLOCK") { this.step = 1; this.option = "U"; return { type: 'prompt', text: "Layer(s) to UNLOCK:" }; }
      if (val === "C" || val === "COLOR") { this.step = 1; this.option = "C"; return { type: 'prompt', text: "Color (1-7):" }; }
      if (val === "LT" || val === "LTYPE") { this.step = 1; this.option = "LT"; return { type: 'prompt', text: "Linetype name:" }; }
      if (val === "D" || val === "DELETE") { this.step = 1; this.option = "D"; return { type: 'prompt', text: "Layer to delete:" }; }
      if (val === "") return { type: 'action', action: "finish" };
      
      return { type: 'prompt', text: "Invalid option. Enter option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:" };
    }

    if (this.step === 1) {
      const opt = this.option;
      this.step = 0;
      this.option = "";

      if (opt === "N") return { type: 'action', action: "layerNew", name: val };
      if (opt === "S") return { type: 'action', action: "layerSetCurrent", name: val };
      if (opt === "ON") return { type: 'action', action: "layerOn", names: val };
      if (opt === "OFF") return { type: 'action', action: "layerOff", names: val };
      if (opt === "F") return { type: 'action', action: "layerFreeze", names: val };
      if (opt === "T") return { type: 'action', action: "layerThaw", names: val };
      if (opt === "L") return { type: 'action', action: "layerLock", names: val };
      if (opt === "U") return { type: 'action', action: "layerUnlock", names: val };
      if (opt === "D") return { type: 'action', action: "layerDelete", name: val };

      if (opt === "C") {
          this.option = val; // Store color
          this.step = 2; // Need layer name
          return { type: 'prompt', text: "Layer name(s) for color " + val + ":" };
      }

      if (opt === "LT") {
          this.option = val; // Store linetype
          this.step = 2;
          return { type: 'prompt', text: "Layer name(s) for linetype " + val + ":" };
      }
    }

    if (this.step === 2) {
        const value = this.option;
        const isColor = !isNaN(parseInt(value));
        this.step = 0;
        this.option = "";
        if (isColor) return { type: 'action', action: "layerColor", color: parseInt(value), names: val };
        return { type: 'action', action: "layerLinetype", linetype: value, names: val };
    }
  }

  getPrompt() {
    if (this.step === 0) return "Layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
    if (this.option === "N") return "New layer name:";
    if (this.option === "S") return "Current layer name:";
    return "";
  }
}
