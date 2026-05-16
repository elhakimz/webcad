import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Polyline } from "../../../model/Polyline";
import { Circle } from "../../../model/Circle";
import { Spline } from "../../../model/Spline";
import { Line } from "../../../model/Line";
import { Arc } from "../../../model/Arc";
import { Ellipse } from "../../../model/Ellipse";
import { Solid3D } from "../../../model/Solid3D";
import { OpenCascadeService } from "../../../io/OpenCascadeService";
import { bulgeToArc, tessellateSpline } from "../../../engine/MathUtils";
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
      const axisPoint: {x: number, y: number, z: number} = { x: 0, y: 0, z: 0 };
      const axisDir: {x: number, y: number, z: number} = { x: 0, y: 0, z: 1 };

      // Extract points from spine
      let spinePoints: {x: number, y: number, z: number}[] = [];
      const spineElevation = spineEntity.elevation || 0;

      if (spineEntity instanceof Line) {
        spinePoints = [
          { x: spineEntity.x1, y: spineEntity.y1, z: spineElevation },
          { x: spineEntity.x2, y: spineEntity.y2, z: spineElevation }
        ];
      } else if (spineEntity instanceof Polyline) {
        spinePoints = [];
        const count = spineEntity.vertices.length;
        const limit = spineEntity.closed ? count : count - 1;
        
        for (let i = 0; i < limit; i++) {
          const v1 = spineEntity.vertices[i];
          const v2 = spineEntity.vertices[(i + 1) % count];
          
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
              const segments = Math.max(8, Math.floor(8 * facetres));
              for (let j = 0; j < segments; j++) {
                const angle = startAngle + (j / segments) * sweep;
                spinePoints.push({
                  x: arcParams.cx + arcParams.r * Math.cos(angle),
                  y: arcParams.cy + arcParams.r * Math.sin(angle),
                  z: spineElevation
                });
              }
            } else {
              spinePoints.push({ x: v1.x, y: v1.y, z: spineElevation });
            }
          } else {
            spinePoints.push({ x: v1.x, y: v1.y, z: spineElevation });
          }
        }
        // Add the very last point if not closed
        if (!spineEntity.closed) {
          const lastV = spineEntity.vertices[count - 1];
          spinePoints.push({ x: lastV.x, y: lastV.y, z: spineElevation });
        } else {
          // If closed, add the first point to close it
          spinePoints.push(spinePoints[0]);
        }
      } else if (spineEntity instanceof Spline) {
        // Reduce segments for sweep based on facetres
        const segments = Math.max(10, Math.floor(6 * facetres));
        spinePoints = tessellateSpline(spineEntity.controlPoints, spineEntity.degree, spineEntity.knots, segments)
          .map(v => ({ x: v.x, y: v.y, z: spineElevation }));
      } else if (spineEntity instanceof Arc) {
        const segments = Math.max(16, Math.floor(16 * facetres));
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
        const segments = Math.max(12, Math.floor(6 * facetres));
        
        if (spineEntity instanceof Arc) {
          profileCount = Math.max(3, Math.floor(1 * facetres));
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
          for (let i = 0; i <= segments; i++) {
            const t = (i / segments) * 2 * Math.PI;
            profilePoints.push({
              x: profileEntity.cx + profileEntity.r * Math.cos(t),
              y: profileEntity.cy + profileEntity.r * Math.sin(t),
              z: elevation
            });
          }
        }
      } else if (profileEntity instanceof Spline) {
        profilePoints = profileEntity.sampledPoints.map(v => ({ x: v.x, y: v.y, z: elevation }));
      } else if (profileEntity instanceof Ellipse) {
        const segments = Math.max(12, Math.floor(6 * facetres));
        const a = Math.sqrt(profileEntity.majorX**2 + profileEntity.majorY**2);
        const b = a * profileEntity.ratio;
        const angle = Math.atan2(profileEntity.majorY, profileEntity.majorX);
        
        for (let i = 0; i <= segments; i++) {
          const t = (i / segments) * 2 * Math.PI;
          const cost = Math.cos(t);
          const sint = Math.sin(t);
          
          const rx = a * cost * Math.cos(angle) - b * sint * Math.sin(angle);
          const ry = a * cost * Math.sin(angle) + b * sint * Math.cos(angle);
          
          profilePoints.push({
            x: profileEntity.cx + rx,
            y: profileEntity.cy + ry,
            z: elevation
          });
        }
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
          const facetres = doc.facetres || 5.0;
          const segments = Math.max(8, Math.floor(8 * facetres));
          for (let i = 0; i <= segments; i++) {
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
          const axisPoint = { x: spineEntity.cx, y: spineEntity.cy, z: spineElevation };
          const axisDir = { x: 0, y: 0, z: 1 };
          
          geometry = await occService.createRevolve(profilePts, axisPoint, axisDir, angleDeg, undefined, deflection, isSolid, doc.getNextId("S3D"));
        } else {
          if (spineEntity instanceof Polyline && profileEntity instanceof Circle) {
            console.log("Using pure JS tube generation for Polyline and Circle to bypass OpenCascade failures.");
            
            const allPositions: number[] = [];
            const allIndices: number[] = [];
            const sphereCenters: THREE.Vector3[] = [];
            
            const segments = Math.max(12, Math.floor(6 * facetres)); // Radial segments
            
            // We need a normal vector for the first point
            const normal = new THREE.Vector3(0, 0, 1); // Default up vector
            
            for (let i = 0; i < spinePoints.length; i++) {
              const p = new THREE.Vector3(spinePoints[i].x, spinePoints[i].y, spinePoints[i].z);
              
              // Compute tangent using bisector of incoming and outgoing vectors
              const tangent = new THREE.Vector3();
              const t1 = new THREE.Vector3();
              const t2 = new THREE.Vector3();
              
              if (i > 0) {
                t1.subVectors(p, new THREE.Vector3(spinePoints[i-1].x, spinePoints[i-1].y, spinePoints[i-1].z)).normalize();
              }
              if (i < spinePoints.length - 1) {
                t2.subVectors(new THREE.Vector3(spinePoints[i+1].x, spinePoints[i+1].y, spinePoints[i+1].z), p).normalize();
              }
              
              if (i > 0 && i < spinePoints.length - 1) {
                tangent.addVectors(t1, t2).normalize(); // Bisector
                
                const mode = (action.cornerMode || 'default').toLowerCase();
                if (mode === 'round') {
                  const dot = t1.dot(t2);
                  if (dot < 0.99) {
                    sphereCenters.push(p.clone());
                  }
                }
              } else if (i === 0) {
                tangent.copy(t2);
              } else {
                tangent.copy(t1);
              }
              
              // Parallel transport the normal
              if (i > 0) {
                // Project previous normal onto the plane perpendicular to the new tangent
                // N_new = N_old - (N_old . T) * T
                const dot = normal.dot(tangent);
                normal.subVectors(normal, tangent.clone().multiplyScalar(dot));
                normal.normalize();
              } else {
                // For the first point, if tangent is parallel to default normal, find another one
                if (Math.abs(normal.dot(tangent)) > 0.9) {
                  normal.set(1, 0, 0);
                }
                const dot = normal.dot(tangent);
                normal.subVectors(normal, tangent.clone().multiplyScalar(dot));
                normal.normalize();
              }
              
              const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
              
              for (let k = 0; k <= segments; k++) {
                const t = (k / segments) * 2 * Math.PI;
                const cost = Math.cos(t);
                const sint = Math.sin(t);
                
                const pt = p.clone()
                  .add(normal.clone().multiplyScalar(profileEntity.r * cost))
                  .add(binormal.clone().multiplyScalar(profileEntity.r * sint));
                
                allPositions.push(pt.x, pt.y, pt.z);
              }
            }
            
            // Generate indices
            for (let i = 0; i < spinePoints.length - 1; i++) {
              for (let k = 0; k < segments; k++) {
                const v0 = i * (segments + 1) + k;
                const v1 = (i + 1) * (segments + 1) + k;
                const v2 = (i + 1) * (segments + 1) + k + 1;
                const v3 = i * (segments + 1) + k + 1;
                
                // Two triangles per quad
                allIndices.push(v0, v1, v2);
                allIndices.push(v0, v2, v3);
              }
            }
            
            // Add caps if solid is requested
            if (isSolid) {
              // Start cap
              const startCenterIdx = allPositions.length / 3;
              allPositions.push(spinePoints[0].x, spinePoints[0].y, spinePoints[0].z);
              for (let k = 0; k < segments; k++) {
                allIndices.push(startCenterIdx, k, k + 1);
              }
              
              // End cap
              const endCenterIdx = allPositions.length / 3;
              const lastRingOffset = (spinePoints.length - 1) * (segments + 1);
              allPositions.push(spinePoints[spinePoints.length - 1].x, spinePoints[spinePoints.length - 1].y, spinePoints[spinePoints.length - 1].z);
              for (let k = 0; k < segments; k++) {
                allIndices.push(endCenterIdx, lastRingOffset + k + 1, lastRingOffset + k);
              }
            }
 
            // If cornerMode is Round, add spheres at collected sharp corners!
            for (const center of sphereCenters) {
              const sphereSegments = Math.max(8, Math.floor(3 * facetres));
              const sphereGeom = new THREE.SphereGeometry(profileEntity.r, sphereSegments, sphereSegments);
              const spherePos = Array.from(sphereGeom.getAttribute('position').array) as number[];
              const sphereIdx = Array.from(sphereGeom.getIndex()?.array || []) as number[];
              
              const offset = allPositions.length / 3;
              for (let j = 0; j < spherePos.length; j += 3) {
                allPositions.push(spherePos[j] + center.x, spherePos[j+1] + center.y, spherePos[j+2] + center.z);
              }
              for (let j = 0; j < sphereIdx.length; j++) {
                allIndices.push(sphereIdx[j] + offset);
              }
            }
            
            geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
            geometry.setIndex(allIndices);
            geometry.computeVertexNormals();
          } else {
            // STABLE: Fixed ID mismatch for persistence. Do not change unless allowed.
            const solidId = doc.getNextId("S3D");
            const isEllipse = profileEntity instanceof Ellipse;
            geometry = await occService.createSweep(profilePoints, spinePoints, isSolid, deflection, solidId, profileCount, action.cornerMode, isEllipse);
            
            const positions = Array.from(geometry.getAttribute('position').array) as number[];
            const indices = Array.from(geometry.getIndex()?.array || []) as number[];
            
            const solid = new Solid3D(solidId, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
            solid.brepSnapshot = geometry.userData?.brepSnapshot;
            solid.creationParams = {
              type: 'sweep',
              params: { profileId: action.id1, spineId: action.id2, isSolid }
            };
            addEntity(solid, true, true); // Use current layer to ensure correct color
            
            viewer.clearHighlight();
            context.syncFromDocument();
            
            return "Sweep completed.";
          }
        }
        
        const solidId = doc.getNextId("S3D");
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];
        
        const solid = new Solid3D(solidId, positions, indices, geometry.userData?.faceMapping, geometry.userData?.edgeLines);
        solid.brepSnapshot = geometry.userData?.brepSnapshot;
        addEntity(solid, true, true);
        
        viewer.clearHighlight();
        context.syncFromDocument();
        
        return "Sweep completed.";
      } catch (e: any) {
        return `Sweep failed: ${e.message}`;
      }
    }
  }
}
