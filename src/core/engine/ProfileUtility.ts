import { Entity } from "../model/Entity";
import { Polyline } from "../model/Polyline";
import { Circle } from "../model/Circle";
import { Spline } from "../model/Spline";
import { Ellipse } from "../model/Ellipse";
import { bulgeToArc } from "./MathUtils";

export interface ProfileData {
  points: { x: number; y: number; z: number }[];
  isClosed: boolean;
}

export class ProfileUtility {
  /**
   * Samples a 2D entity into a list of points suitable for extrusion/revolving.
   * Handles polyline bulges, circle tessellation, etc.
   */
  static getProfilePoints(entity: Entity): ProfileData {
    let points: { x: number; y: number; z: number }[] = [];
    let isClosed = false;
    const elevation = entity.elevation || 0;

    if (entity instanceof Polyline) {
      const count = entity.vertices.length;
      const limit = entity.closed ? count : count - 1;

      for (let i = 0; i < limit; i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % count];

        if (v1.bulge && Math.abs(v1.bulge) >= 1e-6) {
          const arcParams = bulgeToArc(v1, v2, v1.bulge);
          if (arcParams) {
            const startAngle = arcParams.startAngle;
            const endAngle = arcParams.endAngle;
            let sweep = endAngle - startAngle;
            if (arcParams.ccw) {
              if (sweep < 0) sweep += 2 * Math.PI;
            } else {
              if (sweep > 0) sweep -= 2 * Math.PI;
            }
            const segments = 16;
            for (let j = 0; j < segments; j++) {
              const angle = startAngle + (j / segments) * sweep;
              points.push({
                x: arcParams.cx + arcParams.r * Math.cos(angle),
                y: arcParams.cy + arcParams.r * Math.sin(angle),
                z: elevation
              });
            }
          } else {
            points.push({ x: v1.x, y: v1.y, z: elevation });
          }
        } else {
          points.push({ x: v1.x, y: v1.y, z: elevation });
        }
      }

      if (!entity.closed && count > 0) {
        const lastV = entity.vertices[count - 1];
        points.push({ x: lastV.x, y: lastV.y, z: elevation });
      }
      isClosed = entity.closed;

    } else if (entity instanceof Circle) {
      const segments = 32;
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        points.push({
          x: entity.cx + entity.r * Math.cos(angle),
          y: entity.cy + entity.r * Math.sin(angle),
          z: elevation
        });
      }
      isClosed = true;

    } else if (entity instanceof Ellipse) {
        const segments = 32;
        const rMajor = Math.hypot(entity.majorX, entity.majorY);
        const rMinor = rMajor * entity.ratio;
        const rot = Math.atan2(entity.majorY, entity.majorX);
        const cosR = Math.cos(rot), sinR = Math.sin(rot);
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * 2 * Math.PI;
          const lx = rMajor * Math.cos(angle);
          const ly = rMinor * Math.sin(angle);
          points.push({
            x: entity.cx + lx * cosR - ly * sinR,
            y: entity.cy + lx * sinR + ly * cosR,
            z: elevation
          });
        }
        isClosed = true;

    } else if (entity instanceof Spline) {
      points = entity.sampledPoints.map(v => ({ x: v.x, y: v.y, z: elevation }));
      isClosed = entity.isClosed;
    }

    return { points, isClosed };
  }

  /**
   * Generates a simple geometric hash to detect if a profile has changed.
   */
  static getGeometryHash(entity: Entity): string {
    const data = this.getProfilePoints(entity);
    // Include critical parameters in the hash
    let hash = `${entity.id}:${data.isClosed}:${data.points.length}`;
    if (data.points.length > 0) {
        // Sample start, middle, and end points for efficiency
        const p1 = data.points[0];
        const p2 = data.points[Math.floor(data.points.length / 2)];
        const p3 = data.points[data.points.length - 1];
        hash += `|${p1.x.toFixed(4)},${p1.y.toFixed(4)}|${p2.x.toFixed(4)},${p2.y.toFixed(4)}|${p3.x.toFixed(4)},${p3.y.toFixed(4)}`;
    }
    return hash;
  }
}
