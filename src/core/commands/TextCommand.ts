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
      const echo = FormatUtils.formatPoint(x, y, "Start point")
      return `${echo}\nHeight <${this.height}>:`
    }
    
    if (this.step === 1) {
      // Use point to determine height
      const dx = x - this.x
      const dy = y - this.y
      this.height = Math.sqrt(dx * dx + dy * dy) || 10
      this.step = 2
      return `Height set to ${this.height.toFixed(2)}\nRotation angle <${this.rotation}>:`
    }

    if (this.step === 2) {
      // Use point to determine rotation
      const dx = x - this.x
      const dy = y - this.y
      this.rotation = Math.atan2(dy, dx) * (180 / Math.PI)
      this.step = 3
      return `Rotation set to ${this.rotation.toFixed(2)}\nText:`
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
          return "Invalid height. Height <10>:"
        }
      }
      this.step = 2
      return `Rotation angle <${this.rotation}>:`
    }

    if (this.step === 2) {
      if (val !== "") {
        const r = parseFloat(val)
        if (!isNaN(r)) {
          this.rotation = r
        } else {
          return "Invalid rotation angle. Rotation angle <0>:"
        }
      }
      this.step = 3
      return "Text:"
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

  getPreview(x: number, y: number) {
    if (this.step === 1) {
      // Just show insertion point crosshair or similar
      return null
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
