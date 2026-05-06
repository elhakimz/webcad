import { Entity } from "../model/Entity";

export type CommandAction = {
  action: 'finish' | 'close' | 'delete' | 'undo' | 'redo' | 'move' | 'zoom' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'trace' | 'hatch' | 'layerList' | 'layerNew' | 'layerSetCurrent' | 'layerOn' | 'layerOff' | 'layerFreeze' | 'layerThaw' | 'layerLock' | 'layerUnlock' | 'layerColor' | 'layerLinetype' | 'layerDelete' | 'linetypeList' | 'linetypeSet' | 'regen' | 'create3d' | 'save' | 'load' | 'ortho' | 'orthoToggle' | 'grid' | 'gridToggle' | 'gridSet' | 'snap' | 'snapToggle' | 'snapSet';
  id?: string;
  ids?: string[];
  filename?: string;
  value?: boolean;
  spacing?: number;

  entity?: Entity;
  dx?: number;
  dy?: number;
  baseX?: number;
  baseY?: number;
  angle?: number;
  factor?: number;
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
};

export type CommandResponse = string | Entity | CommandAction;

export interface Command {
  onPoint(x: number, y: number, id: string): CommandResponse;
  onInput?(text: string, id: string): CommandResponse | undefined;
  getPreview?(x: number, y: number): Entity | null;
  getReferencePoints?(): { x: number, y: number }[];
  getPrompt?(): string;
  step?: number;
}
