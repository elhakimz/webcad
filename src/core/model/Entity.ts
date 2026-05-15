
import { SnapPoint } from "../engine/SnapEngine";

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Grip {
  id: string;
  point: { x: number; y: number };
  type: 'endpoint' | 'midpoint' | 'center' | 'custom';
}

export abstract class Entity {
  id: string
  layer: string = "0"
  properties: Record<string, unknown> = {}
  _echo?: string;
  elevation: number = 0;
  thickness: number = 0;

  constructor(id: string) {
    this.id = id
  }

  abstract move(dx: number, dy: number): void;
  abstract rotate(baseX: number, baseY: number, angleRad: number): void;
  abstract scale(baseX: number, baseY: number, factor: number): void;
  abstract mirror(p1: { x: number; y: number }, p2: { x: number; y: number }): void;
  abstract getBoundingBox(): BoundingBox;
  abstract clone(newId: string): Entity;

  hitTest?(px: number, py: number, tolerance: number): boolean;
  getSnapPoints?(): SnapPoint[];
  getGrips?(): Grip[];
  moveGrip?(gripId: string, newPosition: { x: number; y: number }): void;
}
