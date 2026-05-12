import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Polyline } from "../../../model/Polyline";
import { Circle } from "../../../model/Circle";
import { Spline } from "../../../model/Spline";
import { Line } from "../../../model/Line";
import { Arc } from "../../../model/Arc";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { bulgeToArc } from "../../../engine/MathUtils";
import * as THREE from 'three';

export class SweepHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'sweep';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'sweep' && action.id1 && action.id2) {
      const profileEntity = doc.getEntity(action.id1);
      const spineEntity = doc.getEntity(action.id2);

      if (!profileEntity || !spineEntity) {
        return "Invalid entities.";
      }

      const occService = OpenCascadeService.getInstance();
      const isSolid = action.type === 'SOLID';
      const facetres = doc.facetres || 5.0;
      const deflection = 0.1 / facetres;
      let axisPoint: {x: number, y: number, z: number} = { x: 0, y: 0, z: 0 };
      let axisDir: {x: number, y: number, z: number} = { x: 0, y: 0, z: 1 };

      // Extract points from spine
      let spinePoints: {x: number, y: number, z: number}[] = [];
      const spineElevation = spineEntity.elevation || 0;

      if (spineEntity instanceof Line) {
        spinePoints = [
          { x: spineEntity.x1, y: spineEntity.y1, z: spineElevation },
          { x: spineEntity.x2, y: spineEntity.y2, z: spineElevation }
        ];
      } else if (spineEntity instanceof Polyline && profileEntity instanceof Circle) {
        const segmentIds: string[] = [];
        let finalGeometry: any;
        const segmentGeometries: any[] = [];
        
        for (let i = 0; i < spineEntity.vertices.length - (spineEntity.closed ? 0 : 1); i++) {
          const v1 = spineEntity.vertices[i];
          const v2 = spineEntity.vertices[(i + 1) % spineEntity.vertices.length];
          const tempId = `temp_seg_${i}_${Date.now()}`;
          
          const p = { x: v1.x, y: v1.y, z: spineElevation };
          let alpha = 0;
          let isArc = false;
          let arcParams: any;
          
          if (v1.bulge && Math.abs(v1.bulge) >= 1e-6) {
            arcParams = bulgeToArc(v1, v2, v1.bulge);
            if (arcParams) {
              isArc = true;
              const dx = arcParams.ccw ? -(v1.y - arcParams.cy) : (v1.y - arcParams.cy);
              const dy = arcParams.ccw ? (v1.x - arcParams.cx) : -(v1.x - arcParams.cx);
              alpha = Math.atan2(dy, dx);
            }
          } else {
            const dx = v2.x - v1.x;
            const dy = v2.y - v1.y;
            alpha = Math.atan2(dy, dx);
          }
          
          // Generate profile points perpendicular to the path at start
          const profilePts = [];
          const segments = 32;
          for (let j = 0; j < segments; j++) {
            const t = (j / segments) * 2 * Math.PI;
            profilePts.push({
              x: p.x + profileEntity.r * Math.cos(t) * (-Math.sin(alpha)),
              y: p.y + profileEntity.r * Math.cos(t) * Math.cos(alpha),
              z: p.z + profileEntity.r * Math.sin(t)
            });
          }
          
          let geo: any;
          if (isArc && arcParams) {
            let sweep = arcParams.endAngle - arcParams.startAngle;
            if (arcParams.ccw && sweep < 0) sweep += 2 * Math.PI;
            if (!arcParams.ccw && sweep > 0) sweep -= 2 * Math.PI;
            let angleDeg = sweep * 180 / Math.PI;
            axisPoint = { x: arcParams.cx, y: arcParams.cy, z: spineElevation };
            axisDir = { x: 0, y: 0, z: 1 };
            
            if (angleDeg < 0) {
              angleDeg = -angleDeg;
              axisDir.z = -1;
            }
            
            geo = await occService.createRevolve(profilePts, axisPoint, axisDir, angleDeg, undefined, deflection, isSolid, tempId);
            segmentIds.push(tempId);
          } else {
            const spinePts = [
              { x: v1.x, y: v1.y, z: spineElevation },
              { x: v2.x, y: v2.y, z: spineElevation }
            ];
            geo = await occService.createSweep(profilePts, spinePts, isSolid, deflection, tempId);
            segmentIds.push(tempId);
          }
          if (segmentIds.length === 1) finalGeometry = geo;
          segmentGeometries.push(geo);
        }
        
        if (segmentIds.length === 0) throw new Error("No segments created for sweep.");
        
        let success = true;
        if (segmentIds.length > 1) {
          let currentFusedId = segmentIds[0];
          for (let i = 1; i < segmentIds.length; i++) {
            const nextFusedId = `temp_fused_${i}_${Date.now()}`;
            try {
              finalGeometry = await occService.createBoolean('fuse', currentFusedId, segmentIds[i], nextFusedId);
              currentFusedId = nextFusedId;
            } catch (e) {
              console.warn(`Failed to fuse segment ${i}, falling back to separate segments.`);
              success = false;
              break;
            }
          }
        }
        
        if (success) {
          const solidId = doc.getNextId("S3D");
          const positions = Array.from(finalGeometry.getAttribute('position').array) as number[];
          const indices = Array.from(finalGeometry.getIndex()?.array || []) as number[];
          
          const solid = new Solid3D(solidId, positions, indices);
          addEntity(solid, true, false);
        } else {
          // Combine geometries of all segments into a single solid
          const combinedPositions: number[] = [];
          const combinedIndices: number[] = [];
          let vertexOffset = 0;
          
          for (let i = 0; i < segmentGeometries.length; i++) {
            const g = segmentGeometries[i];
            const positions = Array.from(g.getAttribute('position').array) as number[];
            const indices = Array.from(g.getIndex()?.array || []) as number[];
            
            combinedPositions.push(...positions);
            for (let j = 0; j < indices.length; j++) {
              combinedIndices.push(indices[j] + vertexOffset);
            }
            vertexOffset += positions.length / 3;
          }
          
          const solidId = doc.getNextId("S3D");
          const solid = new Solid3D(solidId, combinedPositions, combinedIndices);
          addEntity(solid, true, false);
        }
        viewer.clearHighlight();
        return "Sweep completed.";
        return "Sweep completed.";
      } else if (spineEntity instanceof Arc) {
        const segments = 128;
        const startAngle = spineEntity.startAngle;
        const endAngle = spineEntity.endAngle;
        let sweep = endAngle - startAngle;
        
        if (spineEntity.ccw) {
          if (sweep < 0) sweep += 2 * Math.PI;
        } else {
          if (sweep > 0) sweep -= 2 * Math.PI;
        }
        
        for (let i = 0; i <= segments; i++) {
          const angle = startAngle + (i / segments) * sweep;
          spinePoints.push({
            x: spineEntity.cx + spineEntity.r * Math.cos(angle),
            y: spineEntity.cy + spineEntity.r * Math.sin(angle),
            z: spineElevation
          });
        }
      }
 
      // Extract points from profile
      let profilePoints: {x: number, y: number, z: number}[] = [];
      const elevation = profileEntity.elevation || 0;

      let profileCount = 1;

      if (profileEntity instanceof Polyline) {
        profilePoints = profileEntity.vertices.map(v => ({ x: v.x, y: v.y, z: elevation }));
      } else if (profileEntity instanceof Circle) {
        const segments = 32;
        
        if (spineEntity instanceof Arc) {
          profileCount = 3;
          const profiles = [];
          const startAngle = spineEntity.startAngle;
          const endAngle = spineEntity.endAngle;
          let sweep = endAngle - startAngle;
          
          if (spineEntity.ccw) {
            if (sweep < 0) sweep += 2 * Math.PI;
          } else {
            if (sweep > 0) sweep -= 2 * Math.PI;
          }
          
          for (let j = 0; j < profileCount; j++) {
            const frac = j / (profileCount - 1);
            const angle = startAngle + frac * sweep;
            const p = {
              x: spineEntity.cx + spineEntity.r * Math.cos(angle),
              y: spineEntity.cy + spineEntity.r * Math.sin(angle),
              z: spineElevation
            };
            const dx = -spineEntity.r * Math.sin(angle);
            const dy = spineEntity.r * Math.cos(angle);
            const alpha = Math.atan2(dy, dx);
            
            const profilePts = [];
            for (let i = 0; i <= segments; i++) {
              const t = (i / segments) * 2 * Math.PI;
              profilePts.push({
                x: p.x + profileEntity.r * Math.cos(t) * (-Math.sin(alpha)),
                y: p.y + profileEntity.r * Math.cos(t) * Math.cos(alpha),
                z: p.z + profileEntity.r * Math.sin(t)
              });
            }
            profiles.push(profilePts);
          }
          profilePoints = profiles.flat();
        } else {
          // Find tangent at spine start
          const p0 = spinePoints[0];
          const p1 = spinePoints[1] || p0;
          const dx = p1.x - p0.x;
          const dy = p1.y - p0.y;
          const alpha = Math.atan2(dy, dx);
          
          for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * 2 * Math.PI;
            profilePoints.push({
              x: p0.x + profileEntity.r * Math.cos(t) * (-Math.sin(alpha)),
              y: p0.y + profileEntity.r * Math.cos(t) * Math.cos(alpha),
              z: p0.z + profileEntity.r * Math.sin(t)
            });
          }
        }
      } else if (profileEntity instanceof Spline) {
        profilePoints = profileEntity.sampledPoints.map(v => ({ x: v.x, y: v.y, z: elevation }));
      }

      try {
        let geometry: THREE.BufferGeometry;

        if (spineEntity instanceof Arc && profileEntity instanceof Circle) {
          // Compute profile points at START of arc
          const startAngle = spineEntity.startAngle;
          const p = {
            x: spineEntity.cx + spineEntity.r * Math.cos(startAngle),
            y: spineEntity.cy + spineEntity.r * Math.sin(startAngle),
            z: spineElevation
          };
          const dx = -spineEntity.r * Math.sin(startAngle);
          const dy = spineEntity.r * Math.cos(startAngle);
          const alpha = Math.atan2(dy, dx);
          
          const profilePts = [];
          const segments = 32;
          for (let i = 0; i < segments; i++) {
            const t = (i / segments) * 2 * Math.PI;
            profilePts.push({
              x: p.x + profileEntity.r * Math.cos(t) * (-Math.sin(alpha)),
              y: p.y + profileEntity.r * Math.cos(t) * Math.cos(alpha),
              z: p.z + profileEntity.r * Math.sin(t)
            });
          }
          
          // Compute sweep angle
          const endAngle = spineEntity.endAngle;
          let sweep = endAngle - startAngle;
          if (spineEntity.ccw) {
            if (sweep < 0) sweep += 2 * Math.PI;
          } else {
            if (sweep > 0) sweep -= 2 * Math.PI;
          }
          
          const angleDeg = sweep * 180 / Math.PI;
          axisPoint = { x: spineEntity.cx, y: spineEntity.cy, z: spineElevation };
          axisDir = { x: 0, y: 0, z: 1 };
          
          geometry = await occService.createRevolve(profilePts, axisPoint, axisDir, angleDeg, undefined, deflection, isSolid, doc.getNextId("S3D"));
        } else {
          geometry = await occService.createSweep(profilePoints, spinePoints, isSolid, deflection, doc.getNextId("S3D"), profileCount);
        }
        
        const solidId = doc.getNextId("S3D");
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        
        const solid = new Solid3D(solidId, positions, indices);
        addEntity(solid, true, false);
        
        viewer.clearHighlight();
        context.syncFromDocument();
        
        return "Sweep completed.";
      } catch (e: any) {
        return `Sweep failed: ${e.message}`;
      }
    }
  }
}
