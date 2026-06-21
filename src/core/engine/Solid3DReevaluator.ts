import * as THREE from "three";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Solid3D, WorkplaneDefinition } from "../model/Solid3D";
import { Document } from "../model/Document";
import { rebuildSweepGeometry } from "./handlers/transform/SweepGeometryUtil";
import { SketchModel } from "../sketcher/SketchModel";
import { System } from "../sketcher/System";
import { SolveResult } from "../sketcher/Solver";
import { ProfileUtility } from "./ProfileUtility";
import { Line } from "../model/Line";
import { Polyline } from "../model/Polyline";

export class Solid3DReevaluator {
  static async reevaluate(solid: Solid3D, facetres: number, doc: Document): Promise<THREE.BufferGeometry> {
    console.log(`[Reevaluator] Starting re-evaluation for solid: ${solid.id}`);
    const tempId = solid.id;
    const occ = OpenCascadeService.getInstance();
    const deflection = 0.1 / Math.max(1, facetres ?? 5.0);

    let geom: THREE.BufferGeometry | undefined = undefined;

    // 0. PRE-SOLVE SKETCHES: Solve all sketch features in the DAG to get their current 3D profiles
    const resolvedProfiles = new Map<string, { points: [number, number, number][]; vector: [number, number, number]; isClosed: boolean }>();
    const sketchFeatures = solid.features.filter(f => f.type === "Sketch" && f.isActive);
    
    for (const sketchFeat of sketchFeatures) {
      if (!sketchFeat.parameters.sketchData) continue;
      try {
        const model = SketchModel.deserialize(sketchFeat.parameters.sketchData);
        const result = System.solve(model);
        if (result.result === SolveResult.SOLVED_OKAY || result.result === 2 /* Singular/Redundant */) {
          const wp = sketchFeat.parameters.workplane as WorkplaneDefinition;
          const pts2d = model.getProfilePoints();
          
          if (pts2d.length > 0 && wp) {
            const pts3d = this.map2DTo3D(pts2d, wp);
            resolvedProfiles.set(sketchFeat.id, {
              points: pts3d,
              vector: [wp.normal.x, wp.normal.y, wp.normal.z],
              isClosed: true 
            });
            console.log(`[Reevaluator] Resolved sketch ${sketchFeat.id} into ${pts3d.length} 3D points`);
          }
        }
      } catch (e) {
        console.warn(`[Reevaluator] Failed to solve sketch ${sketchFeat.id}:`, e);
      }
    }

    // 1. START WITH THE BASE: Always recreate the original primitive first
    if (solid.creationParams) {
      const primType = solid.creationParams.type;
      const params = solid.creationParams.params as any;

      if (primType === "box") {
        geom = await occ.createBox(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.dx), Number(params.dy), Number(params.dz),
          deflection, tempId
        );
      } else if (primType === "cylinder") {
        geom = await occ.createCylinder(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r), Number(params.h), deflection, tempId
        );
      } else if (primType === "sphere") {
        geom = await occ.createSphere(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r), deflection, tempId
        );
      } else if (primType === "cone") {
        geom = await occ.createFrustum(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r1), Number(params.r2), Number(params.h), deflection, tempId
        );
      } else if (primType === "torus") {
        geom = await occ.createTorus(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r1), Number(params.r2), deflection, tempId
        );
      } else if (primType === "wedge") {
        geom = await occ.createWedge(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.dx), Number(params.dy), Number(params.dz),
          Number(params.ltx), deflection, tempId
        );
      } else if (primType === "pyramid") {
        geom = await occ.createPyramid(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.sides), Number(params.radius), Number(params.height),
          deflection, tempId
        );
      } else if (primType === "polyhedron") {
        geom = await occ.createPolyhedron(params.points, params.faces, deflection, tempId);
      } else if (primType === "hull") {
        geom = await occ.createConvexHull(params.points, params.shapeIds, deflection, tempId);
      } else if (primType === "extrude") {
        let pts: any = params.points || [];
        let isClosed = params.isClosed !== false;
        let vector: number[] | undefined = undefined;

        // ASSOCIATIVE LINK (Phase 9): If this solid was created from a 2D entity,
        // fetch the live coordinates now.
        if (params.sourceEntityId) {
            const sourceEnt = doc.getEntity(params.sourceEntityId);
            if (sourceEnt) {
                const currentHash = ProfileUtility.getGeometryHash(sourceEnt);
                if (currentHash !== params.sourceSnapshotHash) {
                    console.log(`[Reevaluator] Source entity ${params.sourceEntityId} changed. Regenerating...`);
                    const liveData = ProfileUtility.getProfilePoints(sourceEnt);
                    pts = liveData.points;
                    isClosed = liveData.isClosed;
                    
                    // Update solid metadata for persistence
                    params.points = pts;
                    params.isClosed = isClosed;
                    params.sourceSnapshotHash = currentHash;
                }
            }
        }

        // If driven by a sketch (Phase 8), use the solved 3D profile
        if (params.sketchId && resolvedProfiles.has(params.sketchId)) {
          const profile = resolvedProfiles.get(params.sketchId)!;
          pts = profile.points;
          isClosed = profile.isClosed;
          vector = profile.vector;
          console.log(`[Reevaluator] Extrude ${tempId} using linked sketch profile`);
        } else {
          console.log(`[Reevaluator] Extrude ${tempId} using profile with ${pts.length} pts`);
        }

        geom = await occ.createExtrude(
          pts, Number(params.height ?? 1), Number(params.thickness ?? 0),
          deflection, isClosed, tempId, vector
        );
      } else if (primType === "revolve") {
        let pts: any = params.points || [];
        let isClosed = params.isClosed !== false;

        // ASSOCIATIVE LINK: If this solid was created from a 2D entity,
        // fetch the live coordinates now (mirrors what extrude does).
        if (params.sourceEntityId) {
          const sourceEnt = doc.getEntity(params.sourceEntityId);
          if (sourceEnt) {
            const currentHash = ProfileUtility.getGeometryHash(sourceEnt);
            
            // 1. AXIS ENTITY TRACKING (Strongest Link)
            // If the axis was defined by a specific entity (e.g. a Line), update axis from it.
            if (params.axisEntityId) {
                const axisEnt = doc.getEntity(params.axisEntityId);
                if (axisEnt instanceof Line) {
                    params.axisPoint = { x: axisEnt.x1, y: axisEnt.y1, z: axisEnt.elevation || 0 };
                    const dx = axisEnt.x2 - axisEnt.x1, dy = axisEnt.y2 - axisEnt.y1, dz = 0;
                    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (len > 1e-6) params.axisDir = { x: dx/len, y: dy/len, z: dz/len };
                } else if (axisEnt instanceof Polyline && params.axisSegmentIndex !== undefined) {
                    const idx = params.axisSegmentIndex;
                    const v1 = axisEnt.vertices[idx], v2 = axisEnt.vertices[(idx+1) % axisEnt.vertices.length];
                    params.axisPoint = { x: v1.x, y: v1.y, z: axisEnt.elevation || 0 };
                    const dx = v2.x - v1.x, dy = v2.y - v1.y, dz = 0;
                    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (len > 1e-6) params.axisDir = { x: dx/len, y: dy/len, z: dz/len };
                }
            }

            if (currentHash !== params.sourceSnapshotHash) {
              console.log(`[Reevaluator] Revolve source entity ${params.sourceEntityId} changed. Regenerating...`);
              const liveData = ProfileUtility.getProfilePoints(sourceEnt);
              
              // 2. AXIS TRANSLATION FALLBACK (Weak Link)
              // If the axis isn't an entity, but the whole profile was moved, move the axis by the same delta.
              if (params.points && params.points.length > 0 && liveData.points.length > 0 && !params.sketchId && !params.axisEntityId) {
                  const pOld = params.points[0];
                  const pNew = liveData.points[0];
                  const dx = pNew.x - pOld.x;
                  const dy = pNew.y - pOld.y;
                  const dz = (pNew.z || 0) - (pOld.z || 0);

                  if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6 || Math.abs(dz) > 1e-6) {
                      console.log(`[Reevaluator] Detected profile translation: ${dx.toFixed(3)}, ${dy.toFixed(3)}. Updating revolve axis.`);
                      const ax = params.axisPoint;
                      const curX = ax.x !== undefined ? ax.x : (Array.isArray(ax) ? ax[0] : 0);
                      const curY = ax.y !== undefined ? ax.y : (Array.isArray(ax) ? ax[1] : 0);
                      const curZ = ax.z !== undefined ? ax.z : (Array.isArray(ax) ? ax[2] : 0);
                      params.axisPoint = { x: curX + dx, y: curY + dy, z: curZ + dz };
                  }
              }

              pts = liveData.points;
              // Update solid metadata for persistence
              params.points = pts;
              params.isClosed = liveData.isClosed;
              params.sourceSnapshotHash = currentHash;
            }
          }
        }

        if (params.sketchId && resolvedProfiles.has(params.sketchId)) {
          const profile = resolvedProfiles.get(params.sketchId)!;
          pts = profile.points;
          isClosed = profile.isClosed;
        }

        geom = await occ.createRevolve(
          pts, params.axisPoint, params.axisDir,
          Number(params.angle), Number(params.thickness), deflection, isClosed, tempId
        );
      } else if (primType === "sweep") {
        const profileEntity = doc.getEntity(params.profileId);
        const spineEntity = doc.getEntity(params.spineId);
        if (profileEntity && spineEntity) {
            const data = await rebuildSweepGeometry(profileEntity, spineEntity, params.isSolid, facetres, deflection, tempId, params.cornerMode);
            geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
            geom.setIndex(data.indices);
            geom.computeVertexNormals();
            geom.userData = {
              faceMapping: data.faceMapping,
              edgeLines: data.edgeLines,
              brepSnapshot: data.brepSnapshot,
            };
        }
      } else if (primType === "brep") {
        // Hydrate from base snapshot if it exists
        if (solid.baseBrepSnapshot) {
           const data = await occ.importBRep(tempId, solid.baseBrepSnapshot, deflection);
           if (data) {
              geom = new THREE.BufferGeometry();
              geom.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
              geom.setIndex(data.indices);
              geom.computeVertexNormals();
              geom.userData = {
                faceMapping: data.faceMapping,
                edgeLines: data.edgeLines,
                brepSnapshot: data.brepBytes,
                brepBytes: data.brepBytes
              };
           }
        }
      }
    }

    // 2. APPLY TRANSFORMATIONS (Global solid move/rotate)
    if (geom && solid.transform) {
        if (solid.transform.type === 'translate') {
          geom = await occ.transformShape(tempId, solid.transform.dx, solid.transform.dy, solid.transform.dz, tempId, deflection);
        } else if (solid.transform.type === 'rotate') {
          geom = await occ.rotateShape(tempId, solid.transform.rx, solid.transform.ry, solid.transform.rz, solid.transform.cx, solid.transform.cy, solid.transform.cz, tempId, deflection);
        }
    }

    // 3. APPLY FEATURES (The DAG nodes)
    for (const feat of solid.features) {
      if (!feat.isActive) continue;
      if (feat.type === "Sketch") continue; // Already processed in Step 0

      const params = feat.parameters as any;
      if (feat.type === "Fillet") {
        const edgeIndex = Number(params.edgeIndex);
        const radius = Number(params.radius);
        geom = await occ.filletSolid(tempId, edgeIndex, radius, deflection);
      } else if (feat.type === "Chamfer") {
        const edgeIndex = Number(params.edgeIndex);
        const radius = Number(params.radius); // distance
        geom = await occ.chamferSolid(tempId, edgeIndex, radius, deflection);
      } else if (feat.type === "Scale") {
        const bx = Number(params.cx ?? 0);
        const by = Number(params.cy ?? 0);
        const bz = Number(params.cz ?? 0);
        const fx = Number(params.factorX ?? 1);
        const fy = Number(params.factorY ?? 1);
        const fz = Number(params.factorZ ?? 1);
        geom = await occ.scaleShape(
          tempId, undefined,
          bx, by, bz,
          tempId, deflection, fx, fy, fz
        );
      } else if (feat.type === "Shell") {
        const thickness = Number(params.thickness ?? 1);
        const faceIndices = params.faceIndices as number[] ?? [];
        const removeFaces = params.removeFaces !== false;
        geom = await occ.makeThickSolid(tempId, faceIndices, thickness, deflection, removeFaces);
      } else if (feat.type === "Cut") {
        const toolId = params.toolId;
        if (toolId) {
            geom = await occ.createBoolean('cut', tempId, toolId, tempId, deflection);
        }
      }
    }

    if (!geom) {
      throw new Error("Evaluation did not generate any geometry.");
    }

    return geom;
  }

  private static map2DTo3D(points: { x: number; y: number }[], wp: WorkplaneDefinition): [number, number, number][] {
    const origin = wp.origin;
    const normal = wp.normal;
    const xAxis = wp.xAxis;
    
    // yAxis = normal x xAxis
    const yAxis = {
      x: normal.y * xAxis.z - normal.z * xAxis.y,
      y: normal.z * xAxis.x - normal.x * xAxis.z,
      z: normal.x * xAxis.y - normal.y * xAxis.x
    };

    return points.map(p => {
      return [
        origin.x + p.x * xAxis.x + p.y * yAxis.x,
        origin.y + p.x * xAxis.y + p.y * yAxis.y,
        origin.z + p.x * xAxis.z + p.y * yAxis.z
      ] as [number, number, number];
    });
  }
}
