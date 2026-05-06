import { Command, CommandResponse } from "./types"

export class LayerCommand implements Command {
  step = 0;
  private currentOption: string | null = null;
  private pendingColor: number | null = null;
  private pendingLinetype: string | null = null;

  onPoint(x: number, y: number, id: string): CommandResponse {
    return this.getPrompt();
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim();
    const upper = val.toUpperCase();

    if (this.step === 0) {
      if (upper === "" || upper === "E" || upper === "EXIT" || upper === "QUIT") {
        return { action: "finish" };
      }

      const parts = upper.split(/\s+/);
      const opt = parts[0];
      const arg = parts.slice(1).join(" ");

      if (opt === "?" || opt === "LIST") {
        return { action: "layerList" };
      }

      if (opt === "N" || opt === "NEW") {
        if (arg) return { action: "layerNew", name: arg };
        this.step = 1;
        this.currentOption = "NEW";
        return "New layer name:";
      }

      if (opt === "S" || opt === "SET") {
        if (arg) return { action: "layerSetCurrent", name: arg };
        this.step = 1;
        this.currentOption = "SET";
        return "Layer name to set as current:";
      }

      if (["ON", "OFF", "F", "FREEZE", "T", "THAW", "L", "LOCK", "U", "UNLOCK", "D", "DELETE"].includes(opt)) {
        const actionMap: Record<string, any> = {
            'ON': 'layerOn', 'OFF': 'layerOff', 
            'F': 'layerFreeze', 'FREEZE': 'layerFreeze',
            'T': 'layerThaw', 'THAW': 'layerThaw',
            'L': 'layerLock', 'LOCK': 'layerLock',
            'U': 'layerUnlock', 'UNLOCK': 'layerUnlock',
            'D': 'layerDelete', 'DELETE': 'layerDelete'
        };
        if (arg) return { action: actionMap[opt], names: arg };
        this.step = 1;
        this.currentOption = opt;
        return `Layer name(s) for ${opt}:`;
      }

      if (opt === "C" || opt === "COLOR") {
        const color = parseInt(parts[1]);
        const names = parts.slice(2).join(" ");
        if (!isNaN(color) && names) return { action: "layerColor", color, names };
        this.step = 2; // Color first
        this.currentOption = "COLOR";
        return "Color (0-255):";
      }

      if (opt === "LT" || opt === "LTYPE") {
        const lt = parts[1];
        const names = parts.slice(2).join(" ");
        if (lt && names) return { action: "layerLinetype", linetype: lt, names };
        this.step = 3; // Linetype first
        this.currentOption = "LTYPE";
        return "Linetype name:";
      }

      return "Invalid option. " + this.getPrompt();
    }

    // Step 1: Awaiting names/single arg
    if (this.step === 1) {
        const opt = this.currentOption!;
        this.step = 0;
        this.currentOption = null;

        if (opt === "NEW") return { action: "layerNew", name: val };
        if (opt === "SET") return { action: "layerSetCurrent", name: val };
        
        const actionMap: Record<string, any> = {
            'ON': 'layerOn', 'OFF': 'layerOff', 
            'F': 'layerFreeze', 'FREEZE': 'layerFreeze',
            'T': 'layerThaw', 'THAW': 'layerThaw',
            'L': 'layerLock', 'LOCK': 'layerLock',
            'U': 'layerUnlock', 'UNLOCK': 'layerUnlock',
            'D': 'layerDelete', 'DELETE': 'layerDelete'
        };
        return { action: actionMap[opt], names: val };
    }

    // Step 2: Color flow (Color -> Names)
    if (this.step === 2) {
        const color = parseInt(val);
        if (isNaN(color) || color < 0 || color > 255) return "Invalid color. Color (0-255):";
        this.pendingColor = color;
        this.step = 21;
        return "Layer name(s) for this color:";
    }
    if (this.step === 21) {
        const color = this.pendingColor!;
        this.pendingColor = null;
        this.step = 0;
        return { action: "layerColor", color, names: val };
    }

    // Step 3: Linetype flow (LT -> Names)
    if (this.step === 3) {
        this.pendingLinetype = val;
        this.step = 31;
        return "Layer name(s) for this linetype:";
    }
    if (this.step === 31) {
        const lt = this.pendingLinetype!;
        this.pendingLinetype = null;
        this.step = 0;
        return { action: "layerLinetype", linetype: lt, names: val };
    }

    return undefined;
  }

  getPrompt() {
    if (this.step === 1) {
        if (this.currentOption === "NEW") return "New layer name:";
        if (this.currentOption === "SET") return "Layer name to set as current:";
        return `Layer name(s) for ${this.currentOption}:`;
    }
    if (this.step === 2) return "Color (0-255):";
    if (this.step === 21) return "Layer name(s) for this color:";
    if (this.step === 3) return "Linetype name:";
    if (this.step === 31) return "Layer name(s) for this linetype:";
    
    return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
  }
}
