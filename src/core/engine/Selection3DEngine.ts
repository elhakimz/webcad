import * as THREE from 'three';
import { Solid3D } from '../model/Solid3D';
import { Entity } from '../model/Entity';
import { IDocument } from '../model/Document';

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
}
