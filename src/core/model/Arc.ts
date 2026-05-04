import { Entity } from "./Entity";

export class Arc extends Entity {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean;

  constructor(id: string, cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean) {
    super(id);
    this.cx = cx;
    this.cy = cy;
    this.r = r;
    this.startAngle = startAngle;
    this.endAngle = endAngle;
    this.ccw = ccw;
  }

  move(dx: number, dy: number) {
    this.cx += dx;
    this.cy += dy;
  }
}
