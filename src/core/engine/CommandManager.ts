
import { LineCommand } from "../commands/LineCommand"
import { CircleCommand } from "../commands/CircleCommand"
import { EraseCommand } from "../commands/EraseCommand"
import { MoveCommand } from "../commands/MoveCommand"
import { CopyCommand } from "../commands/CopyCommand"
import { RotateCommand } from "../commands/RotateCommand"
import { ScaleCommand } from "../commands/ScaleCommand"
import { MirrorCommand } from "../commands/MirrorCommand"
import { ZoomCommand } from "../commands/ZoomCommand"
import { Test3DCommand } from "../commands/Test3DCommand"
import { ArcCommand } from "../commands/ArcCommand"
import { PointCommand } from "../commands/PointCommand"
import { PolylineCommand } from "../commands/PolylineCommand"
import { PolygonCommand } from "../commands/PolygonCommand"
import { TextCommand } from "../commands/TextCommand"
import { TraceCommand } from "../commands/TraceCommand"
import { SolidCommand } from "../commands/SolidCommand"
import { HatchCommand } from "../commands/HatchCommand"
import { SketchCommand } from "../commands/SketchCommand"
import { ShapeCommand } from "../commands/ShapeCommand"
import { CoordinateParser } from "./CoordinateParser"
import { CommandResponse, Command } from "../commands/types"

export class CommandManager {
  active: Command | null = null
  lastPoint: { x: number; y: number } | null = null

  execute(cmd:string, selection?: string[]): CommandResponse {
    if(cmd === "LINE"){
      this.active = new LineCommand()
      return "LINE command started: pick first point"
    }
    if(cmd === "CIRCLE"){
      this.active = new CircleCommand()
      return "CIRCLE command started: specify center point"
    }
    if(cmd === "ERASE"){
      if (selection && selection.length > 0) {
        return { action: "delete", ids: [...selection] };
      }
      this.active = new EraseCommand()
      return "ERASE command started: select object"
    }
    if(cmd === "MOVE"){
      this.active = new MoveCommand(selection)
      return selection && selection.length > 0 ? "Base point:" : "MOVE command started: select object"
    }
    if(cmd === "COPY"){
      this.active = new CopyCommand(selection)
      return selection && selection.length > 0 ? "Base point:" : "COPY command started: select object"
    }
    if(cmd === "ROTATE"){
      this.active = new RotateCommand(selection)
      return selection && selection.length > 0 ? "Base point:" : "ROTATE command started: select object"
    }
    if(cmd === "SCALE"){
      this.active = new ScaleCommand(selection)
      return selection && selection.length > 0 ? "Base point:" : "SCALE command started: select object"
    }
    if(cmd === "MIRROR"){
      this.active = new MirrorCommand(selection)
      return selection && selection.length > 0 ? "First point of mirror line:" : "MIRROR command started: select objects to mirror"
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
    if(cmd === "POINT"){
      this.active = new PointCommand()
      return "POINT command started: pick point"
    }
    if(cmd === "PLINE"){
      this.active = new PolylineCommand()
      return "PLINE command started: specify start point"
    }
    if(cmd === "POLYGON"){
      this.active = new PolygonCommand()
      return "POLYGON Number of sides <4>:"
    }
    if(cmd === "TEXT"){
      this.active = new TextCommand()
      return "TEXT start point:"
    }
    if(cmd === "SOLID"){
      this.active = new SolidCommand()
      return "SOLID First point:"
    }
    if(cmd === "TRACE"){
      this.active = new TraceCommand()
      return "TRACE line width <0.10>:"
    }
    if(cmd === "HATCH"){
      this.active = new HatchCommand()
      return "HATCH: Select boundary point:"
    }
    if(cmd === "SKETCH"){
      this.active = new SketchCommand()
      return "Sketch tolerance <2.0>:"
    }
    if(cmd === "SHAPE"){
      this.active = new ShapeCommand()
      return "Enter shape name:"
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
