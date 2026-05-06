import { Command, CommandResponse } from "./types"

export class LayerCommand implements Command {
  onPoint(x: number, y: number, id: string): CommandResponse {
    return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    const parts = val.split(/\s+/);
    const opt = parts[0];

    if (opt === "?" || opt === "LIST") {
      return { action: "layerList" };
    }
    if (opt === "N" || opt === "NEW") {
      const name = parts[1] || "";
      if (name) return { action: "layerNew", name };
      return "New layer name:";
    }
    if (opt === "S" || opt === "SET") {
      const name = parts[1] || "";
      if (name) return { action: "layerSetCurrent", name };
      return "Layer name to set as current:";
    }
    if (opt === "ON") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerOn", names };
      return "Layer name(s) to turn ON:";
    }
    if (opt === "OFF") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerOff", names };
      return "Layer name(s) to turn OFF:";
    }
    if (opt === "F" || opt === "FREEZE") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerFreeze", names };
      return "Layer name(s) to freeze:";
    }
    if (opt === "T" || opt === "THAW") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerThaw", names };
      return "Layer name(s) to thaw:";
    }
    if (opt === "L" || opt === "LOCK") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerLock", names };
      return "Layer name(s) to lock:";
    }
    if (opt === "U" || opt === "UNLOCK") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerUnlock", names };
      return "Layer name(s) to unlock:";
    }
    if (opt === "C" || opt === "COLOR") {
      const color = parseInt(parts[1]);
      const names = parts.slice(2).join(",");
      if (!isNaN(color) && names) return { action: "layerColor", color, names };
      return "Layer color (0-255) and name(s):";
    }
    if (opt === "LT" || opt === "LTYPE") {
      const linetype = parts[1];
      const names = parts.slice(2).join(",");
      if (linetype && names) return { action: "layerLinetype", linetype, names };
      return "Linetype and layer name(s):";
    }
    if (opt === "D" || opt === "DELETE") {
      const names = parts.slice(1).join(",");
      if (names) return { action: "layerDelete", names };
      return "Layer name(s) to delete:";
    }

    return "Invalid layer option. [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
  }

  getPrompt() {
    return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:";
  }
}
