import { Command, CommandResponse } from "./types"
import { LINETYPES } from "../engine/MathUtils"

export class LayerCommand implements Command {
  step = 0
  pendingValue = ""

  private getLinetypeListString(): string {
    return "CONTINUOUS, " + Object.keys(LINETYPES).join(", ");
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim()

    if (this.step === 0) {
      if (val === "") {
        return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
      }

      const opt = val.toUpperCase()

      if (opt === "N") {
        this.step = 10
        return "Enter name for new layer <0>:"
      }
      if (opt === "S") {
        this.step = 20
        return "Enter layer name to make current:"
      }
      if (opt === "ON") {
        this.step = 30
        return "Enter layer name(s) to turn ON:"
      }
      if (opt === "OFF") {
        this.step = 31
        return "Enter layer name(s) to turn OFF:"
      }
      if (opt === "F") {
        this.step = 40
        return "Enter layer name(s) to freeze:"
      }
      if (opt === "T") {
        this.step = 41
        return "Enter layer name(s) to thaw:"
      }
      if (opt === "L") {
        this.step = 50
        return "Enter layer name(s) to lock:"
      }
      if (opt === "U") {
        this.step = 51
        return "Enter layer name(s) to unlock:"
      }
      if (opt === "C") {
        this.step = 60
        return "Enter color number (1-255):"
      }
      if (opt === "LT") {
        this.step = 65
        return `Linetype name(s) (or ?) [${this.getLinetypeListString()}]:`
      }
      if (opt === "D") {
        this.step = 70
        return "Enter layer name(s) to delete:"
      }
      if (opt === "?") {
        return { action: "layerList", filter: "*" }
      }

      return "Invalid option. Enter option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
    }

    if (this.step === 10) {
      this.step = 0
      const name = val || "0"
      return { action: "layerNew", name }
    }
    if (this.step === 20) {
      this.step = 0
      return { action: "layerSetCurrent", name: val }
    }
    if (this.step === 30) {
      this.step = 0
      return { action: "layerOn", names: val }
    }
    if (this.step === 31) {
      this.step = 0
      return { action: "layerOff", names: val }
    }
    if (this.step === 40) {
      this.step = 0
      return { action: "layerFreeze", names: val }
    }
    if (this.step === 41) {
      this.step = 0
      return { action: "layerThaw", names: val }
    }
    if (this.step === 50) {
      this.step = 0
      return { action: "layerLock", names: val }
    }
    if (this.step === 51) {
      this.step = 0
      return { action: "layerUnlock", names: val }
    }
    if (this.step === 60) {
      this.pendingValue = val
      this.step = 61
      return "Enter layer name(s) for color change:"
    }
    if (this.step === 61) {
      this.step = 0
      return { action: "layerColor", color: parseInt(this.pendingValue) || 7, names: val }
    }
    if (this.step === 65) {
      if (val === "?") {
        return { action: "linetypeList" }
      }
      this.pendingValue = val
      this.step = 66
      return "Enter layer name(s) for linetype change:"
    }
    if (this.step === 66) {
      this.step = 0
      return { action: "layerLinetype", linetype: this.pendingValue, names: val }
    }
    if (this.step === 70) {
      this.step = 0
      return { action: "layerDelete", names: val }
    }

    this.step = 0
    return "Invalid option"
  }

  onPoint(x: number, y: number): CommandResponse {
    return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
  }

  getPrompt() {
    return "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
  }
}