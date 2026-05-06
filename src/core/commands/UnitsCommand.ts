import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig } from "../model/Document"

export class UnitsCommand implements Command {
  step = 0
  config: Partial<CommandAction> = {}

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0) {
      if (val === "" || val === "D" || val === "DECIMAL") {
          this.config.type = "decimal";
      } else if (val === "M" || val === "METRIC") {
          this.config.type = "metric";
      } else if (val === "A" || val === "ARCHITECTURAL") {
          this.config.type = "architectural";
      } else {
          return "Invalid unit type. Units [Decimal/Metric/Architectural] <Decimal>:";
      }
      
      this.step = 1;
      return "Precision (0-8) <4>:";
    }

    if (this.step === 1) {
      const p = parseInt(val);
      this.config.precision = isNaN(p) ? 4 : Math.max(0, Math.min(8, p));
      return { action: "unitsSet", ...this.config } as CommandAction;
    }
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse { return this.getPrompt(); }

  getPrompt() {
    if (this.step === 0) return "Units [Decimal/Metric/Architectural] <Decimal>:";
    return "Precision (0-8) <4>:";
  }
}
