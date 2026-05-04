import { Entity } from "./Entity";

export interface PolylineVertex {
  x: number;
  y: number;
  bulge: number;
}

export class Polyline extends Entity {
  vertices: PolylineVertex[];
  closed: boolean;

  constructor(id: string, vertices: PolylineVertex[], closed: boolean = false) {
    super(id);
    this.vertices = vertices;
    this.closed = closed;
  }

  move(dx: number, dy: number) {
    this.vertices.forEach(v => {
      v.x += dx;
      v.y += dy;
    });
  }
}
