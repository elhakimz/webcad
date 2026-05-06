
import { LineCommand } from "../commands/LineCommand"
import { CircleCommand } from "../commands/CircleCommand"
import { EraseCommand } from "../commands/EraseCommand"
import { MoveCommand } from "../commands/MoveCommand"
import { CopyCommand } from "../commands/CopyCommand"
import { RotateCommand } from "../commands/RotateCommand"
import { ScaleCommand } from "../commands/ScaleCommand"
import { MirrorCommand } from "../commands/MirrorCommand"
import { ZoomCommand } from "../commands/ZoomCommand"
import { PanCommand } from "../commands/PanCommand"
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
import { LayerCommand } from "../commands/LayerCommand"
import { LinetypeCommand } from "../commands/LinetypeCommand"
import { CoordinateParser } from "./CoordinateParser"
import { CommandResponse, Command } from "../commands/types"

export class CommandManager {
  active: Command | null = null
  lastPoint: { x: number; y: number } | null = null

  execute(cmd:string, selection?: string[], entities?: Map<string, any>): CommandResponse {
    const parts = cmd.trim().split(/\s+/);
    const cmdName = parts[0].toUpperCase();
    const args = parts.slice(1);

    let response: CommandResponse | undefined;

    if(cmdName === "LINE"){
      this.active = new LineCommand()
      response = "LINE command started: pick first point"
    }
    else if(cmdName === "CIRCLE"){
      this.active = new CircleCommand()
      response = "CIRCLE command started: specify center point"
    }
    else if(cmdName === "ERASE"){
      if (selection && selection.length > 0) {
        return { action: "delete", ids: [...selection] };
      }
      this.active = new EraseCommand()
      response = "ERASE command started: select object"
    }
    else if(cmdName === "MOVE"){
      this.active = new MoveCommand(selection)
      response = selection && selection.length > 0 ? "Base point:" : "MOVE command started: select object"
    }
    else if(cmdName === "COPY"){
      this.active = new CopyCommand(selection)
      response = selection && selection.length > 0 ? "Base point:" : "COPY command started: select object"
    }
    else if(cmdName === "ROTATE"){
      const targetEntities = selection ? selection.map(id => entities?.get(id)).filter(Boolean) : [];
      this.active = new RotateCommand(selection, targetEntities)
      response = selection && selection.length > 0 ? "Base point:" : "ROTATE command started: select object"
    }
    else if(cmdName === "SCALE"){
      this.active = new ScaleCommand(selection)
      response = selection && selection.length > 0 ? "Base point:" : "SCALE command started: select object"
    }
    else if(cmdName === "MIRROR"){
      this.active = new MirrorCommand(selection)
      response = selection && selection.length > 0 ? "First point of mirror line:" : "MIRROR command started: select objects to mirror"
    }
    else if(cmdName === "ZOOM" || cmdName === "Z"){
      this.active = new ZoomCommand()
      response = "ZOOM [All/Window] <Window corner>:"
    }
    else if(cmdName === "PAN" || cmdName === "P"){
      this.active = new PanCommand()
      response = "PAN command: Click and drag to pan. Press ESC to exit."
    }
    else if(cmdName === "TEST3D"){
      this.active = new Test3DCommand()
      response = "TEST3D started: pick insertion point"
    }
    else if(cmdName === "ARC"){
      this.active = new ArcCommand()
      response = "ARC command started: start point"
    }
    else if(cmdName === "POINT"){
      this.active = new PointCommand()
      response = "POINT command started: pick point"
    }
    else if(cmdName === "PLINE"){
      this.active = new PolylineCommand()
      response = "PLINE command started: specify start point"
    }
    else if(cmdName === "POLYGON"){
      this.active = new PolygonCommand()
      response = "POLYGON Number of sides <4>:"
    }
    else if(cmdName === "TEXT"){
      this.active = new TextCommand()
      response = "TEXT start point:"
    }
    else if(cmdName === "SOLID"){
      this.active = new SolidCommand()
      response = "SOLID First point:"
    }
    else if(cmdName === "TRACE"){
      this.active = new TraceCommand()
      response = "TRACE line width <0.10>:"
    }
    else if(cmdName === "HATCH"){
      this.active = new HatchCommand()
      response = "HATCH: Select boundary point:"
    }
    else if(cmdName === "SKETCH"){
      this.active = new SketchCommand()
      response = "Sketch tolerance <2.0>:"
    }
    else if(cmdName === "SHAPE"){
      this.active = new ShapeCommand()
      response = "Enter shape name:"
    }
    else if(cmdName === "LAYER" || cmdName === "LA"){
      this.active = new LayerCommand()
      response = "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
    }
    else if(cmdName === "LINETYPE" || cmdName === "LTYPE" || cmdName === "LT"){
      this.active = new LinetypeCommand()
      response = "Enter linetype option [?/Set] <?>:"
    }
    else if(cmdName === "REGEN"){
      return { action: "regen" }
    }
    else if(cmdName === "UNDO" || cmdName === "U"){
      return { action: "undo" }
    }
    else if(cmdName === "REDO" || cmdName === "R"){
      return { action: "redo" }
    }
    else {
      return "Unknown command: " + cmdName
    }

    // Feed additional arguments if provided
    for (const arg of args) {
      if (this.active) {
        const nextRes = this.inputString(arg);
        if (nextRes) response = nextRes;
      }
    }

    return response;
  }

  inputPoint(x:number,y:number, idGenerator?: (prefix: string) => string): CommandResponse | undefined {
    this.lastPoint = { x, y }
    if(this.active){
      const id = idGenerator ? idGenerator(this.getPrefix(this.active)) : `TMP_${Date.now()}`;
      return this.active.onPoint(x,y, id)
    }
  }

  inputString(text:string, idGenerator?: (prefix: string) => string): CommandResponse | undefined {
    const pt = CoordinateParser.parseCoordinate(text, this.lastPoint || undefined)
    if (pt) {
      return this.inputPoint(pt.x, pt.y, idGenerator)
    }

    if(this.active && this.active.onInput){
      const id = idGenerator ? idGenerator(this.getPrefix(this.active)) : `TMP_${Date.now()}`;
      return this.active.onInput(text, id)
    }
  }

  private getPrefix(cmd: Command): string {
    const name = cmd.constructor.name;
    const prefixMap: Record<string, string> = {
      'LineCommand': 'L',
      'CircleCommand': 'C',
      'ArcCommand': 'A',
      'PointCommand': 'PT',
      'PolylineCommand': 'PL',
      'PolygonCommand': 'PG',
      'TextCommand': 'TX',
      'SolidCommand': 'SD',
      'TraceCommand': 'TR',
      'HatchCommand': 'H'
    };
    return prefixMap[name] || 'E';
  }

  clearActive(){
    this.active = null
  }
}
