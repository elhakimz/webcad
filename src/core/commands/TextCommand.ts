import { Text } from "../model/Text"
import { Command, CommandResponse } from "./types"
import { FormatUtils } from "../engine/FormatUtils"

let idCounter = 0

export class TextCommand implements Command {
  step = 0
  x = 0
  y = 0
  height = 10
  rotation = 0
  text = ""

  onPoint(x: number, y: number): CommandResponse {
    if (this.step === 0) {
      this.x = x
      this.y = y
      this.step = 1
      return FormatUtils.formatPoint(x, y, "Start point")
    }
    
    if (this.step === 1) {
      // Use point to determine height
      const dx = x - this.x
      const dy = y - this.y
      const h = Math.sqrt(dx * dx + dy * dy)
      if (h > 1e-6) {
        this.height = h
      }
      this.step = 2
      return `Height set to ${this.height.toFixed(4)}`
    }

    if (this.step === 2) {
      // Use point to determine rotation
      const dx = x - this.x
      const dy = y - this.y
      if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
        this.rotation = Math.atan2(dy, dx) * (180 / Math.PI)
      }
      this.step = 3
      return `Rotation set to ${this.rotation.toFixed(2)}`
    }

    return "Waiting for text input."
  }

  onInput(text: string): CommandResponse | undefined {
    const val = text.trim()
    
    if (val.toUpperCase() === "CANCEL" || val.toUpperCase() === "EXIT") {
        return { action: "finish" }
    }

    if (this.step === 1) {
      if (val !== "") {
        const h = parseFloat(val)
        if (!isNaN(h) && h > 0) {
          this.height = h
        } else {
          return "Invalid height."
        }
      }
      this.step = 2
      return `Height set to ${this.height.toFixed(4)}`
    }

    if (this.step === 2) {
      if (val !== "") {
        const r = parseFloat(val)
        if (!isNaN(r)) {
          this.rotation = r
        } else {
          return "Invalid rotation angle."
        }
      }
      this.step = 3
      return `Rotation set to ${this.rotation.toFixed(2)}`
    }

    if (this.step === 3) {
      // Finalize the command
      const textEntity = new Text(
        "T" + (++idCounter),
        this.x, this.y,
        this.height, this.rotation,
        text // use original text to preserve spaces
      )
      this.step = 0
      ;(textEntity as any)._echo = "Text created."
      return textEntity
    }
  }

  getPrompt() {
    if (this.step === 0) return "TEXT start point:"
    if (this.step === 1) return `Height <${this.height.toFixed(4)}>:`
    if (this.step === 2) return `Rotation angle <${this.rotation.toFixed(2)}>:`
    if (this.step === 3) return "Text:"
    return ""
  }

  getPreview(x: number, y: number) {
    if (this.step === 1) {
      // Show line from insertion point to mouse to indicate height
      const dx = x - this.x;
      const dy = y - this.y;
      const h = Math.sqrt(dx * dx + dy * dy) || this.height;
      return new Text("PREVIEW", this.x, this.y, h, this.rotation, "Abc");
    }
    if (this.step === 2) {
      // Show line from insertion point to mouse to indicate rotation
      const dx = x - this.x;
      const dy = y - this.y;
      let r = this.rotation;
      if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6) {
        r = Math.atan2(dy, dx) * (180 / Math.PI);
      }
      return new Text("PREVIEW", this.x, this.y, this.height, r, "Abc");
    }
    if (this.step === 3) {
        return new Text("PREVIEW", this.x, this.y, this.height, this.rotation, "Abc");
    }
    return null
  }

  getReferencePoints() {
    if (this.step > 0) {
      return [{ x: this.x, y: this.y }]
    }
    return []
  }
}
