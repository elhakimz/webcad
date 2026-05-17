import * as THREE from "three";
import { Viewer } from "../../render/Viewer";
import { GizmoRenderer, HandleDescriptor } from "../../render/GizmoRenderer";
import { GizmoController } from "./GizmoController";
import { App } from "../../app";
import { Solid3D } from "../model/Solid3D";
import { Insert } from "../model/Insert";
import { OpenCascadeService } from "../io/OpenCascadeService";

export class GizmoManager {
  private renderer: GizmoRenderer;
  private controller: GizmoController;
  private viewer: Viewer;
  private app: App;

  private targetObject: THREE.Object3D | null = null;
  private targetEntity: Solid3D | Insert | null = null;
  private isDragging: boolean = false;
  private initialObjectPosition: THREE.Vector3 = new THREE.Vector3();

  private gizmoMeshes: THREE.Mesh[] = [];

  constructor(viewer: Viewer, app: App) {
    this.viewer = viewer;
    this.app = app;
    this.renderer = new GizmoRenderer();
    this.controller = new GizmoController();

    const root = this.renderer.build();
    this.viewer.scene.add(root);
    root.visible = false;

    // Collect all gizmo meshes for raycasting
    root.traverse(child => {
      if (child instanceof THREE.Mesh) {
        this.gizmoMeshes.push(child);
      }
    });

    this.setupEvents();
  }

  private setupEvents() {
    const canvas = this.viewer.canvas;
    
    // We need to capture events before the viewer or app handles them
    canvas.addEventListener('pointermove', this.onPointerMove.bind(this), { capture: true });
    canvas.addEventListener('pointerdown', this.onPointerDown.bind(this), { capture: true });
    canvas.addEventListener('pointerup', this.onPointerUp.bind(this), { capture: true });
  }

  public attachToObject(obj: THREE.Object3D, entity: Solid3D | Insert) {
    console.log("GizmoManager attaching to object:", obj.name);
    this.targetObject = obj;
    this.targetEntity = entity;
    this.renderer.root.visible = true;
    this.snapGizmoToObject();
    
    // Apply saved position/rotation to the Three.js object if needed
    // In our system, the object position in scene might already be correct
    // because Viewer renders it at its vertex positions.
    // But if we use position/rotation, we should apply them here.
    // For now, let's assume the mesh is already in the right place.
  }

  public detach() {
    this.targetObject = null;
    this.targetEntity = null;
    this.renderer.root.visible = false;
    this.controller.activeHandle = null;
  }

  private snapGizmoToObject() {
    if (!this.targetObject) return;
    
    this.targetObject.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(this.targetObject);
    const center = bbox.getCenter(new THREE.Vector3());
    this.renderer.root.position.copy(center);

    // Apply rotation from the target entity's rotation properties!
    if (this.targetEntity) {
      if (this.targetEntity instanceof Solid3D) {
        const rot = this.targetEntity.rotation;
        this.renderer.root.quaternion.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z));
      } else if (this.targetEntity instanceof Insert) {
        const rotZ = this.targetEntity.rotation * (Math.PI / 180);
        this.renderer.root.quaternion.setFromEuler(new THREE.Euler(0, 0, rotZ));
      }
    }

    // Calculate size of object to scale gizmo proportionally
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Set gizmo base size to 60% of object's max dimension, with a minimum size of 5
    // We divide by 55 because GizmoRenderer uses a base RING_RADIUS of 55!
    const targetRadius = Math.max(maxDim * 0.6, 5);
    this.renderer.GIZMO_BASE_SIZE = targetRadius / 55;
  }

  public update() {
    if (!this.targetObject) return;
    
    if (!this.isDragging) {
      this.snapGizmoToObject();
    }
    
    this.renderer.updateTransform(this.renderer.root.position, this.viewer.camera, this.viewer.target);
    this.viewer.scheduleRender();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.targetObject) return;

    const ndc = this.getNormalizedDeviceCoordinates(e.clientX, e.clientY);

    if (this.isDragging) {
      const moved = this.controller.onDragMove(ndc, this.viewer.camera, this.renderer.root);
      if (moved && this.targetObject) {
        // Apply delta transform to target object
        // The gizmo root position is updated by controller.onDragMove
        // We need to apply the same delta to the target object!
        // Since the object's initial position in scene might be (0,0,0) (vertices in world space),
        // we should apply the delta relative to its state at drag start!
        
        // But wait! We didn't store the initial object position in this class!
        // Let's use the delta of the gizmo!
        const deltaPos = this.renderer.root.position.clone().sub(this.controller.startPos);
        
        // If the target object is a Group at (0,0,0), setting its position to deltaPos will move it correctly!
        this.targetObject.position.copy(this.initialObjectPosition).add(deltaPos);
        
        // For rotation, we can copy the quaternion directly since the gizmo and object share the same orientation!
        this.targetObject.quaternion.copy(this.renderer.root.quaternion);
        
        this.viewer.scheduleRender();
      }
      e.stopPropagation(); // Suppress camera orbit/pan
      return;
    }

    // Hover highlight
    const hit = this.controller.hitTestGizmo(ndc, this.viewer.camera, this.renderer.handleMap, this.gizmoMeshes);
    if (hit) {
      if (this.controller.hoveredHandle !== hit) {
        if (this.controller.hoveredHandle) {
          const uuid = this.findUUIDForHandle(this.controller.hoveredHandle);
          if (uuid) this.renderer.highlight(uuid, false);
        }
        const uuid = this.findUUIDForHandle(hit);
        if (uuid) this.renderer.highlight(uuid, true);
        this.controller.hoveredHandle = hit;
        this.viewer.canvas.style.cursor = 'grab';
      }
      e.stopPropagation();
    } else {
      if (this.controller.hoveredHandle) {
        const uuid = this.findUUIDForHandle(this.controller.hoveredHandle);
        if (uuid) this.renderer.highlight(uuid, false);
        this.controller.hoveredHandle = null;
        this.viewer.canvas.style.cursor = '';
      }
    }
  }

  private onPointerDown(e: PointerEvent) {
    if (!this.targetObject || e.button !== 0) return; // Only left click

    const ndc = this.getNormalizedDeviceCoordinates(e.clientX, e.clientY);
    const hit = this.controller.hitTestGizmo(ndc, this.viewer.camera, this.renderer.handleMap, this.gizmoMeshes);

    if (!hit) return;

    this.initialObjectPosition.copy(this.targetObject.position);
    this.isDragging = true;
    this.viewer.canvas.style.cursor = 'grabbing';
    this.viewer.canvas.setPointerCapture(e.pointerId);

    this.controller.onDragStart(ndc, this.viewer.camera, this.renderer.root, hit);

    e.stopPropagation(); // Prevent Viewer's own pointerdown
    e.preventDefault();
  }

  private onPointerUp(e: PointerEvent) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.viewer.canvas.style.cursor = this.controller.hoveredHandle ? 'grab' : '';
    this.viewer.canvas.releasePointerCapture(e.pointerId);

    this.controller.onDragEnd(this.renderer.root);

    this.syncTransformToEntity();

    // Re-apply selected edge highlight after transform
    if (this.app.selectedEdge) {
      this.viewer.highlightEdge(this.app.selectedEdge.entityId, this.app.selectedEdge.edgeIndex);
    }

    e.stopPropagation();
  }

  private async syncTransformToEntity() {
    if (!this.targetEntity || !this.targetObject) return;

    if (this.targetEntity instanceof Insert) {
      const insert = this.targetEntity;
      const before = insert.clone(insert.id);

      const deltaPos = this.targetObject.position.clone().sub(this.initialObjectPosition);
      insert.x += deltaPos.x;
      insert.y += deltaPos.y;

      const euler = new THREE.Euler().setFromQuaternion(this.targetObject.quaternion);
      insert.rotation = euler.z * (180 / Math.PI);

      this.targetObject.position.set(0, 0, 0);
      this.targetObject.rotation.set(0, 0, 0);

      this.app.doc.history.startTransaction();
      this.app.doc.recordTransform(before, insert);
      this.app.doc.history.commitTransaction();

      this.app.syncFromDocument();
      return;
    }

    const solid = this.targetEntity as Solid3D;
    const before = solid.clone(solid.id) as Solid3D;

    // Calculate the original center from solid.positions to get the relative delta!
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(solid.positions, 3));
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());

    const oldPos = { ...solid.position };

    // Update position and rotation in solid
    // We save the delta position relative to the original center!
    solid.position = {
      x: this.targetObject.position.x - center.x,
      y: this.targetObject.position.y - center.y,
      z: this.targetObject.position.z - center.z
    };

    const euler = new THREE.Euler().setFromQuaternion(this.targetObject.quaternion);
    solid.rotation = {
      x: euler.x,
      y: euler.y,
      z: euler.z
    };

    const oldRot = { ...before.rotation };
    const drx = solid.rotation.x - oldRot.x;
    const dry = solid.rotation.y - oldRot.y;
    const drz = solid.rotation.z - oldRot.z;

    const dx = solid.position.x - oldPos.x;
    const dy = solid.position.y - oldPos.y;
    const dz = solid.position.z - oldPos.z;

    // Sync with OpenCascade worker
    if (!solid.creationParams) {
      // Fallback for raw meshes from DXF!
      console.log(`[GizmoManager] Raw mesh detected for ${solid.id}. Applying transform in JS.`);
      
      const newPositions = new Array(solid.positions.length);
      const v = new THREE.Vector3();
      
      for (let i = 0; i < solid.positions.length; i += 3) {
        v.set(
          solid.positions[i],
          solid.positions[i+1],
          solid.positions[i+2]
        );
        
        // 1. Center the vertex (like Viewer does)
        v.sub(center);
        
        // 2. Apply rotation of the group
        v.applyQuaternion(this.targetObject.quaternion);
        
        // 3. Apply position of the group
        v.add(this.targetObject.position);
        
        newPositions[i] = v.x;
        newPositions[i+1] = v.y;
        newPositions[i+2] = v.z;
      }
      
      solid.positions = newPositions;
      
      // Also update edgeLines if they exist!
      if (solid.edgeLines) {
        const newEdgeLines: number[][] = [];
        for (const line of solid.edgeLines) {
          const newLine = new Array(line.length);
          for (let i = 0; i < line.length; i += 3) {
            v.set(line[i], line[i+1], line[i+2]);
            v.sub(center);
            v.applyQuaternion(this.targetObject.quaternion);
            v.add(this.targetObject.position);
            newLine[i] = v.x;
            newLine[i+1] = v.y;
            newLine[i+2] = v.z;
          }
          newEdgeLines.push(newLine);
        }
        solid.edgeLines = newEdgeLines;
      }
    } else {
      let geom: any = null;
      if (drx !== 0 || dry !== 0 || drz !== 0) {
        try {
          const rotCenter = {
            x: before.position.x + center.x,
            y: before.position.y + center.y,
            z: before.position.z + center.z
          };
          geom = await OpenCascadeService.getInstance().rotateShape(solid.id, drx, dry, drz, rotCenter.x, rotCenter.y, rotCenter.z);
          console.log(`Synced rotation to worker for ${solid.id}: drx=${drx}, dry=${dry}, drz=${drz}`);
        } catch (err) {
          console.error(`Failed to rotate shape in worker for ${solid.id}:`, err);
        }
      }
      if (dx !== 0 || dy !== 0 || dz !== 0) {
        try {
          geom = await OpenCascadeService.getInstance().transformShape(solid.id, dx, dy, dz);
          console.log(`Synced transform to worker for ${solid.id}: dx=${dx}, dy=${dy}, dz=${dz}`);
        } catch (err) {
          console.error(`Failed to transform shape in worker for ${solid.id}:`, err);
        }
      }

      if (geom) {
        solid.positions = Array.from(geom.attributes.position.array);
        solid.indices = geom.index ? Array.from(geom.index.array) : [];
        solid.faceMapping = geom.userData.faceMapping;
        solid.edgeLines = geom.userData.edgeLines;
        solid.brepSnapshot = geom.userData.brepSnapshot;
        
        solid.position = { x: 0, y: 0, z: 0 };
        solid.rotation = { x: 0, y: 0, z: 0 };

        this.app.addEntity(solid, false, false);
      }
    }

    // Record the transformation in the document history
    this.app.doc.history.startTransaction();
    this.app.doc.recordTransform(before, solid);
    this.app.doc.history.commitTransaction();
    
    // Update properties window to reflect new position/rotation
    this.app.updatePropertiesWindow();
  }

  private getNormalizedDeviceCoordinates(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.viewer.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  private findUUIDForHandle(handle: HandleDescriptor): string | null {
    for (const [uuid, desc] of this.renderer.handleMap.entries()) {
      if (desc === handle) return uuid;
    }
    return null;
  }
}
