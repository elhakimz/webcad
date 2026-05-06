
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
import { SaveCommand, LoadCommand } from "../commands/IOCommands"
import { OrthoCommand } from "../commands/OrthoCommand"
import { GridCommand } from "../commands/GridCommand"
import { SnapCommand } from "../commands/SnapCommand"
import { ArrayCommand } from "../commands/ArrayCommand"
import { OffsetCommand } from "../commands/OffsetCommand"
import { TrimCommand } from "../commands/TrimCommand"
import { ExtendCommand } from "../commands/ExtendCommand"
import { BlockCommand } from "../commands/BlockCommand"
import { InsertCommand } from "../commands/InsertCommand"
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
      response = "LINE"
    }
    else if(cmdName === "CIRCLE"){
      this.active = new CircleCommand()
      response = "CIRCLE"
    }
    else if(cmdName === "ERASE"){
      if (selection && selection.length > 0) {
        return { action: "delete", ids: [...selection] };
      }
      this.active = new EraseCommand()
      response = "ERASE"
    }
    else if(cmdName === "MOVE"){
      this.active = new MoveCommand(selection)
      response = "MOVE"
    }
    else if(cmdName === "COPY"){
      this.active = new CopyCommand(selection)
      response = "COPY"
    }
    else if(cmdName === "ROTATE"){
      const targetEntities = selection ? selection.map(id => entities?.get(id)).filter(Boolean) : [];
      this.active = new RotateCommand(selection, targetEntities)
      response = "ROTATE"
    }
    else if(cmdName === "SCALE"){
      this.active = new ScaleCommand(selection)
      response = "SCALE"
    }
    else if(cmdName === "MIRROR"){
      this.active = new MirrorCommand(selection)
      response = "MIRROR"
    }
    else if(cmdName === "ZOOM" || cmdName === "Z"){
      this.active = new ZoomCommand()
      response = "ZOOM"
    }
    else if(cmdName === "PAN" || cmdName === "P"){
      this.active = new PanCommand()
      response = "PAN"
    }
    else if(cmdName === "TEST3D"){
      this.active = new Test3DCommand()
      response = "TEST3D"
    }
    else if(cmdName === "ARC"){
      this.active = new ArcCommand()
      response = "ARC"
    }
    else if(cmdName === "POINT"){
      this.active = new PointCommand()
      response = "POINT"
    }
    else if(cmdName === "PLINE"){
      this.active = new PolylineCommand()
      response = "PLINE"
    }
    else if(cmdName === "POLYGON"){
      this.active = new PolygonCommand()
      response = "POLYGON"
    }
    else if(cmdName === "TEXT"){
      this.active = new TextCommand()
      response = "TEXT"
    }
    else if(cmdName === "SOLID"){
      this.active = new SolidCommand()
      response = "SOLID"
    }
    else if(cmdName === "TRACE"){
      this.active = new TraceCommand()
      response = "TRACE"
    }
    else if(cmdName === "HATCH"){
      this.active = new HatchCommand()
      response = "HATCH"
    }
    else if(cmdName === "SKETCH"){
      this.active = new SketchCommand()
      response = "SKETCH"
    }
    else if(cmdName === "SHAPE"){
      this.active = new ShapeCommand()
      response = "SHAPE"
    }
    else if(cmdName === "LAYER" || cmdName === "LA"){
      this.active = new LayerCommand()
      response = "LAYER"
    }
    else if(cmdName === "LINETYPE" || cmdName === "LTYPE" || cmdName === "LT"){
      this.active = new LinetypeCommand()
      response = "LINETYPE"
    }
    else if(cmdName === "SAVE"){
      this.active = new SaveCommand()
      response = "SAVE"
    }
    else if(cmdName === "LOAD"){
      this.active = new LoadCommand()
      response = "LOAD"
    }
    else if(cmdName === "ORTHO"){
      this.active = new OrthoCommand()
      response = "ORTHO"
    }
    else if(cmdName === "GRID"){
      this.active = new GridCommand()
      response = "GRID"
    }
    else if(cmdName === "SNAP"){
      this.active = new SnapCommand()
      response = "SNAP"
    }
    else if(cmdName === "ARRAY"){
      this.active = new ArrayCommand(selection)
      response = "ARRAY"
    }
    else if(cmdName === "OFFSET"){
      this.active = new OffsetCommand()
      response = "OFFSET"
    }
    else if(cmdName === "TRIM"){
      this.active = new TrimCommand(selection)
      response = "TRIM"
    }
    else if(cmdName === "EXTEND"){
      this.active = new ExtendCommand(selection)
      response = "EXTEND"
    }
    else if(cmdName === "BLOCK"){
      this.active = new BlockCommand(selection)
      response = "BLOCK"
    }
    else if(cmdName === "INSERT"){
      this.active = new InsertCommand()
      response = "INSERT"
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
