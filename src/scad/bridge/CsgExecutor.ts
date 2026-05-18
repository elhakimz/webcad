import { OpenCascadeService } from "../../core/io/OpenCascadeService";
import { EvaluatedGeometry } from "../interpreter/Geometry";
import * as THREE from "three";
import { Entity } from "../../core/model/Entity";
import { Line } from "../../core/model/Line";
import { Circle } from "../../core/model/Circle";
import { Arc } from "../../core/model/Arc";
import { Polyline } from "../../core/model/Polyline";
import { MText } from "../../core/model/MText";
import { Text } from "../../core/model/Text";
import { Dimension } from "../../core/model/Dimension";
import { Hatch } from "../../core/model/Hatch";


const OPENSCAD_COLOR_MAP: Record<string, number> = {
  // Reds/Pinks
  "red": 0xff0000,
  "crimson": 0xdc143c,
  "firebrick": 0xb22222,
  "darkred": 0x8b0000,
  "pink": 0xffc0cb,
  "lightpink": 0xffb6c1,
  "hotpink": 0xff69b4,
  "deeppink": 0xff1493,
  
  // Blues/Cyans
  "blue": 0x0000ff,
  "navy": 0x000080,
  "royalblue": 0x4169e1,
  "skyblue": 0x87ceeb,
  "deepskyblue": 0x00bfff,
  "dodgerblue": 0x1e90ff,
  "cyan": 0x00ffff,
  "aqua": 0x00ffff,
  "teal": 0x008080,
  "darkblue": 0x00008b,
  "mediumblue": 0x0000cd,
  "cadetblue": 0x5f9ea0,
  "steelblue": 0x4682b4,
  "lightskyblue": 0x87cefa,
  "powderblue": 0xb0e0e6,
  
  // Greens
  "green": 0x008000,
  "darkgreen": 0x006400,
  "lime": 0x00ff00,
  "limegreen": 0x32cd32,
  "forestgreen": 0x228b22,
  "seagreen": 0x2e8b57,
  "springgreen": 0x00ff7f,
  "olive": 0x808000,
  "olivedrab": 0x6b8e23,
  "yellowgreen": 0x9acd32,
  "mediumseagreen": 0x3cb371,
  
  // Yellows/Oranges
  "yellow": 0xffff00,
  "gold": 0xffd700,
  "orange": 0xffa500,
  "darkorange": 0xff8c00,
  "coral": 0xff7f50,
  "tomato": 0xff6347,
  "orangered": 0xff4500,
  "lightyellow": 0xffffe0,
  "lemonchiffon": 0xfffacd,
  
  // Purples
  "purple": 0x800080,
  "violet": 0xee82ee,
  "magenta": 0xff00ff,
  "fuchsia": 0xff00ff,
  "darkviolet": 0x9400d3,
  "indigo": 0x4b0082,
  "darkorchid": 0x9932cc,
  "mediumorchid": 0xba55d3,
  "plum": 0xdda0dd,
  "thistle": 0xd8bfd8,
  
  // Browns
  "brown": 0xa52a2a,
  "saddlebrown": 0x8b4513,
  "sienna": 0xa0522d,
  "chocolate": 0xd2691e,
  "peru": 0xcd853f,
  "sandybrown": 0xf4a460,
  "burlywood": 0xdeb887,
  "wheat": 0xf5deb3,
  "tan": 0xd2b48c,
  
  // Whites/Grays/Blacks
  "white": 0xffffff,
  "snow": 0xfffaf0,
  "honeydew": 0xf0fff0,
  "mintcream": 0xf5fffa,
  "azure": 0xf0ffff,
  "aliceblue": 0xf0f8ff,
  "ghostwhite": 0xf8f8ff,
  "whitesmoke": 0xf5f5f5,
  "seashell": 0xfff5ee,
  "beige": 0xf5f5dc,
  "oldlace": 0xfdf5e6,
  "floralwhite": 0xfffaf0,
  "ivory": 0xffffff,
  "linen": 0xfaf0e6,
  "antiquewhite": 0xfaebd7,
  "papayawhip": 0xffefd5,
  "blanchedalmond": 0xffebcd,
  "bisque": 0xffe4c4,
  "moccasin": 0xffe4b5,
  "navajowhite": 0xffdead,
  "peachpuff": 0xffdab9,
  "mistyrose": 0xffe4e1,
  "lavender": 0xe6e6fa,
  "lavenderblush": 0xfff0f5,
  
  "silver": 0xc0c0c0,
  "gray": 0x808080,
  "grey": 0x808080,
  "black": 0x000000,
  "darkgray": 0xa9a9a9,
  "darkgrey": 0xa9a9a9,
  "lightgray": 0xd3d3d3,
  "lightgrey": 0xd3d3d3,
  "gainsboro": 0xdcdcdc,
  "dimgray": 0x696969,
  "dimgrey": 0x696969,
  "slategray": 0x708090,
  "slategrey": 0x708090,
  "lightslategray": 0x778899,
  "lightslategrey": 0x778899,
  "darkslategray": 0x2f4f4f,
  "darkslategrey": 0x2f4f4f,
  
  // Custom
  "transparent": 0x000000
};


export class CsgExecutor {
  private occ: OpenCascadeService;
  private idCounter: number = 0;
  private tempIds: Set<string> = new Set();

  constructor() {
    this.occ = OpenCascadeService.getInstance();
  }

  async execute(geometry: EvaluatedGeometry[]): Promise<(THREE.BufferGeometry | Entity)[]> {
    this.idCounter = 0;
    this.tempIds.clear();
    const results: (THREE.BufferGeometry | Entity)[] = [];

    for (const node of geometry) {
      const geo = await this.evaluateNode(node);
      if (geo) {
        if (Array.isArray(geo)) {
          results.push(...geo);
        } else {
          results.push(geo);
        }
      }
    }

    // Cleanup all intermediate shapes except the final results
    console.log("CSG EXECUTOR RESULT GEOMETRIES:", results.length, results);
    const finalIds = new Set(results.map(g => g instanceof THREE.BufferGeometry ? (g.userData as any).entityId : null).filter(Boolean));
    const toRelease = Array.from(this.tempIds).filter(id => !finalIds.has(id));
    if (toRelease.length > 0) {
      await this.occ.releaseShapes(toRelease);
    }

    return results;
  }

  private async evaluateNode(node: EvaluatedGeometry): Promise<THREE.BufferGeometry | Entity | (THREE.BufferGeometry | Entity)[] | null> {
    const id = `scad_${this.idCounter++}`;
    this.tempIds.add(id);

    switch (node.type) {
      case "Primitive":
        return this.createPrimitive(node, id);

      case "Transform": {
        if (node.name === "linear_extrude" || node.name === "rotate_extrude") {
          const deflection = this.getDeflection(node.params);
          const extrudedShapes: THREE.BufferGeometry[] = [];

          for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const childId = `${id}_ext_${i}`;
            this.tempIds.add(childId);
            const geo = await this.extrudeOrRevolve(child, node.name as any, node.params, deflection, childId);
            if (geo) {
              extrudedShapes.push(geo);
            }
          }

          if (extrudedShapes.length > 0) {
            let finalGeo = extrudedShapes[0];
            if (extrudedShapes.length > 1) {
              finalGeo = await this.applyBoolean("union", extrudedShapes, id);
            } else {
              const oldChildId = (finalGeo.userData as any).entityId;
              const clonedGeo = await this.occ.transformShape(oldChildId, 0, 0, 0, id, deflection);
              if (clonedGeo) {
                finalGeo = clonedGeo;
              }
            }

            if (finalGeo) {
              finalGeo.userData = { ...finalGeo.userData, entityId: id };
              const firstColor = node.params.color ?? node.params.c;
              const hexColor = this.parseScadColor(firstColor);
              if (hexColor !== undefined) {
                finalGeo.userData.color = hexColor;
              }
              return finalGeo;
            }
          }
          return null;
        }

        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;

        const cadEntities: Entity[] = [];
        const occGeoms: THREE.BufferGeometry[] = [];
        for (const child of children) {
          if (child instanceof Entity) {
            cadEntities.push(child);
          } else if (child instanceof THREE.BufferGeometry) {
            occGeoms.push(child);
          }
        }

        const transformed: (THREE.BufferGeometry | Entity)[] = [];

        // Apply CAD transformations
        for (const entity of cadEntities) {
          const cloned = entity.clone(entity.id) as Entity;
          if (node.name === "translate") {
            const v = node.params.v ?? node.params[0] ?? [0, 0, 0];
            const tx = v[0] ?? 0;
            const ty = v[1] ?? 0;
            cloned.move(tx, ty);
          } else if (node.name === "rotate") {
            const v = node.params.a ?? node.params[0] ?? [0, 0, 0];
            let rx = 0, ry = 0, rz = 0;
            if (Array.isArray(v)) {
              rx = v[0] ?? 0;
              ry = v[1] ?? 0;
              rz = v[2] ?? 0;
            } else if (typeof v === 'number') {
              rz = v;
            }
            const rzRad = (rz * Math.PI) / 180;
            cloned.rotate(0, 0, rzRad);
          } else if (node.name === "scale") {
            const v = node.params.v ?? node.params[0] ?? [1, 1, 1];
            let fx = 1, fy = 1;
            if (Array.isArray(v)) {
              fx = v[0] ?? 1;
              fy = v[1] ?? 1;
            } else if (typeof v === 'number') {
              fx = fy = v;
            }
            cloned.scale(0, 0, fx);
          } else if (node.name === "color") {
            const colorVal = node.params.c ?? node.params[0];
            const hex = this.parseScadColor(colorVal);
            if (hex !== undefined) {
              cloned.properties.color = hex;
            }
          }
          transformed.push(cloned);
        }

        // Apply OCC transformations for standard 3D solid geometries
        if (occGeoms.length > 0) {
          const sourceId = await this.ensureSingleShape(occGeoms, id + "_pre_union");
          this.tempIds.add(sourceId);
          const transOcc = await this.applyTransform(node.name, node.params, sourceId, id);
          if (transOcc) {
            if (node.name !== "color") {
              const firstColor = occGeoms[0]?.userData?.color;
              if (firstColor !== undefined) {
                transOcc.userData.color = firstColor;
              }
            }
            transformed.push(transOcc);
          }
        }

        return transformed;
      }

      case "Boolean": {
        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;

        const cadEntities: Entity[] = [];
        const occGeoms: THREE.BufferGeometry[] = [];
        for (const child of children) {
          if (child instanceof Entity) {
            cadEntities.push(child);
          } else if (child instanceof THREE.BufferGeometry) {
            occGeoms.push(child);
          }
        }

        const results: (THREE.BufferGeometry | Entity)[] = [...cadEntities];

        if (occGeoms.length > 0) {
          if (node.name === "hull") {
            const shapeIds = occGeoms.map(c => (c.userData as any).entityId).filter(Boolean);
            const deflection = 0.1;
            const geo = await this.occ.createConvexHull(undefined, shapeIds, deflection, id);
            if (geo) {
              geo.userData = { ...geo.userData, entityId: id };
              const firstColor = occGeoms[0]?.userData?.color;
              if (firstColor !== undefined) {
                geo.userData.color = firstColor;
              }
              results.push(geo);
            }
          } else {
            const boolResult = await this.applyBoolean(node.name, occGeoms, id);
            if (boolResult) results.push(boolResult);
          }
        }

        return results;
      }

      case "Group": {
        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;

        const cadEntities: Entity[] = [];
        const occGeoms: THREE.BufferGeometry[] = [];
        for (const child of children) {
          if (child instanceof Entity) {
            cadEntities.push(child);
          } else if (child instanceof THREE.BufferGeometry) {
            occGeoms.push(child);
          }
        }

        const results: (THREE.BufferGeometry | Entity)[] = [...cadEntities];

        if (occGeoms.length > 0) {
          if (occGeoms.length === 1) {
            results.push(occGeoms[0]);
          } else {
            const childIds = occGeoms.map(c => (c.userData as any).entityId).filter(Boolean);
            const geo = await this.occ.createCompound(childIds, id, 0.1);
            if (geo) {
              geo.userData = { ...geo.userData, entityId: id };
              const firstColor = occGeoms[0]?.userData?.color;
              if (firstColor !== undefined) {
                geo.userData.color = firstColor;
              }
              results.push(geo);
            }
          }
        }

        return results;
      }
    }

    return null;
  }

  private async evaluateNodes(nodes: EvaluatedGeometry[]): Promise<(THREE.BufferGeometry | Entity)[]> {
    const results: (THREE.BufferGeometry | Entity)[] = [];
    for (const node of nodes) {
      const geo = await this.evaluateNode(node);
      if (geo) {
        if (Array.isArray(geo)) {
          results.push(...geo);
        } else {
          results.push(geo);
        }
      }
    }
    return results;
  }

  private async createPrimitive(node: { name: string; params: any }, id: string): Promise<THREE.BufferGeometry | Entity | null> {
    const p = node.params;
    const deflection = this.getDeflection(p);
    let geo: THREE.BufferGeometry | null = null;

    const validate = (...args: any[]) => {
      for (const val of args) {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
          throw new Error(`Invalid parameter: expected a finite number, got ${typeof val} (${val})`);
        }
      }
    };

    const parsePoint = (val: any, defaultVal = { x: 0, y: 0 }): { x: number; y: number } => {
      if (Array.isArray(val)) {
        return { x: val[0] ?? defaultVal.x, y: val[1] ?? defaultVal.y };
      }
      if (val && typeof val === 'object') {
        return { x: val.x ?? defaultVal.x, y: val.y ?? defaultVal.y };
      }
      return defaultVal;
    };

    switch (node.name) {
      case "cube": {
        const size = p.size ?? p[0] ?? 1;
        const center = p.center ?? p[1] ?? false;
        let dx = 1, dy = 1, dz = 1;
        if (Array.isArray(size)) {
          dx = size[0] ?? 1;
          dy = size[1] ?? 1;
          dz = size[2] ?? 1;
        } else {
          dx = dy = dz = (size ?? 1);
        }
        const x = center ? -dx/2 : 0;
        const y = center ? -dy/2 : 0;
        const z = center ? -dz/2 : 0;
        validate(dx, dy, dz, x, y, z);
        if (dx <= 0 || dy <= 0 || dz <= 0) {
          throw new Error(`Cube size must be positive, got size=[${dx}, ${dy}, ${dz}]`);
        }
        geo = await this.occ.createBox(x, y, z, dx, dy, dz, deflection, id);
        break;
      }
      case "sphere": {
        let r = p.r !== undefined && p.r !== null ? p.r : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[0] ?? 1));
        if (r === undefined || r === null) r = 1;
        validate(r);
        if (r <= 0) {
          throw new Error(`Sphere radius must be positive, got r=${r}`);
        }
        geo = await this.occ.createSphere(0, 0, 0, r, deflection, id);
        break;
      }
      case "cylinder": {
        let h = p.h ?? p[0] ?? 1;
        let r1 = p.r1 !== undefined && p.r1 !== null ? p.r1 : (p.r !== undefined && p.r !== null ? p.r : (p.d1 !== undefined && p.d1 !== null ? p.d1 / 2 : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[1] ?? 1))));
        let r2 = p.r2 !== undefined && p.r2 !== null ? p.r2 : (p.r !== undefined && p.r !== null ? p.r : (p.d2 !== undefined && p.d2 !== null ? p.d2 / 2 : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[2] ?? 1))));
        const center = p.center ?? p[3] ?? false;
        if (h === undefined || h === null) h = 1;
        if (r1 === undefined || r1 === null) r1 = 1;
        if (r2 === undefined || r2 === null) r2 = 1;
        const z = center ? -h/2 : 0;
        validate(h, r1, r2, z);
        if (h <= 0) {
          throw new Error(`Cylinder height must be positive, got h=${h}`);
        }
        if (r1 < 0 || r2 < 0 || (r1 === 0 && r2 === 0)) {
          throw new Error(`Cylinder radii must be positive, got r1=${r1}, r2=${r2}`);
        }

        const fn = p.$fn;
        if (fn !== undefined && typeof fn === 'number' && fn >= 3 && fn < 24) {
          const n = Math.floor(fn);
          const points: number[][] = [];
          
          // Bottom face vertices at Z = z
          for (let i = 0; i < n; i++) {
            const angle = (2 * Math.PI * i) / n;
            points.push([r1 * Math.cos(angle), r1 * Math.sin(angle), z]);
          }
          
          // Top face vertices at Z = z + h
          for (let i = 0; i < n; i++) {
            const angle = (2 * Math.PI * i) / n;
            points.push([r2 * Math.cos(angle), r2 * Math.sin(angle), z + h]);
          }
          
          const faces: number[][] = [];
          
          // Bottom face (facing down, ordered clockwise when viewed from bottom)
          const bottomFace = [];
          for (let i = n - 1; i >= 0; i--) {
            bottomFace.push(i);
          }
          faces.push(bottomFace);
          
          // Top face (facing up, ordered counter-clockwise when viewed from top)
          const topFace = [];
          for (let i = 0; i < n; i++) {
            topFace.push(i + n);
          }
          faces.push(topFace);
          
          // Side faces
          for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            faces.push([i, next, next + n, i + n]);
          }
          
          geo = await this.occ.createPolyhedron(points, faces, deflection, id);
        } else {
          geo = await this.occ.createFrustum(0, 0, z, r1, r2, h, deflection, id);
        }
        break;
      }
      case "cone": {
        let r = p.r !== undefined && p.r !== null ? p.r : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[0] ?? 1));
        let h = p.h ?? p[1] ?? 1;
        const center = p.center ?? p[2] ?? false;
        if (r === undefined || r === null) r = 1;
        if (h === undefined || h === null) h = 1;
        const z = center ? -h/2 : 0;
        validate(r, h, z);
        if (h <= 0) {
          throw new Error(`Cone height must be positive, got h=${h}`);
        }
        if (r <= 0) {
          throw new Error(`Cone radius must be positive, got r=${r}`);
        }
        geo = await this.occ.createCone(0, 0, z, r, h, deflection, id);
        break;
      }
      case "torus": {
        let r1 = p.r1 !== undefined ? p.r1 : (p[0] ?? 1);
        let r2 = p.r2 !== undefined ? p.r2 : (p[1] ?? 0.2);
        validate(r1, r2);
        if (r1 <= 0 || r2 <= 0) {
          throw new Error(`Torus radii must be positive, got r1=${r1}, r2=${r2}`);
        }
        geo = await this.occ.createTorus(0, 0, 0, r1, r2, deflection, id);
        break;
      }
      case "polyhedron": {
        const points = p.points ?? p[0] ?? [];
        const faces = p.faces ?? p.triangles ?? p[1] ?? [];
        for (const pt of points) {
          if (Array.isArray(pt)) {
            validate(...pt);
          }
        }
        geo = await this.occ.createPolyhedron(points, faces, deflection, id);
        break;
      }
      case "square": {
        const size = p.size ?? p[0] ?? 1;
        const center = p.center ?? p[1] ?? false;
        let dx = 1, dy = 1;
        if (Array.isArray(size)) {
          dx = size[0] ?? 1;
          dy = size[1] ?? 1;
        } else {
          dx = dy = (size ?? 1);
        }
        const x = center ? -dx/2 : 0;
        const y = center ? -dy/2 : 0;
        validate(dx, dy, x, y);
        if (dx <= 0 || dy <= 0) {
          throw new Error(`Square dimensions must be positive, got size=[${dx}, ${dy}]`);
        }
        geo = await this.occ.createBox(x, y, 0, dx, dy, 0.001, deflection, id);
        break;
      }
      case "circle": {
        let r = p.r !== undefined && p.r !== null ? p.r : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[0] ?? 1));
        if (r === undefined || r === null) r = 1;
        validate(r);
        if (r <= 0) {
          throw new Error(`Circle radius must be positive, got r=${r}`);
        }
        geo = await this.occ.createCylinder(0, 0, 0, r, 0.001, deflection, id);
        break;
      }
      case "polygon": {
        const pts = p.points ?? p[0] ?? [];
        const formattedPoints = pts.map((pt: any) => {
          let px = 0, py = 0;
          if (Array.isArray(pt)) {
            px = pt[0] ?? 0;
            py = pt[1] ?? 0;
          } else if (pt && typeof pt === 'object') {
            px = pt.x ?? 0;
            py = pt.y ?? 0;
          }
          return { x: px, y: py, z: 0 };
        });
        for (const pt of formattedPoints) {
          validate(pt.x, pt.y);
        }
        if (formattedPoints.length >= 3) {
          geo = await this.occ.createExtrude(formattedPoints, 0.001, undefined, deflection, true, id);
        }
        break;
      }

      // --- Native 2D CAD Primitives ---
      case "line":
      case "2d.line": {
        let p1 = parsePoint(p.p1 ?? p[0]);
        let p2 = parsePoint(p.p2 ?? p[1]);
        if (p.x1 !== undefined || p.y1 !== undefined || p.x2 !== undefined || p.y2 !== undefined) {
          p1 = { x: p.x1 ?? 0, y: p.y1 ?? 0 };
          p2 = { x: p.x2 ?? 0, y: p.y2 ?? 0 };
        } else if (p[0] !== undefined && p[1] !== undefined && p[2] !== undefined && p[3] !== undefined && !Array.isArray(p[0]) && !Array.isArray(p[1])) {
          p1 = { x: p[0], y: p[1] };
          p2 = { x: p[2], y: p[3] };
        }
        const entity = new Line(id, p1.x, p1.y, p2.x, p2.y);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "circle2d":
      case "2d.circle": {
        const r = p.r !== undefined ? p.r : (p.d !== undefined ? p.d / 2 : (p[2] ?? p[0] ?? 1));
        const center = parsePoint(p.center ?? p[0] ?? p.c);
        let cx = center.x;
        let cy = center.y;
        if (p.cx !== undefined) cx = p.cx;
        if (p.cy !== undefined) cy = p.cy;
        if (p[0] !== undefined && p[1] !== undefined && p[2] !== undefined && !Array.isArray(p[0])) {
          cx = p[0];
          cy = p[1];
        }
        const entity = new Circle(id, cx, cy, r);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "arc2d":
      case "2d.arc": {
        const r = p.r !== undefined ? p.r : (p[2] ?? 1);
        const center = parsePoint(p.center ?? p[0] ?? p.c);
        let cx = center.x;
        let cy = center.y;
        if (p.cx !== undefined) cx = p.cx;
        if (p.cy !== undefined) cy = p.cy;
        let startAngle = 0;
        let endAngle = 360;
        let ccw = true;

        if (p[0] !== undefined && p[1] !== undefined && p[2] !== undefined && p[3] !== undefined && p[4] !== undefined && !Array.isArray(p[0])) {
          cx = p[0];
          cy = p[1];
          startAngle = p[3];
          endAngle = p[4];
          ccw = p[5] !== false;
        } else {
          startAngle = p.start_angle ?? p.start ?? p[2] ?? 0;
          endAngle = p.end_angle ?? p.end ?? p[3] ?? 360;
          ccw = p.ccw ?? p[4] ?? true;
        }

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const entity = new Arc(id, cx, cy, r, startRad, endRad, ccw);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "polyline2d":
      case "2d.polyline": {
        const pts = p.points ?? p[0] ?? [];
        const closed = p.closed ?? p[1] ?? false;
        const vertices = pts.map((pt: any) => {
          let px = 0, py = 0, bulge = 0;
          if (Array.isArray(pt)) {
            px = pt[0] ?? 0;
            py = pt[1] ?? 0;
            bulge = pt[2] ?? 0;
          } else if (pt && typeof pt === 'object') {
            px = pt.x ?? 0;
            py = pt.y ?? 0;
            bulge = pt.bulge ?? 0;
          }
          return { x: px, y: py, bulge };
        });

        const entity = new Polyline(id, vertices, closed);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "mtext2d":
      case "2d.mtext": {
        const text = p.text ?? p[0] ?? "";
        const center = parsePoint(p.center ?? p[1] ?? p.insertionPoint);
        let cx = center.x;
        let cy = center.y;
        if (p.cx !== undefined) cx = p.cx;
        if (p.cy !== undefined) cy = p.cy;
        if (p[1] !== undefined && p[2] !== undefined && !Array.isArray(p[1])) {
          cx = p[1];
          cy = p[2];
        }

        const height = p.height ?? p.textHeight ?? p[3] ?? 2.5;
        const width = p.width ?? p[4] ?? 50;
        const rotationDeg = p.rotation ?? p[5] ?? 0;
        const rotationRad = (rotationDeg * Math.PI) / 180;

        const entity = new MText(id, { x: cx, y: cy }, width, height, text);
        entity.textHeight = height;
        entity.rotation = rotationRad;
        entity.layoutMText();

        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "text2d":
      case "2d.text": {
        const text = p.text ?? p[0] ?? "";
        const center = parsePoint(p.center ?? p[1]);
        let cx = center.x;
        let cy = center.y;
        if (p.cx !== undefined) cx = p.cx;
        if (p.cy !== undefined) cy = p.cy;
        if (p[1] !== undefined && p[2] !== undefined && !Array.isArray(p[1])) {
          cx = p[1];
          cy = p[2];
        }

        const height = p.height ?? p.textHeight ?? p[3] ?? 2.5;
        const rotationDeg = p.rotation ?? p[4] ?? 0;

        const entity = new Text(id, cx, cy, height, rotationDeg, text);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "hatch2d":
      case "2d.hatch": {
        const pattern = p.pattern ?? p[0] ?? "ANSI31";
        const pts = p.points ?? p[1] ?? [];
        const boundaryVertices = pts.map((pt: any) => {
          let px = 0, py = 0;
          if (Array.isArray(pt)) {
            px = pt[0] ?? 0;
            py = pt[1] ?? 0;
          } else if (pt && typeof pt === 'object') {
            px = pt.x ?? 0;
            py = pt.y ?? 0;
          }
          return { x: px, y: py };
        });

        const patternScale = p.patternScale ?? p.scale ?? p[2] ?? 1;
        const angle = p.angle ?? p[3] ?? 0;
        const color = p.color ?? p[4] ?? 0x00ff00;

        const entity = new Hatch(id, boundaryVertices, pattern, patternScale, angle, color);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }

      case "dimension2d":
      case "dim.dimension":
      case "dim.linear":
      case "dim.aligned":
      case "dim.angular":
      case "dim.radial":
      case "dim.diameter": {
        let typeStr = p.type;
        let isSpecific = false;
        let specificType = "ALIGNED";
        
        if (node.name === "dim.linear") { specificType = "LINEAR"; isSpecific = true; }
        else if (node.name === "dim.aligned") { specificType = "ALIGNED"; isSpecific = true; }
        else if (node.name === "dim.angular") { specificType = "ANGULAR"; isSpecific = true; }
        else if (node.name === "dim.radial") { specificType = "RADIUS"; isSpecific = true; }
        else if (node.name === "dim.diameter") { specificType = "DIAMETER"; isSpecific = true; }

        let p1Index = 1;
        let p2Index = 2;
        let x1Index = 1;
        let y1Index = 2;
        let x2Index = 3;
        let y2Index = 4;
        let offsetIndex = 5;

        // If it's the generic dimension2d / dim.dimension, or the user passed the type string as first argument
        if (!isSpecific || (p[0] !== undefined && typeof p[0] === 'string')) {
          typeStr = typeStr ?? p[0] ?? specificType;
        } else {
          typeStr = specificType;
          // Shifter for positional arguments since type is omitted
          p1Index = 0;
          p2Index = 1;
          x1Index = 0;
          y1Index = 1;
          x2Index = 2;
          y2Index = 3;
          offsetIndex = 4;
        }

        const type = typeStr.toUpperCase() as 'LINEAR' | 'ALIGNED' | 'ANGULAR' | 'RADIUS' | 'DIAMETER';
        
        let p1 = parsePoint(p.p1 ?? p[p1Index]);
        let p2 = parsePoint(p.p2 ?? p[p2Index]);

        if (p.x1 !== undefined || p.y1 !== undefined || p.x2 !== undefined || p.y2 !== undefined) {
          p1 = { x: p.x1 ?? 0, y: p.y1 ?? 0 };
          p2 = { x: p.x2 ?? 0, y: p.y2 ?? 0 };
        } else if (p[x1Index] !== undefined && p[y1Index] !== undefined && p[x2Index] !== undefined && y2Index !== undefined && !Array.isArray(p[x1Index]) && !Array.isArray(p[y1Index])) {
          p1 = { x: p[x1Index], y: p[y1Index] };
          p2 = { x: p[x2Index], y: p[y2Index] };
        }
        
        const offset = p.offset ?? p[offsetIndex] ?? 10;

        const entity = new Dimension(id, type, p1.x, p1.y, p2.x, p2.y, offset);
        if (p.layer !== undefined) entity.layer = String(p.layer);
        if (p.color !== undefined) entity.properties.color = p.color;
        if (p.elevation !== undefined) entity.elevation = Number(p.elevation);
        if (p.thickness !== undefined) entity.thickness = Number(p.thickness);
        return entity;
      }
    }

    if (geo) {
      geo.userData = { ...geo.userData, entityId: id };
    }
    return geo;
  }

  private async applyBoolean(op: string, children: THREE.BufferGeometry[], baseId: string): Promise<THREE.BufferGeometry | null> {
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];

    const resultColor = children[0]?.userData?.color;
    let resultGeo = children[0];
    let resultId = (resultGeo.userData as any).entityId;
    
    for (let i = 1; i < children.length; i++) {
      const childGeo = children[i];
      const childId = (childGeo.userData as any).entityId;
      
      let type: 'fuse' | 'cut' | 'common' = 'fuse';
      if (op === 'difference') type = 'cut';
      if (op === 'intersection') type = 'common';

      const isLast = (i === children.length - 1);
      const currentResultId = isLast ? baseId : `${baseId}_step_${i}`;
      this.tempIds.add(currentResultId);
      
      resultGeo = await this.occ.createBoolean(type, resultId, childId, currentResultId);
      if (resultGeo) {
        resultGeo.userData = { ...resultGeo.userData, entityId: currentResultId };
      }
      resultId = currentResultId;
    }

    if (resultGeo && resultColor !== undefined) {
      resultGeo.userData.color = resultColor;
    }

    return resultGeo;
  }

  private async applyTransform(name: string, params: any, sourceId: string, targetId: string): Promise<THREE.BufferGeometry | null> {
    const p = params;
    const deflection = 0.1;
    this.tempIds.add(targetId);
    let geo: THREE.BufferGeometry | null = null;

    const validate = (...args: any[]) => {
      for (const val of args) {
        if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
          throw new Error(`Invalid parameter for transform ${name}: expected a finite number, got ${typeof val} (${val})`);
        }
      }
    };

    switch (name) {
      case "translate": {
        const v = p.v ?? p[0] ?? [0, 0, 0];
        let tx = 0, ty = 0, tz = 0;
        if (Array.isArray(v)) {
          tx = v[0] ?? 0;
          ty = v[1] ?? 0;
          tz = v[2] ?? 0;
        }
        validate(tx, ty, tz);
        geo = await this.occ.transformShape(sourceId, tx, ty, tz, targetId, deflection);
        break;
      }
      case "rotate": {
        const v = p.a ?? p[0] ?? [0, 0, 0];
        let rx = 0, ry = 0, rz = 0;
        if (Array.isArray(v)) {
          rx = v[0] ?? 0;
          ry = v[1] ?? 0;
          rz = v[2] ?? 0;
        } else if (typeof v === 'number') {
          rz = v;
        }
        validate(rx, ry, rz);
        // SCAD rotate takes [x, y, z] in degrees, but OCC rotateShape expects radians
        const rxRad = (rx * Math.PI) / 180;
        const ryRad = (ry * Math.PI) / 180;
        const rzRad = (rz * Math.PI) / 180;
        validate(rxRad, ryRad, rzRad);
        geo = await this.occ.rotateShape(sourceId, rxRad, ryRad, rzRad, 0, 0, 0, targetId, deflection);
        break;
      }
      case "scale": {
        const v = p.v ?? p[0] ?? [1, 1, 1];
        let fx = 1, fy = 1, fz = 1;
        if (Array.isArray(v)) {
          fx = v[0] ?? 1;
          fy = v[1] ?? 1;
          fz = v[2] ?? 1;
        } else if (typeof v === 'number') {
          fx = fy = fz = v;
        }
        validate(fx, fy, fz);
        geo = await this.occ.scaleShape(sourceId, undefined, 0, 0, 0, targetId, deflection, fx, fy, fz);
        break;
      }
      case "mirror": {
        const v = p.v ?? p[0] ?? [1, 0, 0];
        let mx = 1, my = 0, mz = 0;
        if (Array.isArray(v)) {
          mx = v[0] ?? 1;
          my = v[1] ?? 0;
          mz = v[2] ?? 0;
        }
        validate(mx, my, mz);
        geo = await this.occ.mirrorShape(sourceId, undefined, undefined, targetId, deflection, { x: mx, y: my, z: mz });
        break;
      }
      case "multmatrix": {
        const m = p.m ?? p[0] ?? [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ];
        let flatMatrix: number[] = [];
        if (Array.isArray(m)) {
          if (Array.isArray(m[0])) {
            for (let r = 0; r < 4; r++) {
              const row = m[r] ?? [0, 0, 0, 0];
              for (let c = 0; c < 4; c++) {
                flatMatrix.push(row[c] ?? (r === c ? 1 : 0));
              }
            }
          } else {
            flatMatrix = [...m];
            while (flatMatrix.length < 16) {
              flatMatrix.push(0);
            }
          }
        } else {
          flatMatrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
          ];
        }
        validate(...flatMatrix);
        geo = await this.occ.multMatrixShape(sourceId, flatMatrix, targetId, deflection);
        break;
      }
      case "color": {
        geo = await this.occ.transformShape(sourceId, 0, 0, 0, targetId, deflection);
        if (geo) {
          const colorVal = p.c ?? p[0];
          const hex = this.parseScadColor(colorVal);
          if (hex !== undefined) {
            geo.userData = { ...geo.userData, color: hex };
          }
        }
        break;
      }
      case "linear_extrude": {
        const height = p.height ?? p[0] ?? 1;
        const center = p.center ?? p[1] ?? false;
        validate(height);
        if (height <= 0) {
          throw new Error(`Invalid linear_extrude height: ${height} (must be positive)`);
        }
        const scaleZ = height / 0.001;
        validate(scaleZ);
        
        if (center) {
          const tempId = targetId + "_scaled";
          this.tempIds.add(tempId);
          await this.occ.scaleShape(sourceId, undefined, 0, 0, 0, tempId, deflection, 1, 1, scaleZ);
          geo = await this.occ.transformShape(tempId, 0, 0, -height / 2, targetId, deflection);
        } else {
          geo = await this.occ.scaleShape(sourceId, undefined, 0, 0, 0, targetId, deflection, 1, 1, scaleZ);
        }
        break;
      }
    }
    if (geo) {
      geo.userData = { ...geo.userData, entityId: targetId };
    }
    return geo;
  }

  private parseScadColor(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    try {
      if (typeof val === 'string') {
        const cleaned = val.replace(/^["']|["']$/g, '').toLowerCase().trim();
        if (OPENSCAD_COLOR_MAP[cleaned] !== undefined) {
          return OPENSCAD_COLOR_MAP[cleaned];
        }
        const c = new THREE.Color(cleaned);
        return c.getHex();
      }
      if (Array.isArray(val)) {
        const r = Number(val[0] ?? 0);
        const g = Number(val[1] ?? 0);
        const b = Number(val[2] ?? 0);
        const c = new THREE.Color(r, g, b);
        return c.getHex();
      }
      if (typeof val === 'number') {
        return val;
      }
    } catch (e) {
      console.warn("Failed to parse SCAD color:", val, e);
    }
    return undefined;
  }

  private async ensureSingleShape(shapes: THREE.BufferGeometry[], id: string): Promise<string> {
    if (shapes.length === 1) {
      return (shapes[0].userData as any).entityId;
    }
    const childIds = shapes.map(c => (c.userData as any).entityId).filter(Boolean);
    const result = await this.occ.createCompound(childIds, id, 0.1);
    if (result) {
      result.userData = { ...result.userData, entityId: id };
      const firstColor = shapes[0]?.userData?.color;
      if (firstColor !== undefined) {
        result.userData.color = firstColor;
      }
    }
    return (result?.userData as any).entityId;
  }

  private getDeflection(params: any, defaultSegments = 32): number {
    let fn = params?.$fn ?? 0;
    if (fn <= 0) {
      const fa = params?.$fa ?? 12;
      const fs = params?.$fs ?? 2;
      fn = Math.max(5, Math.ceil(360 / Math.max(0.1, fa)));
    }
    if (fn < 3) fn = 3;
    const deflection = Math.max(0.001, Math.min(1.0, 0.5 * (1 - Math.cos(Math.PI / fn))));
    return deflection;
  }

  private async extrudeOrRevolve(
    node: EvaluatedGeometry,
    parentName: "linear_extrude" | "rotate_extrude",
    params: any,
    deflection: number,
    id: string
  ): Promise<THREE.BufferGeometry | null> {
    if (node.type === "Boolean") {
      const childGeometries: THREE.BufferGeometry[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const childId = `${id}_bool_${i}`;
        this.tempIds.add(childId);
        const geo = await this.extrudeOrRevolve(node.children[i], parentName, params, deflection, childId);
        if (geo) {
          childGeometries.push(geo);
        }
      }

      if (childGeometries.length === 0) return null;
      if (childGeometries.length === 1) return childGeometries[0];

      return this.applyBoolean(node.name, childGeometries, id);
    }

    if (node.type === "Group") {
      const childGeometries: THREE.BufferGeometry[] = [];
      for (let i = 0; i < node.children.length; i++) {
        const childId = `${id}_grp_${i}`;
        this.tempIds.add(childId);
        const geo = await this.extrudeOrRevolve(node.children[i], parentName, params, deflection, childId);
        if (geo) {
          childGeometries.push(geo);
        }
      }

      if (childGeometries.length === 0) return null;
      if (childGeometries.length === 1) return childGeometries[0];

      return this.applyBoolean("union", childGeometries, id);
    }

    const pts = this.get2DPoints(node);
    if (pts.length < 3) return null;

    if (parentName === "linear_extrude") {
      const height = params.height ?? params[0] ?? 1.0;
      const center = params.center ?? params[1] ?? false;
      const formattedPts = pts.map(pt => ({ x: pt.x, y: pt.y, z: 0 }));
      let extGeo = await this.occ.createExtrude(formattedPts, height, undefined, deflection, true, id);
      if (extGeo) {
        if (center) {
          const tempId = id + "_centered";
          this.tempIds.add(tempId);
          extGeo = await this.occ.transformShape(id, 0, 0, -height / 2, tempId, deflection);
          if (extGeo) {
            extGeo.userData = { ...extGeo.userData, entityId: id };
          }
        } else {
          extGeo.userData = { ...extGeo.userData, entityId: id };
        }
      }
      return extGeo;
    } else {
      if (pts.every(pt => pt.x <= 0.001)) {
        return null;
      }

      const angle = params.angle ?? params[0] ?? 360.0;
      const profilePts = pts.map(pt => ({ x: Math.max(0, pt.x), y: 0, z: pt.y }));

      const uniqueProfilePts = [];
      for (const pt of profilePts) {
        if (uniqueProfilePts.length === 0) {
          uniqueProfilePts.push(pt);
        } else {
          const last = uniqueProfilePts[uniqueProfilePts.length - 1];
          if (Math.abs(pt.x - last.x) > 0.0001 || Math.abs(pt.z - last.z) > 0.0001) {
            uniqueProfilePts.push(pt);
          }
        }
      }
      if (uniqueProfilePts.length < 3) return null;

      const axisPoint = { x: 0, y: 0, z: 0 };
      const axisDir = { x: 0, y: 0, z: 1 };
      const revGeo = await this.occ.createRevolve(uniqueProfilePts, axisPoint, axisDir, angle, undefined, deflection, true, id);
      if (revGeo) {
        revGeo.userData = { ...revGeo.userData, entityId: id };
      }
      return revGeo;
    }
  }

  private get2DPoints(node: EvaluatedGeometry, transform = new THREE.Matrix4()): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    switch (node.type) {
      case "Primitive": {
        const p = node.params;
        if (node.name === "polygon") {
          const pts = p.points ?? p[0] ?? [];
          const ptsMapped = pts.map((pt: any) => {
            let px = 0, py = 0;
            if (Array.isArray(pt)) {
              px = pt[0] ?? 0;
              py = pt[1] ?? 0;
            } else if (pt && typeof pt === 'object') {
              px = pt.x ?? 0;
              py = pt.y ?? 0;
            }
            const vec = new THREE.Vector3(px, py, 0).applyMatrix4(transform);
            return { x: vec.x, y: vec.y };
          });
          points.push(...ptsMapped);
        } else if (node.name === "square") {
          const size = p.size ?? p[0] ?? 1;
          const center = p.center ?? p[1] ?? false;
          let dx = 1, dy = 1;
          if (Array.isArray(size)) {
            dx = size[0] ?? 1;
            dy = size[1] ?? 1;
          } else {
            dx = dy = size;
          }
          const x = center ? -dx/2 : 0;
          const y = center ? -dy/2 : 0;
          const squarePts = [
            { x, y },
            { x: x + dx, y },
            { x: x + dx, y: y + dy },
            { x, y: y + dy }
          ].map(pt => {
            const vec = new THREE.Vector3(pt.x, pt.y, 0).applyMatrix4(transform);
            return { x: vec.x, y: vec.y };
          });
          points.push(...squarePts);
        } else if (node.name === "circle") {
          let r = p.r !== undefined && p.r !== null ? p.r : (p.d !== undefined && p.d !== null ? p.d / 2 : (p[0] ?? 1));
          if (r === undefined || r === null) r = 1;
          const fn = p.$fn ?? 32;
          const segments = Math.max(5, fn);
          const circlePts = [];
          for (let i = 0; i < segments; i++) {
            const angle = (i * 2 * Math.PI) / segments;
            const vec = new THREE.Vector3(r * Math.cos(angle), r * Math.sin(angle), 0).applyMatrix4(transform);
            circlePts.push({ x: vec.x, y: vec.y });
          }
          points.push(...circlePts);
        }
        break;
      }
      case "Transform": {
        const localMat = new THREE.Matrix4();
        if (node.name === "translate") {
          const v = node.params.v ?? node.params[0] ?? [0, 0, 0];
          localMat.makeTranslation(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
        } else if (node.name === "rotate") {
          const v = node.params.a ?? node.params[0] ?? [0, 0, 0];
          if (Array.isArray(v)) {
            const euler = new THREE.Euler(
              (v[0] * Math.PI) / 180,
              (v[1] * Math.PI) / 180,
              (v[2] * Math.PI) / 180
            );
            localMat.makeRotationFromEuler(euler);
          } else if (typeof v === 'number') {
            localMat.makeRotationZ((v * Math.PI) / 180);
          }
        } else if (node.name === "scale") {
          const v = node.params.v ?? node.params[0] ?? [1, 1, 1];
          if (Array.isArray(v)) {
            localMat.makeScale(v[0] ?? 1, v[1] ?? 1, v[2] ?? 1);
          } else if (typeof v === 'number') {
            localMat.makeScale(v, v, v);
          }
        }
        const nextMat = transform.clone().multiply(localMat);
        for (const child of node.children) {
          points.push(...this.get2DPoints(child, nextMat));
        }
        break;
      }
      case "Boolean":
      case "Group": {
        for (const child of node.children) {
          points.push(...this.get2DPoints(child, transform));
        }
        break;
      }
    }
    return points;
  }
}
