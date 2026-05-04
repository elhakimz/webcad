import { Entity } from "../model/Entity";

export type CommandAction = {
  action: 'finish' | 'close' | 'delete' | 'undo' | 'move' | 'zoom' | 'copy' | 'rotate' | 'scale' | 'mirror' | 'trace' | 'hatch';
  id?: string;
  ids?: string[];
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
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  width?: number;
  boundaryId?: string;
  pattern?: string;
  patternScale?: number;
  patternAngle?: number;
};

export type CommandResponse = string | Entity | CommandAction;

export interface Command {
  onPoint(x: number, y: number): CommandResponse;
  onInput?(text: string): CommandResponse | undefined;
  getPreview?(x: number, y: number): Entity | null;
  getReferencePoints?(): { x: number, y: number }[];
  getPrompt?(): string;
  step?: number;
}
