import * as THREE from 'three';
import { Solid3D } from '../model/Solid3D';
import { Entity } from '../model/Entity';
import { IDocument } from '../model/Document';
import * as MathUtils from './MathUtils';

const raycaster = new THREE.Raycaster();
raycaster.params.Mesh.threshold = 0; // exact triangle intersection only

export class Selection3DEngine {
  static lastClickedId: string | null = null;
  static lastClickWorldX: number = Infinity;
  static lastClickWorldY: number = Infinity;
  static CLICK_SAME_POS_TOLERANCE = 5; // drawing units

  private static getSolid3DMeshes(
    scene: THREE.Scene,
    selectableEntities: Entity[]
  ): THREE.Mesh[] {
    const result: THREE.Mesh[] = [];
    const selectableIds = new Set(selectableEntities.map(e => e.id));

    scene.traverse(obj => {
      if (
        obj instanceof THREE.Mesh &&
        obj.userData.type === 'Solid3D' &&
        obj.name &&
        selectableIds.has(obj.name)
      ) {
        result.push(obj);
      }
    });
    return result;
  }

  static getSolid3DAt(
    ndc: THREE.Vector2,
    camera: THREE.OrthographicCamera,
    scene: THREE.Scene,
    doc: IDocument,
    selectableEntities: Entity[]
  ): Solid3D | null {
    raycaster.setFromCamera(ndc, camera);

    const meshes = this.getSolid3DMeshes(scene, selectableEntities);
    if (meshes.length === 0) return null;

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) return null;

    const hit = intersects[0];
    const entityId = hit.object.name;
    const entity = doc.getEntity(entityId);

    if (entity instanceof Solid3D) return entity;
    return null;
  }

  static getSolid3DAtCycling(
    ndc: THREE.Vector2,
    worldX: number,
    worldY: number,
    camera: THREE.OrthographicCamera,
    scene: THREE.Scene,
    doc: IDocument,
    selectableEntities: Entity[]
  ): Solid3D | null {
    raycaster.setFromCamera(ndc, camera);

    const meshes = this.getSolid3DMeshes(scene, selectableEntities);
    if (meshes.length === 0) {
      this.lastClickedId = null;
      return null;
    }

    const intersects = raycaster.intersectObjects(meshes, false);
    if (intersects.length === 0) {
      this.lastClickedId = null;
      return null;
    }

    const distSinceLastClick = Math.sqrt(
      Math.pow(worldX - this.lastClickWorldX, 2) + Math.pow(worldY - this.lastClickWorldY, 2)
    );
    const isSamePosition = distSinceLastClick < this.CLICK_SAME_POS_TOLERANCE;

    let hit;
    if (isSamePosition && this.lastClickedId !== null) {
      const ids = intersects.map(i => i.object.name);
      const lastIdx = ids.indexOf(this.lastClickedId);
      const nextIdx = (lastIdx + 1) % intersects.length;
      hit = intersects[nextIdx];
    } else {
      hit = intersects[0];
    }

    this.lastClickedId = hit.object.name;
    this.lastClickWorldX = worldX;
    this.lastClickWorldY = worldY;

    const entity = doc.getEntity(hit.object.name);
    if (entity instanceof Solid3D) return entity;
    return null;
  }

  static getSubEntityAt(
    ndc: THREE.Vector2,
    camera: THREE.OrthographicCamera,
    scene: THREE.Scene,
    doc: IDocument,
    selectableEntities: Entity[],
    mode: 'EDGE' | 'FACE'
  ): { entity: Solid3D, faceIndex?: number, edgeIndex?: number } | null {
    if (mode === 'FACE') {
      raycaster.setFromCamera(ndc, camera);
      const meshes = this.getSolid3DMeshes(scene, selectableEntities);
      const intersects = raycaster.intersectObjects(meshes, false);
      
      if (intersects.length === 0) return null;
      
      const hit = intersects[0];
      const entity = doc.getEntity(hit.object.name);
      if (!(entity instanceof Solid3D)) return null;
      
      const triangleIndex = hit.faceIndex;
      if (triangleIndex !== undefined && triangleIndex !== null) {
        const mesh = hit.object as THREE.Mesh;
        const faceMapping = mesh.userData.faceMapping;
        if (faceMapping && triangleIndex < faceMapping.length) {
          const mappedFaceIndex = faceMapping[triangleIndex];
          return { entity, faceIndex: mappedFaceIndex };
        }
      }
    } else if (mode === 'EDGE') {
      // Collect all edge line objects from the scene that have been tagged with userData.edgeIndex
      const edgeLines: THREE.Object3D[] = [];
      scene.traverse(obj => {
        if (obj.userData.edgeIndex !== undefined && obj.userData.entityId !== undefined) {
          edgeLines.push(obj);
        }
      });

      if (edgeLines.length === 0) return null;

      const edgeRaycaster = new THREE.Raycaster();
      // Calculate threshold based on screen pixels to match pickbox size
      const screenTolerance = 50; // Increased to 50 pixels tolerance on screen
      const worldTolerance = screenTolerance / camera.zoom;
      edgeRaycaster.params.Line = { threshold: worldTolerance };
      edgeRaycaster.setFromCamera(ndc, camera);

      const hits = edgeRaycaster.intersectObjects(edgeLines, false);
      if (hits.length === 0) return null;

      const hit = hits[0].object;
      const entityId = hit.userData.entityId as string;
      const edgeIndex = hit.userData.edgeIndex as number;

      const entity = doc.getEntity(entityId);
      if (entity instanceof Solid3D) {
        return { entity, edgeIndex };
      }
    }
    
    return null;
  }

  static getSolid3DsInWindow(
    ndc1: THREE.Vector2,
    ndc2: THREE.Vector2,
    camera: THREE.Camera,
    selectableEntities: Entity[]
  ): Solid3D[] {
    const minX = Math.min(ndc1.x, ndc2.x);
    const maxX = Math.max(ndc1.x, ndc2.x);
    const minY = Math.min(ndc1.y, ndc2.y);
    const maxY = Math.max(ndc1.y, ndc2.y);

    return selectableEntities
      .filter((e): e is Solid3D => e instanceof Solid3D)
      .filter(e => {
        const box = e.getBoundingBox3D();
        const corners = [
          new THREE.Vector3(box.minX, box.minY, box.minZ),
          new THREE.Vector3(box.maxX, box.minY, box.minZ),
          new THREE.Vector3(box.minX, box.maxY, box.minZ),
          new THREE.Vector3(box.maxX, box.maxY, box.minZ),
          new THREE.Vector3(box.minX, box.minY, box.maxZ),
          new THREE.Vector3(box.maxX, box.minY, box.maxZ),
          new THREE.Vector3(box.minX, box.maxY, box.maxZ),
          new THREE.Vector3(box.maxX, box.maxY, box.maxZ),
        ];

        corners.forEach(c => c.project(camera));

        const minNdcX = Math.min(...corners.map(c => c.x));
        const maxNdcX = Math.max(...corners.map(c => c.x));
        const minNdcY = Math.min(...corners.map(c => c.y));
        const maxNdcY = Math.max(...corners.map(c => c.y));

        return (
          minNdcX >= minX &&
          maxNdcX <= maxX &&
          minNdcY >= minY &&
          maxNdcY <= maxY
        );
      });
  }

  static getSolid3DsInCrossing(
    ndc1: THREE.Vector2,
    ndc2: THREE.Vector2,
    camera: THREE.Camera,
    selectableEntities: Entity[]
  ): Solid3D[] {
    const minX = Math.min(ndc1.x, ndc2.x);
    const maxX = Math.max(ndc1.x, ndc2.x);
    const minY = Math.min(ndc1.y, ndc2.y);
    const maxY = Math.max(ndc1.y, ndc2.y);

    return selectableEntities
      .filter((e): e is Solid3D => e instanceof Solid3D)
      .filter(e => {
        const box = e.getBoundingBox3D();
        const corners = [
          new THREE.Vector3(box.minX, box.minY, box.minZ),
          new THREE.Vector3(box.maxX, box.minY, box.minZ),
          new THREE.Vector3(box.minX, box.maxY, box.minZ),
          new THREE.Vector3(box.maxX, box.maxY, box.minZ),
          new THREE.Vector3(box.minX, box.minY, box.maxZ),
          new THREE.Vector3(box.maxX, box.minY, box.maxZ),
          new THREE.Vector3(box.minX, box.maxY, box.maxZ),
          new THREE.Vector3(box.maxX, box.maxY, box.maxZ),
        ];

        corners.forEach(c => c.project(camera));

        const minNdcX = Math.min(...corners.map(c => c.x));
        const maxNdcX = Math.max(...corners.map(c => c.x));
        const minNdcY = Math.min(...corners.map(c => c.y));
        const maxNdcY = Math.max(...corners.map(c => c.y));

        // Overlap check in NDC
        return (
          minNdcX <= maxX &&
          maxNdcX >= minX &&
          minNdcY <= maxY &&
          maxNdcY >= minY
        );
      });
  }

  static getHoveredSolid3D(
    ndc: THREE.Vector2,
    camera: THREE.OrthographicCamera,
    scene: THREE.Scene,
    doc: IDocument,
    selectableEntities: Entity[]
  ): Solid3D | null {
    return this.getSolid3DAt(ndc, camera, scene, doc, selectableEntities);
  }

  static getConnectedSolid3Ds(seed: Solid3D, allSolids: Solid3D[]): Solid3D[] {
    const result = new Set<Solid3D>();
    const queue = [seed];
    result.add(seed);

    const vertexMap = new Map<string, Solid3D[]>();
    allSolids.forEach(s => {
      for (let i = 0; i < s.positions.length; i += 3) {
        const x = s.positions[i];
        const y = s.positions[i+1];
        const z = s.positions[i+2];
        const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
        if (!vertexMap.has(key)) vertexMap.set(key, []);
        vertexMap.get(key)!.push(s);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (let i = 0; i < current.positions.length; i += 3) {
        const x = current.positions[i];
        const y = current.positions[i+1];
        const z = current.positions[i+2];
        const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
        
        const connected = vertexMap.get(key) || [];
        connected.forEach(s => {
          if (!result.has(s)) {
            result.add(s);
            queue.push(s);
          }
        });
      }
    }

    return Array.from(result);
  }

  static getSharedEdge(entity: Solid3D, face1: number, face2: number): { edgeIndex: number, p1: {x:number,y:number,z:number}, p2: {x:number,y:number,z:number} } | null {
    if (!entity.edgeLines || !entity.positions || !entity.indices || !entity.faceMapping) return null;

    for (let edgeIdx = 0; edgeIdx < entity.edgeLines.length; edgeIdx++) {
      const edgePoints = entity.edgeLines[edgeIdx];
      if (edgePoints.length < 6) continue;
      
      const p1 = { x: edgePoints[0], y: edgePoints[1], z: edgePoints[2] };
      const p2 = { x: edgePoints[edgePoints.length-3], y: edgePoints[edgePoints.length-2], z: edgePoints[edgePoints.length-1] };
      
      const facesOfP1 = this.getFacesConnectedToPoint(entity, p1);
      const facesOfP2 = this.getFacesConnectedToPoint(entity, p2);
      
      const sharedFaces = facesOfP1.filter(f => facesOfP2.includes(f));
      
      if (sharedFaces.includes(face1) && sharedFaces.includes(face2)) {
        return { edgeIndex: edgeIdx, p1, p2 };
      }
    }
    return null;
  }

  private static getFacesConnectedToPoint(entity: Solid3D, p: {x:number, y:number, z:number}): number[] {
    const faces: Set<number> = new Set();
    const tol = 0.001;
    
    for (let i = 0; i < entity.indices.length; i += 3) {
      const v1Idx = entity.indices[i] * 3;
      const v2Idx = entity.indices[i+1] * 3;
      const v3Idx = entity.indices[i+2] * 3;
      
      const v1 = { x: entity.positions[v1Idx], y: entity.positions[v1Idx+1], z: entity.positions[v1Idx+2] };
      const v2 = { x: entity.positions[v2Idx], y: entity.positions[v2Idx+1], z: entity.positions[v2Idx+2] };
      const v3 = { x: entity.positions[v3Idx], y: entity.positions[v3Idx+1], z: entity.positions[v3Idx+2] };
      
      if (this.isPointEqual(p, v1, tol) || this.isPointEqual(p, v2, tol) || this.isPointEqual(p, v3, tol)) {
        const faceIdx = entity.faceMapping![i / 3];
        faces.add(faceIdx);
      }
    }
    return Array.from(faces);
  }

  private static isPointEqual(p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}, tol: number): boolean {
    return Math.abs(p1.x - p2.x) < tol && Math.abs(p1.y - p2.y) < tol && Math.abs(p1.z - p2.z) < tol;
  }
}
