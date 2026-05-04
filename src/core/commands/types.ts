import { Entity } from "../model/Entity";

export type CommandAction = {
  action: 'finish' | 'close' | 'delete' | 'undo' | 'move' | 'zoom';
  id?: string;
  entity?: Entity;
  dx?: number;
  dy?: number;
  zoomType?: 'window' | 'all' | 'extents';
  p1?: { x: number; y: number };
  p2?: { x: number; y: number };
};

export type CommandResponse = string | Entity | CommandAction;

export interface Command {
  onPoint(x: number, y: number): CommandResponse;
  onInput?(text: string): CommandResponse | undefined;
  getPreview?(x: number, y: number): Entity | null;
  step?: number;
}
