import * as THREE from "three";
import { Viewer } from "../../render/Viewer";
import { GizmoRenderer, HandleDescriptor } from "../../render/GizmoRenderer";
import { GizmoController } from "./GizmoController";
import { App } from "../../app";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";

export class GizmoManager {
  private renderer: GizmoRenderer;
  private controller: GizmoController;
  private viewer: Viewer;
  private app: App;

  private targetObject: THREE.Object3D | null = null;
  private targetEntity: Solid3D | null = null;
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

  public attachToObject(obj: THREE.Object3D, entity: Solid3D) {
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

    // Sync transform back to entity
    this.syncTransformToEntity();

    e.stopPropagation();
  }

  private async syncTransformToEntity() {
    if (!this.targetEntity || !this.targetObject) return;

    // Create a snapshot of the entity before modification for history
    const before = this.targetEntity.clone(this.targetEntity.id);

    // Calculate the original center from entity.positions to get the relative delta!
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.targetEntity.positions, 3));
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());

    const oldPos = { ...this.targetEntity.position };

    // Update position and rotation in entity
    // We save the delta position relative to the original center!
    this.targetEntity.position = {
      x: this.targetObject.position.x - center.x,
      y: this.targetObject.position.y - center.y,
      z: this.targetObject.position.z - center.z
    };

    const euler = new THREE.Euler().setFromQuaternion(this.targetObject.quaternion);
    this.targetEntity.rotation = {
      x: euler.x,
      y: euler.y,
      z: euler.z
    };

    const dx = this.targetEntity.position.x - oldPos.x;
    const dy = this.targetEntity.position.y - oldPos.y;
    const dz = this.targetEntity.position.z - oldPos.z;

    // Sync with OpenCascade worker
    if (dx !== 0 || dy !== 0 || dz !== 0) {
      try {
        await OpenCascadeService.getInstance().transformShape(this.targetEntity.id, dx, dy, dz);
        console.log(`Synced transform to worker for ${this.targetEntity.id}: dx=${dx}, dy=${dy}, dz=${dz}`);
      } catch (err) {
        console.error(`Failed to transform shape in worker for ${this.targetEntity.id}:`, err);
      }
    }

    // Record the transformation in the document history
    this.app.doc.history.startTransaction();
    this.app.doc.recordTransform(before, this.targetEntity);
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
