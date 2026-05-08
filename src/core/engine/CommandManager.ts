
import { LineCommand } from "../commands/LineCommand"
import { CircleCommand } from "../commands/CircleCommand"
import { DonutCommand } from "../commands/DonutCommand"
import { SplineCommand } from "../commands/SplineCommand"
import { EllipseCommand } from "../commands/EllipseCommand"
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
import { RectangCommand } from "../commands/RectangCommand"
import { TextCommand } from "../commands/TextCommand"
import { TraceCommand } from "../commands/TraceCommand"
import { SolidCommand } from "../commands/SolidCommand"
import { HatchCommand } from "../commands/HatchCommand"
import { SketchCommand } from "../commands/SketchCommand"
import { ShapeCommand } from "../commands/ShapeCommand"
import { LayerCommand } from "../commands/LayerCommand"
import { LinetypeCommand } from "../commands/LinetypeCommand"
import { SaveCommand, LoadCommand, NewCommand } from "../commands/IOCommands"
import { UnitsCommand } from "../commands/UnitsCommand"
import { FilletCommand } from "../commands/FilletCommand"
import { ChamferCommand } from "../commands/ChamferCommand"
import { BreakCommand } from "../commands/BreakCommand"
import { JoinCommand } from "../commands/JoinCommand"
import { LengthenCommand } from "../commands/LengthenCommand"
import { DimLinearCommand } from "../commands/DimLinearCommand"
import { DimAlignedCommand } from "../commands/DimAlignedCommand"
import { DimRadiusCommand } from "../commands/DimRadiusCommand"
import { DimDiameterCommand } from "../commands/DimDiameterCommand"
import { DimAngularCommand } from "../commands/DimAngularCommand"
import { DimTohCommand } from "../commands/DimTohCommand"
import { DimTadCommand } from "../commands/DimTadCommand"
import { StretchCommand } from "../commands/StretchCommand"
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
import { UnitsConfig } from "../model/Document"

export class CommandManager {
  active: Command | null = null
  lastPoint: { x: number; y: number } | null = null

  getAvailableCommands(): string[] {
    return [
      "LINE", "CIRCLE", "DONUT", "ELLIPSE", "SPLINE", 
      "ERASE", "E", "MOVE", "COPY", "ROTATE", "SCALE", "MIRROR", 
      "ZOOM", "Z", "PAN", "P", "TEST3D", "ARC", "POINT", "PLINE", 
      "POLYGON", "RECTANG", "REC", "RECTANGLE", "TEXT", "SOLID", 
      "TRACE", "HATCH", "SKETCH", "SHAPE", "LAYER", "LA", 
      "LINETYPE", "LTYPE", "LT", "SAVE", "LOAD", "NEW", "UNITS", 
      "ORTHO", "GRID", "SNAP", "ARRAY", "OFFSET", "FILLET", 
      "CHAMFER", "BREAK", "JOIN", "LENGTHEN", "DIMLINEAR", 
      "DIMALIGNED", "DIMRADIUS", "DIMDIAMETER", "DIMANGULAR", 
      "STRETCH", "TRIM", "EXTEND", "BLOCK", "INSERT", "REGEN", 
      "UNDO", "U", "REDO", "R", "DIMTOH", "DIMTAD"
    ];
  }

  execute(cmd:string, units: UnitsConfig, selection?: string[], entities?: Map<string, Entity>): CommandResponse {
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
    else if(cmdName === "DONUT"){
      this.active = new DonutCommand()
      response = "DONUT"
    }
    else if(cmdName === "ELLIPSE"){
      this.active = new EllipseCommand()
      response = "ELLIPSE"
    }
    else if(cmdName === "SPLINE"){
      this.active = new SplineCommand()
      response = "SPLINE"
    }
    else if(cmdName === "ERASE" || cmdName === "E"){

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
      const _targetEntities = selection ? selection.map(id => entities?.get(id)).filter(Boolean) : [];
      this.active = new RotateCommand(selection)
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
    else if(cmdName === "RECTANG" || cmdName === "REC" || cmdName === "RECTANGLE"){
      this.active = new RectangCommand()
      response = "RECTANG"
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
    else if(cmdName === "NEW"){
      this.active = new NewCommand()
      response = "NEW"
    }
    else if(cmdName === "UNITS"){
      this.active = new UnitsCommand()
      response = "UNITS"
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
    else if(cmdName === "DIMTOH"){
      this.active = new DimTohCommand()
      response = "DIMTOH"
    }
    else if(cmdName === "DIMTAD"){
      this.active = new DimTadCommand()
      response = "DIMTAD"
    }
    else if(cmdName === "ARRAY"){
      this.active = new ArrayCommand(selection)
      response = "ARRAY"
    }
    else if(cmdName === "OFFSET"){
      this.active = new OffsetCommand()
      response = "OFFSET"
    }
    else if(cmdName === "FILLET"){
      this.active = new FilletCommand()
      response = "FILLET"
    }
    else if(cmdName === "CHAMFER"){
      this.active = new ChamferCommand()
      response = "CHAMFER"
    }
    else if(cmdName === "BREAK"){
      this.active = new BreakCommand()
      response = "BREAK"
    }
    else if(cmdName === "JOIN"){
      if (selection && selection.length > 0) {
        return { action: "join", ids: [...selection] };
      }
      this.active = new JoinCommand()
      response = "JOIN"
    }
    else if(cmdName === "LENGTHEN"){
      this.active = new LengthenCommand()
      response = "LENGTHEN"
    }
    else if(cmdName === "DIMLINEAR"){
      this.active = new DimLinearCommand()
      response = "DIMLINEAR"
    }
    else if(cmdName === "DIMALIGNED"){
      this.active = new DimAlignedCommand()
      response = "DIMALIGNED"
    }
    else if(cmdName === "DIMRADIUS"){
      this.active = new DimRadiusCommand()
      response = "DIMRADIUS"
    }
    else if(cmdName === "DIMDIAMETER"){
      this.active = new DimDiameterCommand()
      response = "DIMDIAMETER"
    }
    else if(cmdName === "DIMANGULAR"){
      this.active = new DimAngularCommand()
      response = "DIMANGULAR"
    }
    else if(cmdName === "STRETCH"){
      this.active = new StretchCommand()
      response = "STRETCH"
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
        const nextRes = this.inputString(arg, units);
        if (nextRes) response = nextRes;
      }
    }

    return response;
  }

  inputPoint(x:number,y:number, units: UnitsConfig, idGenerator?: (prefix: string) => string, doc?: any): CommandResponse | undefined {
    this.lastPoint = { x, y }
    if(this.active){
      const id = idGenerator ? idGenerator(this.getPrefix(this.active)) : `TMP_${Date.now()}`;
      return this.active.onPoint(x,y, id, units, doc)
    }
  }

  inputString(text:string, units: UnitsConfig, idGenerator?: (prefix: string) => string, pickPt?: { x: number, y: number }, doc?: any): CommandResponse | undefined {
    const pt = CoordinateParser.parseCoordinate(text, this.lastPoint || undefined)
    if (pt) {
      return this.inputPoint(pt.x, pt.y, units, idGenerator, doc)
    }

    if(this.active && this.active.onInput){
      const id = idGenerator ? idGenerator(this.getPrefix(this.active)) : `TMP_${Date.now()}`;
      return this.active.onInput(text, id, units, pickPt)
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
