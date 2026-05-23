import * as THREE from "three";
import { HandleDescriptor } from "../../render/GizmoRenderer";

export class GizmoController {
  private raycaster: THREE.Raycaster;
  public activeHandle: HandleDescriptor | null = null;
  public hoveredHandle: HandleDescriptor | null = null;

  private dragStartMouse: THREE.Vector2 = new THREE.Vector2();
  private dragStartPos: THREE.Vector3 = new THREE.Vector3();
  private dragStartQuat: THREE.Quaternion = new THREE.Quaternion();

  public get startPos(): THREE.Vector3 {
    return this.dragStartPos;
  }

  private dragPlaneNormal: THREE.Vector3 = new THREE.Vector3();
  private dragPlaneOrigin: THREE.Vector3 = new THREE.Vector3();
  private dragStartHitPt: THREE.Vector3 = new THREE.Vector3();

  private axisStartAngle: number = 0;

  constructor() {
    this.raycaster = new THREE.Raycaster();
  }

  public hitTestGizmo(mouseNDC: THREE.Vector2, camera: THREE.Camera, handleMap: Map<string, HandleDescriptor>, gizmoMeshes: THREE.Mesh[]): HandleDescriptor | null {
    this.raycaster.setFromCamera(mouseNDC, camera);
    const hits = this.raycaster.intersectObjects(gizmoMeshes, false);

    if (hits.length === 0) return null;
    return handleMap.get(hits[0].object.uuid) || null;
  }

  public onDragStart(mouseNDC: THREE.Vector2, camera: THREE.Camera, target: THREE.Object3D, handle: HandleDescriptor) {
    this.activeHandle = handle;
    this.dragStartMouse.copy(mouseNDC);
    this.dragStartPos.copy(target.position);
    this.dragStartQuat.copy(target.quaternion);

    if (handle.type === 'translate') {
      this.setupTranslateDragPlane(camera, handle, target.position);
      this.dragStartHitPt.copy(this.raycastOntoPlane(mouseNDC, camera) || target.position);
    } else if (handle.type === 'rotate') {
      this.setupRotateDragPlane(handle, target.position, target.quaternion);
      const hitPt = this.raycastOntoPlane(mouseNDC, camera);
      if (hitPt) {
        this.dragStartHitPt.copy(hitPt);
        const localHit = hitPt.clone().sub(target.position);
        const rotAxis = handle.normal!.clone().applyQuaternion(target.quaternion);
        this.axisStartAngle = this.computeAngleOnPlane(localHit, rotAxis);
      }
    }
  }

  private setupTranslateDragPlane(camera: THREE.Camera, handle: HandleDescriptor, originPt: THREE.Vector3) {
    this.dragPlaneOrigin.copy(originPt);
    
    // Always use a plane facing the camera for robust intersection.
    // This avoids parallel intersection failures that cause jumping.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.dragPlaneNormal.copy(dir).negate(); // Normal points towards camera
  }

  private setupRotateDragPlane(handle: HandleDescriptor, originPt: THREE.Vector3, targetQuat: THREE.Quaternion) {
    this.dragPlaneOrigin.copy(originPt);
    this.dragPlaneNormal.copy(handle.normal!).applyQuaternion(targetQuat);
  }

  public onDragMove(mouseNDC: THREE.Vector2, camera: THREE.Camera, target: THREE.Object3D): boolean {
    if (!this.activeHandle) return false;

    const currentHitPt = this.raycastOntoPlane(mouseNDC, camera);
    if (!currentHitPt) return false;

    if (this.activeHandle.type === 'translate') {
      this.applyTranslate(currentHitPt, target);
    } else if (this.activeHandle.type === 'rotate') {
      this.applyRotate(currentHitPt, target);
    }

    return true;
  }

  private applyTranslate(currentHitPt: THREE.Vector3, target: THREE.Object3D) {
    const delta = currentHitPt.clone().sub(this.dragStartHitPt);

    if (this.activeHandle!.axis === 'VIEW') {
      target.position.copy(this.dragStartPos).add(delta);
    } else {
      // Rotate the local axis direction by the gizmo's rotation to get world direction!
      const axisDir = this.activeHandle!.dir!.clone().applyQuaternion(this.dragStartQuat);
      const projectedLength = delta.dot(axisDir);
      target.position.copy(this.dragStartPos).addScaledVector(axisDir, projectedLength);
    }
  }

  private applyRotate(currentHitPt: THREE.Vector3, target: THREE.Object3D) {
    // Rotate the local axis normal by the gizmo's rotation to get world axis!
    const rotAxis = this.activeHandle!.normal!.clone().applyQuaternion(this.dragStartQuat);
    const _localStart = this.dragStartHitPt.clone().sub(this.dragStartPos);
    const localCurrent = currentHitPt.clone().sub(this.dragStartPos);

    const angleCurrent = this.computeAngleOnPlane(localCurrent, rotAxis);
    let angleDelta = angleCurrent - this.axisStartAngle;

    // Wrap delta to [-PI, PI]
    while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
    while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

    const rotQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, angleDelta);
    target.quaternion.copy(this.dragStartQuat).premultiply(rotQuat);
  }

  public onDragEnd(_target: THREE.Object3D) {
    this.activeHandle = null;
  }

  private raycastOntoPlane(mouseNDC: THREE.Vector2, camera: THREE.Camera): THREE.Vector3 | null {
    this.raycaster.setFromCamera(mouseNDC, camera);
    const ray = this.raycaster.ray;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.dragPlaneNormal, this.dragPlaneOrigin);
    const target = new THREE.Vector3();
    const hit = ray.intersectPlane(plane, target);
    return hit;
  }

  private computeAngleOnPlane(vec: THREE.Vector3, planeNormal: THREE.Vector3): number {
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(planeNormal.dot(u)) > 0.9) {
      u.set(0, 1, 0);
    }
    const v = new THREE.Vector3().crossVectors(planeNormal, u).normalize();
    const realU = new THREE.Vector3().crossVectors(v, planeNormal).normalize();
    
    return Math.atan2(vec.dot(v), vec.dot(realU));
  }
}
