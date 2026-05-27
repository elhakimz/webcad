import * as THREE from "three";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Solid3D } from "../model/Solid3D";
import { Document } from "../model/Document";
import { rebuildSweepGeometry } from "./handlers/transform/SweepGeometryUtil";

export class Solid3DReevaluator {
  static async reevaluate(solid: Solid3D, facetres: number, doc: Document): Promise<THREE.BufferGeometry> {
    const tempId = solid.id;
    const occ = OpenCascadeService.getInstance();
    const deflection = 0.1 / (facetres || 5.0);

    let geom: THREE.BufferGeometry | undefined = undefined;

    // 1. START WITH THE BASE: Always recreate the original primitive first
    if (solid.creationParams) {
      const primType = solid.creationParams.type;
      const params = solid.creationParams.params as any;

      if (primType === "box") {
        geom = await occ.createBox(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.dx ?? 1), Number(params.dy ?? 1), Number(params.dz ?? 1),
          deflection, tempId
        );
      } else if (primType === "cylinder") {
        geom = await occ.createCylinder(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.radius ?? 1), Number(params.height ?? 1),
          deflection, tempId
        );
      } else if (primType === "sphere") {
        geom = await occ.createSphere(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r ?? 1),
          deflection, tempId
        );
      } else if (primType === "cone") {
        geom = await occ.createCone(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r ?? 1), Number(params.h ?? 1),
          deflection, tempId
        );
      } else if (primType === "torus") {
        geom = await occ.createTorus(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.r1 ?? 2), Number(params.r2 ?? 0.5),
          deflection, tempId
        );
      } else if (primType === "wedge") {
        geom = await occ.createWedge(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.x ?? 0) + Number(params.dx ?? 1),
          Number(params.y ?? 0) + Number(params.dy ?? 1),
          Number(params.dz ?? 1),
          Number(params.ltx ?? 0.5),
          deflection, tempId
        );
      } else if (primType === "pyramid") {
        geom = await occ.createPyramid(
          Number(params.x ?? 0), Number(params.y ?? 0), Number(params.z ?? 0),
          Number(params.sides ?? 4), Number(params.radius ?? 1), Number(params.height ?? 1),
          deflection, tempId
        );
      } else if (primType === "extrude") {
        const pts = params.points || [];
        geom = await occ.createExtrude(
          pts, Number(params.height ?? 1), Number(params.thickness ?? 0),
          deflection, params.isClosed !== false, tempId
        );
      } else if (primType === "revolve") {
        geom = await occ.createRevolve(
          params.points, params.axisPoint, params.axisDir,
          Number(params.angle), Number(params.thickness), deflection, params.isClosed !== false, tempId
        );
      } else if (primType === "sweep") {
        const profileEntity = doc.getEntity(params.profileId);
        const spineEntity = doc.getEntity(params.spineId);
        if (profileEntity && spineEntity) {
          const geomData = await rebuildSweepGeometry(
            profileEntity,
            spineEntity,
            params.isSolid !== false,
            facetres,
            deflection,
            tempId,
            params.cornerMode
          );
          geom = (occ as any).buildGeometry(geomData);
        }
      } else if (primType === "polyhedron") {
        geom = await occ.createPolyhedron(params.points, params.faces, deflection, tempId);
      } else if (primType === "hull") {
        geom = await occ.createConvexHull(params.points, params.shapeIds, deflection, tempId);
      }
    }

    // 2. FALLBACK FOR IMPORTED BREPS: If no creation params, start with the base snapshot
    if (!geom) {
      const snapshot = solid.baseBrepSnapshot || solid.brepSnapshot;
      if (snapshot) {
        const data = await occ.importBRep(tempId, snapshot, deflection);
        geom = (occ as any).buildGeometry(data);
      }
    }

    if (!geom) {
      throw new Error("Evaluation did not generate any geometry. Base primitive missing.");
    }

    // 3. APPLY ACTIVE FEATURES: Run all active features (Scale, Fillet, Chamfer) on the clean base
    const activeFeatures = solid.features.filter(f => f.isActive && !f.id.endsWith('_base'));
    
    for (let i = 0; i < activeFeatures.length; i++) {
      const feat = activeFeatures[i];
      const params = feat.parameters;

      if (feat.type === "Fillet") {
        const radius = Number(params.radius ?? 0);
        if (radius > 0) {
          if (params.edgeIndex !== undefined) {
            geom = await occ.filletSolid(tempId, Number(params.edgeIndex), radius, deflection, params.visualP1, params.visualP2);
          } else if (params.faceIndex !== undefined) {
            geom = await occ.filletSolidFace(tempId, Number(params.faceIndex), radius, deflection);
          }
        }
      } else if (feat.type === "Chamfer") {
        const distance = Number(params.distance ?? 0);
        if (distance > 0) {
          if (params.edgeIndex !== undefined) {
            geom = await occ.chamferSolid(tempId, Number(params.edgeIndex), distance, deflection, params.visualP1, params.visualP2);
          } else if (params.faceIndex !== undefined) {
            geom = await occ.chamferSolidFace(tempId, Number(params.faceIndex), distance, deflection);
          }
        }
      } else if (feat.type === "Scale") {
        const fx = Number(params.factorX ?? params.factor ?? 1.0);
        const fy = Number(params.factorY ?? params.factor ?? 1.0);
        const fz = Number(params.factorZ ?? params.factor ?? 1.0);
        const bx = params.baseX !== undefined ? Number(params.baseX) : solid.position.x;
        const by = params.baseY !== undefined ? Number(params.baseY) : solid.position.y;
        const bz = params.baseZ !== undefined ? Number(params.baseZ) : solid.position.z;
        geom = await occ.scaleShape(
          tempId, undefined,
          bx, by, bz,
          tempId, deflection, fx, fy, fz
        );
      } else if (feat.type === "Cut") {
        const cx = Number(params.x ?? 0);
        const cy = Number(params.y ?? 0);
        const cz = Number(params.z ?? 0);
        const cdx = Number(params.dx ?? 1);
        const cdy = Number(params.dy ?? 1);
        const cdz = Number(params.dz ?? 1);

        const cutToolId = `${tempId}_cut_tool_${i}`;
        await occ.createBox(cx, cy, cz, cdx, cdy, cdz, deflection, cutToolId);
        geom = await occ.createBoolean('cut', tempId, cutToolId, tempId, deflection);
        await occ.releaseShapes([cutToolId]);
      } else if (feat.type === "Chamfer") {
        const distance = Number(params.distance ?? 0);
        if (distance > 0) {
          if (params.edgeIndex !== undefined) {
            geom = await occ.chamferSolid(tempId, Number(params.edgeIndex), distance);
          } else if (params.faceIndex !== undefined) {
            geom = await occ.chamferSolidFace(tempId, Number(params.faceIndex), distance);
          } else {
            geom = await occ.chamferSolid(tempId, 0, distance);
          }
        }
      } else if (feat.type === "Shell") {
        const thickness = Number(params.thickness ?? 1.0);
        const faceIndices = params.faceIndices || [];
        const removeFaces = params.removeFaces !== false;
        geom = await occ.makeThickSolid(tempId, faceIndices, thickness, removeFaces);
      }
    }

    if (!geom) {
      throw new Error("Evaluation did not generate any geometry.");
    }

    return geom;
  }
}
