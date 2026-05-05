import { Command, CommandResponse } from "./types"
import { LINETYPES } from "../engine/MathUtils"

export class LinetypeCommand implements Command {
  step = 0

  private getLinetypeListString(): string {
    return "CONTINUOUS, " + Object.keys(LINETYPES).join(", ");
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim().toUpperCase()

    if (this.step === 0) {
      if (val === "" || val === "?") {
        return { action: "linetypeList" }
      }
      
      if (val === "S" || val === "SET") {
        this.step = 10
        return `Linetype name(s) (or ?) [${this.getLinetypeListString()}] <CONTINUOUS>:`
      }

      return "Invalid option. Enter linetype option [?/Set] <?>:"
    }

    if (this.step === 10) {
      if (val === "?") {
        return { action: "linetypeList" }
      }
      this.step = 0
      const lt = val || "CONTINUOUS"
      return { action: "linetypeSet", linetype: lt }
    }

    this.step = 0
    return "Invalid option"
  }

  onPoint(x: number, y: number): CommandResponse {
    return "Enter linetype option [?/Set] <?>:"
  }

  getPrompt() {
    return "Enter linetype option [?/Set] <?>:"
  }
}
