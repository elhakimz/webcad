import { Entity } from "../model/Entity";
import { UnitsConfig, IDocument } from "../model/Document";

export type CommandAction = {
  action: 'finish' | 'close' | 'delete' | 'undo' | 'redo' | 'move' | 'zoom' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'trace' | 'hatch' | 'layerList' | 'layerNew' | 'layerSetCurrent' | 'layerOn' | 'layerOff' | 'layerFreeze' | 'layerThaw' | 'layerLock' | 'layerUnlock' | 'layerColor' | 'layerLinetype' | 'layerLineweight' | 'layerDelete' | 'linetypeList' | 'linetypeSet' | 'regen' | 'create3d' | 'save' | 'load' | 'ortho' | 'orthoToggle' | 'grid' | 'gridToggle' | 'gridSet' | 'snap' | 'snapToggle' | 'snapSet' | 'array' | 'offset' | 'trim' | 'extend' | 'block' | 'insert' | 'blockList' | 'unitsSet' | 'fillet' | 'chamfer' | 'break' | 'join' | 'lengthen' | 'dimlinear' | 'dimaligned' | 'dimradius' | 'dimangular' | 'new' | 'listFiles' | 'stretch' | 'dimtoh' | 'dimtad' | 'dimtohToggle' | 'dimtadToggle' | 'id' | 'dist' | 'area' | 'list' | 'plot' | 'plot_window' | 'showPlotDialog' | 'boolean_result' | 'sweep' | 'loft_result' | 'fillet_solid' | 'chamfer_solid' | 'fillet_solid_face' | 'chamfer_solid_face' | 'shell' | 'generator_placed' | 'rebuild_all' | 'rebuild' | 'elevationSet' | 'thicknessSet';

  id?: string;
  ids?: string[];
  id1?: string;
  id2?: string;
  pick1?: { x: number, y: number };
  pick2?: { x: number, y: number };
  radius?: number;
  dist1?: number;
  dist2?: number;
  filename?: string;
  value?: boolean | number;
  spacing?: number;
  precision?: number;
  type?: string;
  faceIndex?: number;
  cornerMode?: string;
  result?: Entity;
  deleteIds?: string[];
  rows?: number;
  cols?: number;
  rowSpacing?: number;
  colSpacing?: number;
  distance?: number;
  sidePt?: { x: number, y: number };
  boundaryIds?: string[];
  pickPt?: { x: number, y: number };
  arrayType?: 'R' | 'P';
  center?: { x: number, y: number };
  count?: number;
  angleToFill?: number;
  rotateObjects?: boolean;
  thickness?: number;
  faceIndices?: number[];
  generator?: string;
  params?: Record<string, unknown>;

  entity?: Entity;
  entities?: Entity[];
  dx?: number;
  dy?: number;
  dz?: number;
  baseX?: number;
  baseY?: number;
  basePoint?: { x: number; y: number };
  point?: { x: number; y: number };
  angle?: number;
  rotation?: number;
  factor?: number;
  scaleX?: number;
  scaleY?: number;
  zoomType?: 'window' | 'all' | 'extents' | 'scale';
  p1?: { x: number; y: number };
  p2?: { x: number; y: number };
  deleteOriginal?: boolean;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  width?: number;
  lineweight?: number;
  boundaryId?: string;
  pattern?: string;
  patternScale?: number;
  patternAngle?: number;
  name?: string;
  names?: string;
  color?: number;
  linetype?: string;
  filter?: string;
  _echo?: string;
  mode?: 'DELTA' | 'PERCENT' | 'TOTAL';
  dimStyle?: {
    textHeight?: number;
    arrowSize?: number;
    offset?: number;
    gap?: number;
    precision?: number;
  };
  plotSettings?: PlotSettings;
  plotAreaWindow?: { x1: number; y1: number; x2: number; y2: number };
  close?: boolean;
};

export type TaggedPrompt = { type: 'prompt'; text: string };
export type TaggedEntity = { type: 'entity'; entity: Entity };
export type TaggedAction = { type: 'action' } & CommandAction;

export type CommandResponse = string | Entity | CommandAction | TaggedPrompt | TaggedEntity | TaggedAction;

export type ZoomWindowPreview = { type: 'zoomwindow', id: string, x1: number, y1: number, x2: number, y2: number };
export type SelectionBoxPreview = { type: 'selection_box', x1: number, y1: number, x2: number, y2: number, isCrossing: boolean };
export type XMarkerPreview = { type: 'xmarker', x: number, y: number, size?: number };
export type PLinePointsPreview = { type: 'plinepoints', points: { x: number, y: number }[] };
export type SolidPointsPreview = { type: 'solidpoints', points: { x: number, y: number }[] };
export type RotationPreview = { type: 'rotation_preview', angle: number, baseX: number, baseY: number };
export type PolylinePreview = { type: 'polyline_preview', vertices: { x: number, y: number, bulge: number }[], closed: boolean };
export type MovePreview = { type: 'move_preview', dx: number, dy: number };
export type CopyPreview = { type: 'copy_preview', dx: number, dy: number };
export type ScalePreview = { type: 'scale_preview', factor: number, baseX: number, baseY: number };
export type SplinePreview = { type: 'spline_preview', controlPoints: { x: number, y: number }[], degree: number, knots: number[] };
export type EntitiesPreview = { type: 'entities', entities: Entity[] };

export type PreviewObject = Entity | ZoomWindowPreview | SelectionBoxPreview | XMarkerPreview | PLinePointsPreview | SolidPointsPreview | RotationPreview | PolylinePreview | MovePreview | CopyPreview | ScalePreview | SplinePreview | EntitiesPreview;

export interface Command {
  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse>;
  onInput?(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined;
  getPreview?(x: number, y: number, units: UnitsConfig, doc?: IDocument): PreviewObject | null;
  getReferencePoints?(): { x: number, y: number }[];
  getPrompt?(doc?: IDocument): string;
  getDynamicInput?(x: number, y: number, units: UnitsConfig): string[] | null;
  getOptions?(units: UnitsConfig): string[];
  step?: number;
}

export interface HasSetEntity {
  setEntity(entity: Entity): void;
}

export interface HasBasePoint {
  getBasePoint(): { x: number, y: number } | null;
}

export interface HasUpdateSketch {
  updateSketch(x: number, y: number): void;
}

export interface HasStartSketch {
  startSketch(x: number, y: number): CommandResponse | void;
}

export interface HasFinishSketch {
  finishSketch(id: string): CommandResponse | void;
}

export interface HasSelectedIds {
  selectedIds: string[];
}

// ── Plot types ────────────────────────────────────────────────

export type PlotAreaType = 'EXTENTS' | 'DISPLAY' | 'WINDOW';

export type PlotColorMode = 'as_displayed' | 'monochrome' | 'grayscale';

export type PlotOutputFormat = 'svg' | 'pdf' | 'png' | 'print';

export interface PaperSize {
  label: string;
  width: number;   // mm
  height: number;  // mm
}

export const PAPER_SIZES: Record<string, PaperSize> = {
  A4:   { label: 'A4',      width: 297,  height: 210  },
  A3:   { label: 'A3',      width: 420,  height: 297  },
  A2:   { label: 'A2',      width: 594,  height: 420  },
  A1:   { label: 'A1',      width: 841,  height: 594  },
  A0:   { label: 'A0',      width: 1189, height: 841  },
  LTR:  { label: 'Letter',  width: 279,  height: 216  },
  TBLD: { label: 'Tabloid', width: 432,  height: 279  },
};

export interface PlotScale {
  label: string;
  drawUnit: number;   // drawing units per paperMM
  paperMM: number;    // paper mm
  isFit: boolean;
}

export const PLOT_SCALES: PlotScale[] = [
  { label: 'Fit',    drawUnit: 1,    paperMM: 1, isFit: true  },
  { label: '1:1',    drawUnit: 1,    paperMM: 1, isFit: false },
  { label: '1:2',    drawUnit: 2,    paperMM: 1, isFit: false },
  { label: '1:5',    drawUnit: 5,    paperMM: 1, isFit: false },
  { label: '1:10',   drawUnit: 10,   paperMM: 1, isFit: false },
  { label: '1:20',   drawUnit: 20,   paperMM: 1, isFit: false },
  { label: '1:50',   drawUnit: 50,   paperMM: 1, isFit: false },
  { label: '1:100',  drawUnit: 100,  paperMM: 1, isFit: false },
  { label: '1:200',  drawUnit: 200,  paperMM: 1, isFit: false },
  { label: '1:500',  drawUnit: 500,  paperMM: 1, isFit: false },
  { label: '1:1000', drawUnit: 1000, paperMM: 1, isFit: false },
];

export interface PlotLayerOverride {
  visible: boolean;
  color?: number;         // ACI color override, undefined = use layer color
  lineweight?: number;    // mm override, undefined = use default
}

export interface PlotSettings {
  paperSizeKey: string;               // key into PAPER_SIZES
  orientation: 'landscape' | 'portrait';
  areaType: PlotAreaType;
  areaWindow?: { x1: number; y1: number; x2: number; y2: number };
  scale: PlotScale;
  centered: boolean;
  offsetX: number;        // mm, used only when centered = false
  offsetY: number;        // mm, used only when centered = false
  colorMode: PlotColorMode;
  outputFormat: PlotOutputFormat;
  dpi: number;            // for PNG output
  layerOverrides: Record<string, PlotLayerOverride>;
}

export const DEFAULT_PLOT_SETTINGS: PlotSettings = {
  paperSizeKey: 'A4',
  orientation: 'landscape',
  areaType: 'EXTENTS',
  scale: PLOT_SCALES[0],  // Fit
  centered: true,
  offsetX: 10,
  offsetY: 10,
  colorMode: 'as_displayed',
  outputFormat: 'svg',
  dpi: 300,
  layerOverrides: {},
};
