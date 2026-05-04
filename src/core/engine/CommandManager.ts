
import { LineCommand } from "../commands/LineCommand"
import { CircleCommand } from "../commands/CircleCommand"
import { EraseCommand } from "../commands/EraseCommand"
import { MoveCommand } from "../commands/MoveCommand"
import { ZoomCommand } from "../commands/ZoomCommand"
import { Test3DCommand } from "../commands/Test3DCommand"
import { ArcCommand } from "../commands/ArcCommand"
import { CoordinateParser } from "./CoordinateParser"
import { CommandResponse, Command } from "../commands/types"

export class CommandManager {
  active: Command | null = null
  lastPoint: { x: number; y: number } | null = null

  execute(cmd:string): CommandResponse {
    if(cmd === "LINE"){
      this.active = new LineCommand()
      return "LINE command started: pick first point"
    }
    if(cmd === "CIRCLE"){
      this.active = new CircleCommand()
      return "CIRCLE command started: specify center point"
    }
    if(cmd === "ERASE"){
      this.active = new EraseCommand()
      return "ERASE command started: select object"
    }
    if(cmd === "MOVE"){
      this.active = new MoveCommand()
      return "MOVE command started: select object"
    }
    if(cmd === "ZOOM" || cmd === "Z"){
      this.active = new ZoomCommand()
      return "ZOOM [All/Window] <Window corner>:"
    }
    if(cmd === "TEST3D"){
      this.active = new Test3DCommand()
      return "TEST3D started: pick insertion point"
    }
    if(cmd === "ARC"){
      this.active = new ArcCommand()
      return "ARC command started: start point"
    }
    return "Unknown command: " + cmd
  }

  inputPoint(x:number,y:number): CommandResponse | undefined {
    this.lastPoint = { x, y }
    if(this.active){
      return this.active.onPoint(x,y)
    }
  }

  inputString(text:string): CommandResponse | undefined {
    const pt = CoordinateParser.parseCoordinate(text, this.lastPoint || undefined)
    if (pt) {
      return this.inputPoint(pt.x, pt.y)
    }

    if(this.active && this.active.onInput){
      return this.active.onInput(text)
    }
  }

  clearActive(){
    this.active = null
  }
}
