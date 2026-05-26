import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import * as THREE from "three";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Line } from "../model/Line";
import { Point } from "../model/Point";
import { SelectionEngine } from "../engine/SelectionEngine";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface Plane3D {
  normal: { x: number, y: number, z: number };
  offset: number;
}

function computeConvexHull3D(pts: Point3D[]): number[][] {
  if (pts.length < 4) {
    throw new Error("Need at least 4 points.");
  }
  const points = pts.map((p, idx) => ({
    x: p.x + Math.sin(idx * 1.7 + 0.1) * 1e-7,
    y: p.y + Math.sin(idx * 2.3 + 0.2) * 1e-7,
    z: p.z + Math.sin(idx * 2.9 + 0.3) * 1e-7
  }));

  const getSignedDistance = (plane: Plane3D, p: Point3D) => {
    return plane.normal.x * p.x + plane.normal.y * p.y + plane.normal.z * p.z - plane.offset;
  };

  const makePlane = (i0: number, i1: number, i2: number): Plane3D => {
    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
    const vx = p2.x - p0.x, vy = p2.y - p0.y, vz = p2.z - p0.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-9) return { normal: { x: 0, y: 0, z: 1 }, offset: p0.z };
    nx /= len; ny /= len; nz /= len;
    return { normal: { x: nx, y: ny, z: nz }, offset: nx * p0.x + ny * p0.y + nz * p0.z };
  };

  let i0 = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].x < points[i0].x) i0 = i;
  }

  let i1 = 0;
  let maxDistSq = -1;
  for (let i = 0; i < points.length; i++) {
    if (i === i0) continue;
    const dx = points[i].x - points[i0].x;
    const dy = points[i].y - points[i0].y;
    const dz = points[i].z - points[i0].z;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      i1 = i;
    }
  }

  let i2 = -1;
  let maxLineDistSq = -1;
  const p0 = points[i0], p1 = points[i1];
  const ux = p1.x - p0.x, uy = p1.y - p0.y, uz = p1.z - p0.z;
  const uLenSq = ux * ux + uy * uy + uz * uz || 1e-9;
  for (let i = 0; i < points.length; i++) {
    if (i === i0 || i === i1) continue;
    const px = points[i].x - p0.x, py = points[i].y - p0.y, pz = points[i].z - p0.z;
    const t = (px * ux + py * uy + pz * uz) / uLenSq;
    const dx = px - t * ux;
    const dy = py - t * uy;
    const dz = pz - t * uz;
    const dSq = dx * dx + dy * dy + dz * dz;
    if (dSq > maxLineDistSq) {
      maxLineDistSq = dSq;
      i2 = i;
    }
  }

  let i3 = -1;
  let maxPlaneDist = -1;
  const basePlane = makePlane(i0, i1, i2);
  for (let i = 0; i < points.length; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    const dist = Math.abs(getSignedDistance(basePlane, points[i]));
    if (dist > maxPlaneDist) {
      maxPlaneDist = dist;
      i3 = i;
    }
  }

  if (i2 === -1 || i3 === -1 || maxPlaneDist < 1e-9) {
    throw new Error("Collinear or coplanar.");
  }

  const cx = (points[i0].x + points[i1].x + points[i2].x + points[i3].x) / 4;
  const cy = (points[i0].y + points[i1].y + points[i2].y + points[i3].y) / 4;
  const cz = (points[i0].z + points[i1].z + points[i2].z + points[i3].z) / 4;
  const center = { x: cx, y: cy, z: cz };

  interface Face {
    v: [number, number, number];
    plane: Plane3D;
  }

  let faces: Face[] = [];
  const createFace = (v0: number, v1: number, v2: number) => {
    const plane = makePlane(v0, v1, v2);
    if (getSignedDistance(plane, center) > 0) {
      plane.normal.x *= -1;
      plane.normal.y *= -1;
      plane.normal.z *= -1;
      plane.offset *= -1;
      return { v: [v2, v1, v0] as [number, number, number], plane };
    }
    return { v: [v0, v1, v2] as [number, number, number], plane };
  };

  faces.push(createFace(i0, i1, i2));
  faces.push(createFace(i0, i2, i3));
  faces.push(createFace(i0, i3, i1));
  faces.push(createFace(i1, i3, i2));

  const processed = new Set<number>([i0, i1, i2, i3]);
  for (let i = 0; i < points.length; i++) {
    if (processed.has(i)) continue;
    const pt = points[i];
    const visible: number[] = [];
    for (let f = 0; f < faces.length; f++) {
      if (getSignedDistance(faces[f].plane, pt) > 1e-9) {
        visible.push(f);
      }
    }
    if (visible.length === 0) continue;

    const edgeCounts = new Map<string, { v1: number; v2: number; count: number }>();
    for (const fIdx of visible) {
      const f = faces[fIdx];
      for (let j = 0; j < 3; j++) {
        const v1 = f.v[j];
        const v2 = f.v[(j + 1) % 3];
        const key = `${v1}-${v2}`;
        const keyRev = `${v2}-${v1}`;
        if (edgeCounts.has(keyRev)) {
          edgeCounts.get(keyRev)!.count++;
        } else if (edgeCounts.has(key)) {
          edgeCounts.get(key)!.count++;
        } else {
          edgeCounts.set(key, { v1, v2, count: 1 });
        }
      }
    }

    const horizon: { v1: number; v2: number }[] = [];
    for (const edge of edgeCounts.values()) {
      if (edge.count === 1) {
        horizon.push(edge);
      }
    }

    faces = faces.filter((_, idx) => !visible.includes(idx));
    for (const edge of horizon) {
      faces.push(createFace(edge.v1, edge.v2, i));
    }
  }

  return faces.map(f => f.v);
}

function downsamplePoints(pts: Point3D[], maxPoints: number = 150): Point3D[] {
  if (pts.length <= maxPoints) return pts;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  let iminX = 0, imaxX = 0, iminY = 0, imaxY = 0, iminZ = 0, imaxZ = 0;
  
  const len = pts.length;
  for (let i = 0; i < len; i++) {
    const p = pts[i];
    if (p.x < minX) { minX = p.x; iminX = i; }
    if (p.x > maxX) { maxX = p.x; imaxX = i; }
    if (p.y < minY) { minY = p.y; iminY = i; }
    if (p.y > maxY) { maxY = p.y; imaxY = i; }
    if (p.z < minZ) { minZ = p.z; iminZ = i; }
    if (p.z > maxZ) { maxZ = p.z; imaxZ = i; }
  }
  
  const extremes = new Set<number>([iminX, imaxX, iminY, imaxY, iminZ, imaxZ]);
  const result: Point3D[] = [];
  extremes.forEach(idx => result.push(pts[idx]));
  
  const step = Math.ceil(len / maxPoints);
  for (let i = 0; i < len; i += step) {
    if (!extremes.has(i)) {
      result.push(pts[i]);
    }
  }
  return result;
}

export class HullCommand implements Command {
  selectedIds: string[] = [];
  clickedPoints: Point3D[] = [];
  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;

    if (doc) {
      const tolerance = 5;
      const entity = SelectionEngine.getEntityAtSpatial(x, y, tolerance, doc);
      if (entity instanceof Solid3D) {
        if (!this.selectedIds.includes(entity.id)) {
          this.selectedIds.push(entity.id);
          return `Selected solid: ${entity.id}. Select more shapes, click points, or press ENTER to bake hull.`;
        } else {
          return `Solid ${entity.id} already selected.`;
        }
      }
    }

    this.clickedPoints.push({ x, y, z: currentZ });
    const ptStr = FormatUtils.formatPoint(x, y, units, "P", currentZ);
    return `Added point: ${ptStr}. Select more shapes, click points, or press ENTER to bake hull.`;
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number; y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const input = text.trim().toUpperCase();

    if (input === "E" || input === "EXIT" || input === "QUIT") {
      return { action: "finish" };
    }

    if (input === "" || input === "ENTER" || input === "B" || input === "BAKE") {
      let totalPoints = this.clickedPoints.length;
      if (doc) {
        for (const sId of this.selectedIds) {
          const ent = doc.getEntity(sId);
          if (ent instanceof Solid3D) {
            totalPoints += ent.positions.length / 3;
          }
        }
      }

      if (totalPoints < 4) {
        return "Convex hull requires at least 4 unique points total across all selected shapes and points.";
      }

      return this.executeCreate(id, doc);
    }
  }

  private executeCreate(id: string, doc?: IDocument): Promise<CommandResponse> {
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;

    return this.occService.createConvexHull(this.clickedPoints, this.selectedIds, deflection, id)
      .then((geometry: THREE.BufferGeometry) => {
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];

        const solid = new Solid3D(
          id,
          positions,
          indices,
          geometry.userData?.faceMapping,
          geometry.userData?.edgeLines
        );
        solid.brepSnapshot = geometry.userData?.brepSnapshot;
        solid.creationParams = {
          type: 'hull',
          params: { points: this.clickedPoints, shapeIds: this.selectedIds }
        };

        this.selectedIds = [];
        this.clickedPoints = [];

        return solid;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error creating convex hull: ${msg}`;
      });
  }

  getPreview(x: number, y: number, units: UnitsConfig, doc?: IDocument): PreviewObject | null {
    const entities: Entity[] = [];
    const allPts: Point3D[] = [...this.clickedPoints];

    if (doc) {
      for (const sId of this.selectedIds) {
        const ent = doc.getEntity(sId);
        if (ent instanceof Solid3D) {
          for (let i = 0; i < ent.positions.length; i += 3) {
            allPts.push({
              x: ent.positions[i],
              y: ent.positions[i + 1],
              z: ent.positions[i + 2]
            });
          }
        }
      }
    }

    for (let i = 0; i < this.clickedPoints.length; i++) {
      const pt = new Point(`pt_${i}`, this.clickedPoints[i].x, this.clickedPoints[i].y);
      pt.elevation = this.clickedPoints[i].z;
      pt.properties.color = 0x00FF00;
      entities.push(pt);
    }

    allPts.push({ x, y, z: 0 });

    if (allPts.length >= 4) {
      try {
        const sampledPts = downsamplePoints(allPts, 150);
        const faces = computeConvexHull3D(sampledPts);
        const addedEdges = new Set<string>();
        for (const face of faces) {
          for (let j = 0; j < 3; j++) {
            const idx1 = face[j];
            const idx2 = face[(j + 1) % 3];
            const key = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
            if (addedEdges.has(key)) continue;
            addedEdges.add(key);

            const p1 = sampledPts[idx1];
            const p2 = sampledPts[idx2];
            const line = new Line(`hull_edge_${key}`, p1.x, p1.y, p2.x, p2.y, p1.z, p2.z - p1.z);
            line.properties.color = 0xFFA500;
            entities.push(line);
          }
        }
      } catch {
        if (this.clickedPoints.length > 0) {
          const lastPt = this.clickedPoints[this.clickedPoints.length - 1];
          const line = new Line("hull_coplanar_temp", lastPt.x, lastPt.y, x, y, lastPt.z, -lastPt.z);
          line.properties.color = 0x888888;
          entities.push(line);
        }
      }
    } else {
      for (let i = 0; i < this.clickedPoints.length - 1; i++) {
        const p1 = this.clickedPoints[i];
        const p2 = this.clickedPoints[i + 1];
        const line = new Line(`pt_conn_${i}`, p1.x, p1.y, p2.x, p2.y, p1.z, p2.z - p1.z);
        line.properties.color = 0x888888;
        entities.push(line);
      }
      if (this.clickedPoints.length > 0) {
        const lastPt = this.clickedPoints[this.clickedPoints.length - 1];
        const line = new Line("pt_conn_cursor", lastPt.x, lastPt.y, x, y, lastPt.z, -lastPt.z);
        line.properties.color = 0x888888;
        entities.push(line);
      }
    }

    return { type: "entities", entities };
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    return [
      `X: ${FormatUtils.formatDistance(x, units)}`,
      `Y: ${FormatUtils.formatDistance(y, units)}`
    ];
  }

  getPrompt() {
    return `HULL: Select solids or click points to form hull. Selected shapes: ${this.selectedIds.length}, custom points: ${this.clickedPoints.length}. Press ENTER to bake.`;
  }
}
