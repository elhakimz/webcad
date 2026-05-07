import { Entity } from "../model/Entity";
import { UnitsConfig } from "../model/Document";

export type CommandAction = {
  action: 'finish' | 'close' | 'delete' | 'undo' | 'redo' | 'move' | 'zoom' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'trace' | 'hatch' | 'layerList' | 'layerNew' | 'layerSetCurrent' | 'layerOn' | 'layerOff' | 'layerFreeze' | 'layerThaw' | 'layerLock' | 'layerUnlock' | 'layerColor' | 'layerLinetype' | 'layerDelete' | 'linetypeList' | 'linetypeSet' | 'regen' | 'create3d' | 'save' | 'load' | 'ortho' | 'orthoToggle' | 'grid' | 'gridToggle' | 'gridSet' | 'snap' | 'snapToggle' | 'snapSet' | 'array' | 'offset' | 'trim' | 'extend' | 'block' | 'insert' | 'blockList' | 'unitsSet' | 'fillet' | 'chamfer' | 'break' | 'new' | 'listFiles';

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
  value?: boolean;
  spacing?: number;
  precision?: number;
  type?: string;
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

  entity?: Entity;
  dx?: number;
  dy?: number;
  baseX?: number;
  baseY?: number;
  basePoint?: { x: number; y: number };
  point?: { x: number; y: number };
  angle?: number;
  rotation?: number;
  factor?: number;
  scaleX?: number;
  scaleY?: number;
  zoomType?: 'window' | 'all' | 'extents';
  p1?: { x: number; y: number };
  p2?: { x: number; y: number };
  deleteOriginal?: boolean;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  width?: number;
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
};

export type CommandResponse = string | Entity | CommandAction;

export type ZoomWindowPreview = { type: 'zoomwindow', id: string, x1: number, y1: number, x2: number, y2: number };
export type XMarkerPreview = { type: 'xmarker', x: number, y: number, size?: number };
export type PLinePointsPreview = { type: 'plinepoints', points: { x: number, y: number }[] };
export type SolidPointsPreview = { type: 'solidpoints', points: { x: number, y: number }[] };
export type RotationPreview = { type: 'rotation_preview', angle: number, baseX: number, baseY: number };
export type PolylinePreview = { type: 'polyline_preview', vertices: { x: number, y: number, bulge: number }[], closed: boolean };
export type MovePreview = { type: 'move_preview', dx: number, dy: number };
export type CopyPreview = { type: 'copy_preview', dx: number, dy: number };
export type ScalePreview = { type: 'scale_preview', factor: number, baseX: number, baseY: number };

export type PreviewObject = Entity | ZoomWindowPreview | XMarkerPreview | PLinePointsPreview | SolidPointsPreview | RotationPreview | PolylinePreview | MovePreview | CopyPreview | ScalePreview;

export interface Command {
  onPoint(x: number, y: number, id: string, units: UnitsConfig): CommandResponse;
  onInput?(text: string, id: string, units: UnitsConfig, pickPt?: { x: number, y: number }): CommandResponse | undefined;
  getPreview?(x: number, y: number, units: UnitsConfig): PreviewObject | null;
  getReferencePoints?(): { x: number, y: number }[];
  getPrompt?(): string;
  step?: number;
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
