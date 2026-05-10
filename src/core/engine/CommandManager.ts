
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
import { MTextCommand } from "../commands/MTextCommand"
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
import { IdCommand } from "../commands/IdCommand"
import { DistCommand } from "../commands/DistCommand"
import { AreaCommand } from "../commands/AreaCommand"
import { ListCommand } from "../commands/ListCommand"
import { NoteCommand } from "../commands/NoteCommand"
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
import { UnitsConfig, Document } from "../model/Document"
import { Entity } from "../model/Entity"

type CommandFactory = (selection?: string[]) => Command | CommandResponse;

const commandRegistry = new Map<string, CommandFactory>([
  ["LINE", () => new LineCommand()],
  ["CIRCLE", () => new CircleCommand()],
  ["DONUT", () => new DonutCommand()],
  ["ELLIPSE", () => new EllipseCommand()],
  ["SPLINE", () => new SplineCommand()],
  ["ID", () => new IdCommand()],
  ["DIST", () => new DistCommand()],
  ["AREA", () => new AreaCommand()],
  ["LIST", () => new ListCommand()],
  ["ANNOTATE", () => new NoteCommand()],
  ["NOTE", () => new NoteCommand()],
  ["ERASE", (selection) => {
    if (selection && selection.length > 0) {
      return { action: "delete", ids: [...selection] };
    }
    return new EraseCommand();
  }],
  ["E", (selection) => {
    if (selection && selection.length > 0) {
      return { action: "delete", ids: [...selection] };
    }
    return new EraseCommand();
  }],
  ["MOVE", (selection) => new MoveCommand(selection)],
  ["COPY", (selection) => new CopyCommand(selection)],
  ["ROTATE", (selection) => new RotateCommand(selection)],
  ["SCALE", (selection) => new ScaleCommand(selection)],
  ["MIRROR", (selection) => new MirrorCommand(selection)],
  ["ZOOM", () => new ZoomCommand()],
  ["Z", () => new ZoomCommand()],
  ["PAN", () => new PanCommand()],
  ["P", () => new PanCommand()],
  ["TEST3D", () => new Test3DCommand()],
  ["ARC", () => new ArcCommand()],
  ["POINT", () => new PointCommand()],
  ["PLINE", () => new PolylineCommand()],
  ["POLYGON", () => new PolygonCommand()],
  ["RECTANG", () => new RectangCommand()],
  ["REC", () => new RectangCommand()],
  ["RECTANGLE", () => new RectangCommand()],
  ["TEXT", () => new TextCommand()],
  ["MTEXT", () => new MTextCommand()],
  ["SOLID", () => new SolidCommand()],
  ["TRACE", () => new TraceCommand()],
  ["HATCH", () => new HatchCommand()],
  ["SKETCH", () => new SketchCommand()],
  ["SHAPE", () => new ShapeCommand()],
  ["LAYER", () => new LayerCommand()],
  ["LA", () => new LayerCommand()],
  ["LINETYPE", () => new LinetypeCommand()],
  ["LTYPE", () => new LinetypeCommand()],
  ["LT", () => new LinetypeCommand()],
  ["SAVE", () => new SaveCommand()],
  ["LOAD", () => new LoadCommand()],
  ["NEW", () => new NewCommand()],
  ["UNITS", () => new UnitsCommand()],
  ["ORTHO", () => new OrthoCommand()],
  ["GRID", () => new GridCommand()],
  ["SNAP", () => new SnapCommand()],
  ["ARRAY", (selection) => new ArrayCommand(selection)],
  ["OFFSET", () => new OffsetCommand()],
  ["FILLET", () => new FilletCommand()],
  ["CHAMFER", () => new ChamferCommand()],
  ["BREAK", () => new BreakCommand()],
  ["JOIN", (selection) => {
    if (selection && selection.length > 0) {
      return { action: "join", ids: [...selection] };
    }
    return new JoinCommand();
  }],
  ["LENGTHEN", () => new LengthenCommand()],
  ["DIMLINEAR", () => new DimLinearCommand()],
  ["DIMALIGNED", () => new DimAlignedCommand()],
  ["DIMRADIUS", () => new DimRadiusCommand()],
  ["DIMDIAMETER", () => new DimDiameterCommand()],
  ["DIMANGULAR", () => new DimAngularCommand()],
  ["STRETCH", () => new StretchCommand()],
  ["TRIM", (selection) => new TrimCommand(selection)],
  ["EXTEND", (selection) => new ExtendCommand(selection)],
  ["BLOCK", (selection) => new BlockCommand(selection)],
  ["INSERT", () => new InsertCommand()],
  ["REGEN", () => ({ action: "regen" })],
  ["UNDO", () => ({ action: "undo" })],
  ["U", () => ({ action: "undo" })],
  ["REDO", () => ({ action: "redo" })],
  ["R", () => ({ action: "redo" })],
  ["DIMTOH", () => new DimTohCommand()],
  ["DIMTAD", () => new DimTadCommand()],
]);

export class CommandManager {
  active: Command | null = null
  lastPoint: { x: number; y: number } | null = null

  getAvailableCommands(): string[] {
    return Array.from(commandRegistry.keys());
  }

  execute(cmd:string, units: UnitsConfig, selection?: string[], entities?: Map<string, Entity>): CommandResponse {
    const parts = cmd.trim().split(/\s+/);
    const cmdName = parts[0].toUpperCase();
    const args = parts.slice(1);

    let response: CommandResponse | undefined;

    const factory = commandRegistry.get(cmdName);
    if (!factory) {
      return "Unknown command: " + cmdName;
    }

    const result = factory(selection);
    if (result && typeof result === 'object' && 'onPoint' in result) {
      this.active = result as Command;
      response = cmdName;
    } else {
      return result as CommandResponse;
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

  inputPoint(x:number,y:number, units: UnitsConfig, idGenerator?: (prefix: string) => string, doc?: Document): CommandResponse | undefined {
    this.lastPoint = { x, y }
    if(this.active){
      const id = idGenerator ? idGenerator(this.getPrefix(this.active)) : `TMP_${Date.now()}`;
      return this.active.onPoint(x,y, id, units, doc)
    }
  }

  inputString(text:string, units: UnitsConfig, idGenerator?: (prefix: string) => string, pickPt?: { x: number, y: number }, doc?: Document): CommandResponse | undefined {
    const pt = CoordinateParser.parseCoordinate(text, units, this.lastPoint || undefined)
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
