import * as THREE from "three"
import { SnapPoint, SnapType } from "../core/engine/SnapEngine"

export class CursorRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private cursorGroup: THREE.Group = new THREE.Group();
  private snapMarkerGroup: THREE.Group = new THREE.Group();
  private activePointMarkerGroup: THREE.Group = new THREE.Group();
  private hoverGroup: THREE.Group = new THREE.Group();
  private pickboxGroup: THREE.Group = new THREE.Group();

  constructor(scene: THREE.Scene, camera: THREE.OrthographicCamera) {
    this.scene = scene;
    this.camera = camera;

    this.scene.add(this.cursorGroup);
    this.scene.add(this.snapMarkerGroup);
    this.scene.add(this.activePointMarkerGroup);
    this.cursorGroup.add(this.hoverGroup);
    this.cursorGroup.add(this.pickboxGroup);

    this.cursorGroup.name = 'cursorGroup';

    this.cursorGroup.renderOrder = 999;
    this.snapMarkerGroup.renderOrder = 1000;
    this.activePointMarkerGroup.renderOrder = 1001;

    this.initCursor();
  }

  private initCursor() {
    const cursorColor = 0x555555; // Brighter grey for the full-screen crosshair
    const size = 1000000; // Large enough to cover the drawing plane

    const hGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0),
      new THREE.Vector3(size, 0, 0)
    ]);
    const vGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -size, 0),
      new THREE.Vector3(0, size, 0)
    ]);

    const mat = new THREE.LineBasicMaterial({ color: cursorColor, depthTest: false, transparent: true });
    // Full-screen crosshair removed as requested by user
    // this.cursorGroup.add(new THREE.Line(hGeo, mat));
    // this.cursorGroup.add(new THREE.Line(vGeo, mat));

    // Add static origin axes
    const originColor = 0x222222;
    const oHGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, 0, 0),
      new THREE.Vector3(size, 0, 0)
    ]);
    const oVGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -size, 0),
      new THREE.Vector3(0, size, 0)
    ]);
    const oMat = new THREE.LineBasicMaterial({ color: originColor });
    this.scene.add(new THREE.Line(oHGeo, oMat));
    this.scene.add(new THREE.Line(oVGeo, oMat));
  }

  setCursor(x: number, y: number, z: number = 0, quaternion?: THREE.Quaternion) {
    this.cursorGroup.position.set(x, y, z);
    if (quaternion) {
      this.cursorGroup.quaternion.copy(quaternion);
    }

    while (this.pickboxGroup.children.length > 0) {
      const obj = this.pickboxGroup.children[0];
      this.pickboxGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    const size = 5 / this.camera.zoom;
    const color = 0x555555; // Same grey as cursor
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-size, -size, 0),
      new THREE.Vector3(size, -size, 0),
      new THREE.Vector3(size, size, 0),
      new THREE.Vector3(-size, size, 0),
      new THREE.Vector3(-size, -size, 0)
    ]);
    this.pickboxGroup.add(new THREE.Line(geo, mat));
  }

  setActivePointMarker(x: number | null, y: number | null, z: number = 0.1, quaternion?: THREE.Quaternion) {
    while (this.activePointMarkerGroup.children.length > 0) {
      const obj = this.activePointMarkerGroup.children[0];
      this.activePointMarkerGroup.remove(obj);
      if (obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
 
    if (x !== null && y !== null) {
      const size = 10 / this.camera.zoom;
      const positions = new Float32Array([
        -size, -size, 0,
         size,  size, 0,
        -size,  size, 0,
         size, -size, 0
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
      const marker = new THREE.LineSegments(geo, mat);
      marker.position.set(x, y, z);
      if (quaternion) {
        marker.quaternion.copy(quaternion);
      }
      this.activePointMarkerGroup.add(marker);
    }
  }

  setSnapMarker(snap: SnapPoint | null) {
    while (this.snapMarkerGroup.children.length > 0) {
      const obj = this.snapMarkerGroup.children[0];
      this.snapMarkerGroup.remove(obj);
      if (obj instanceof THREE.Line || obj instanceof THREE.LineLoop || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    if (snap) {
      const color = 0xffff00; 
      const size = 6 / this.camera.zoom;
      let geo: THREE.BufferGeometry | null = null;
      const mat = new THREE.LineBasicMaterial({ color });
      let mesh: THREE.Object3D | null = null;

      switch (snap.type) {
        case SnapType.ENDPOINT:
          geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-size, -size, 0),
            new THREE.Vector3(size, -size, 0),
            new THREE.Vector3(size, size, 0),
            new THREE.Vector3(-size, size, 0),
            new THREE.Vector3(-size, -size, 0)
          ]);
          mesh = new THREE.Line(geo, mat);
          break;
        case SnapType.MIDPOINT:
          geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, size, 0),
            new THREE.Vector3(-size, -size, 0),
            new THREE.Vector3(size, -size, 0),
            new THREE.Vector3(0, size, 0)
          ]);
          mesh = new THREE.Line(geo, mat);
          break;
        case SnapType.CENTER:
          const curve = new THREE.EllipseCurve(0, 0, size, size, 0, 2 * Math.PI, false, 0);
          const points = curve.getPoints(16);
          geo = new THREE.BufferGeometry().setFromPoints(points);
          mesh = new THREE.LineLoop(geo, mat);
          break;
        case SnapType.INTERSECTION:
          geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-size, -size, 0),
            new THREE.Vector3(size, size, 0),
            new THREE.Vector3(-size, size, 0),
            new THREE.Vector3(size, -size, 0)
          ]);
          mesh = new THREE.LineSegments(geo, mat);
          break;
        case SnapType.PERPENDICULAR:
          geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, size, 0),
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(size, 0, 0)
          ]);
          mesh = new THREE.Line(geo, mat);
          break;
      }

      if (mesh) {
        mesh.position.set(snap.x, snap.y, 0);
        this.snapMarkerGroup.add(mesh);
      }
    }
  }

  setCursorHover(isHovering: boolean) {
    while (this.hoverGroup.children.length > 0) {
      const obj = this.hoverGroup.children[0];
      this.hoverGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    if (isHovering) {
      const color = 0x00FFFF; // Cyan for hover
      const size = 5 / this.camera.zoom;
      const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });

      const leftGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, size, 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-size, -size, 0)
      ]);
      const leftLine = new THREE.Line(leftGeo, mat);

      const rightGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(size, size, 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(size, -size, 0)
      ]);
      const rightLine = new THREE.Line(rightGeo, mat);

      this.hoverGroup.add(leftLine);
      this.hoverGroup.add(rightLine);
    }
  }
}
