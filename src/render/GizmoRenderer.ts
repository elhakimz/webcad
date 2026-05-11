import * as THREE from "three";

export interface HandleDescriptor {
  type: 'translate' | 'rotate';
  axis: 'X' | 'Y' | 'Z' | 'VIEW';
  dir?: THREE.Vector3;
  normal?: THREE.Vector3;
}

export class GizmoRenderer {
  public root: THREE.Group;
  public translateGroup: THREE.Group;
  public rotateGroup: THREE.Group;

  private xArrow!: THREE.Group;
  private yArrow!: THREE.Group;
  private zArrow!: THREE.Group;
  private xRing!: THREE.Mesh;
  private yRing!: THREE.Mesh;
  private zRing!: THREE.Mesh;
  private centerHandle!: THREE.Mesh;

  public handleMap: Map<string, HandleDescriptor> = new Map();

  private readonly AXIS_LENGTH = 80;
  private readonly ARROW_HEAD_LEN = 6;
  private readonly ARROW_HEAD_RAD = 1.5;
  private readonly SHAFT_RAD = 0.3;
  private readonly RING_RADIUS = 55;
  private readonly RING_TUBE_RAD = 0.5;
  private readonly RING_SEGMENTS = 64;
  private readonly HANDLE_OPACITY = 0.85;
  private readonly HIGHLIGHT_COLOR = 0xddc040;

  private readonly X_COLOR = 0xcc5555;   // muted red
  private readonly Y_COLOR = 0x55aa55;   // muted green
  private readonly Z_COLOR = 0x5577cc;   // muted blue
  private readonly CENTER_COLOR = 0xcccccc;

  public GIZMO_BASE_SIZE = 1; // Default to 1, scaled by manager

  constructor() {
    this.root = new THREE.Group();
    this.root.renderOrder = 999;
    this.translateGroup = new THREE.Group();
    this.rotateGroup = new THREE.Group();
    this.root.add(this.translateGroup, this.rotateGroup);
  }

  public build(): THREE.Group {
    this.buildTranslateAxis('X', new THREE.Vector3(1, 0, 0), this.X_COLOR);
    this.buildTranslateAxis('Y', new THREE.Vector3(0, 1, 0), this.Y_COLOR);
    this.buildTranslateAxis('Z', new THREE.Vector3(0, 0, 1), this.Z_COLOR);

    this.buildRotateRing('X', new THREE.Vector3(1, 0, 0), this.X_COLOR);
    this.buildRotateRing('Y', new THREE.Vector3(0, 1, 0), this.Y_COLOR);
    this.buildRotateRing('Z', new THREE.Vector3(0, 0, 1), this.Z_COLOR);

    this.buildCenterHandle();

    return this.root;
  }

  private buildTranslateAxis(name: 'X' | 'Y' | 'Z', dir: THREE.Vector3, color: number) {
    const group = new THREE.Group();

    // Shaft: thin cylinder along +dir
    const shaftGeo = new THREE.CylinderGeometry(this.SHAFT_RAD, this.SHAFT_RAD, this.AXIS_LENGTH, 8);
    
    // CylinderGeometry is along Y by default, rotate to align with dir
    if (name === 'X') shaftGeo.rotateZ(-Math.PI / 2);
    if (name === 'Z') shaftGeo.rotateX(Math.PI / 2);
    
    shaftGeo.translate(dir.x * this.AXIS_LENGTH / 2, dir.y * this.AXIS_LENGTH / 2, dir.z * this.AXIS_LENGTH / 2);
    
    const shaft = new THREE.Mesh(shaftGeo, this.buildMaterial(color));
    shaft.userData = { handle: 'translate', axis: name, part: 'shaft' };

    // Cone arrowhead at tip
    const coneGeo = new THREE.ConeGeometry(this.ARROW_HEAD_RAD, this.ARROW_HEAD_LEN, 12);
    
    if (name === 'X') coneGeo.rotateZ(-Math.PI / 2);
    if (name === 'Z') coneGeo.rotateX(Math.PI / 2);
    
    const offset = this.AXIS_LENGTH + this.ARROW_HEAD_LEN / 2;
    coneGeo.translate(dir.x * offset, dir.y * offset, dir.z * offset);
    
    const cone = new THREE.Mesh(coneGeo, this.buildMaterial(color));
    cone.userData = { handle: 'translate', axis: name, part: 'cone' };

    group.add(shaft, cone);
    this.translateGroup.add(group);

    this.handleMap.set(shaft.uuid, { type: 'translate', axis: name, dir });
    this.handleMap.set(cone.uuid, { type: 'translate', axis: name, dir });

    if (name === 'X') this.xArrow = group;
    if (name === 'Y') this.yArrow = group;
    if (name === 'Z') this.zArrow = group;
  }

  private buildRotateRing(name: 'X' | 'Y' | 'Z', normal: THREE.Vector3, color: number) {
    // TorusGeometry lies in XY plane by default (normal is Z)
    const torusGeo = new THREE.TorusGeometry(this.RING_RADIUS, this.RING_TUBE_RAD, 8, this.RING_SEGMENTS);

    if (name === 'X') torusGeo.rotateY(Math.PI / 2);   // normal -> X
    if (name === 'Y') torusGeo.rotateX(Math.PI / 2);   // normal -> Y

    const ring = new THREE.Mesh(torusGeo, this.buildMaterial(color));
    ring.userData = { handle: 'rotate', axis: name, normal };
    ring.renderOrder = 999;

    this.rotateGroup.add(ring);
    this.handleMap.set(ring.uuid, { type: 'rotate', axis: name, normal });

    if (name === 'X') this.xRing = ring;
    if (name === 'Y') this.yRing = ring;
    if (name === 'Z') this.zRing = ring;
  }

  private buildCenterHandle() {
    const geo = new THREE.BoxGeometry(10, 10, 10);
    this.centerHandle = new THREE.Mesh(geo, this.buildMaterial(this.CENTER_COLOR));
    this.centerHandle.userData = { handle: 'translate', axis: 'VIEW' };
    this.translateGroup.add(this.centerHandle);
    this.handleMap.set(this.centerHandle.uuid, { type: 'translate', axis: 'VIEW' });
  }

  private buildMaterial(color: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      depthTest: false,    // always visible through objects
      depthWrite: false,
      transparent: true,
      opacity: this.HANDLE_OPACITY,
      toneMapped: false
    });
  }

  public highlight(handleUUID: string, active: boolean) {
    const mesh = this.findMeshByUUID(handleUUID);
    if (!mesh) return;

    if (active) {
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(this.HIGHLIGHT_COLOR);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1.0;
    } else {
      const descriptor = this.handleMap.get(handleUUID);
      if (descriptor) {
        (mesh.material as THREE.MeshBasicMaterial).color.setHex(this.getOriginalColor(descriptor.axis));
        (mesh.material as THREE.MeshBasicMaterial).opacity = this.HANDLE_OPACITY;
      }
    }
  }

  private findMeshByUUID(uuid: string): THREE.Mesh | null {
    let result: THREE.Mesh | null = null;
    this.root.traverse(child => {
      if (child instanceof THREE.Mesh && child.uuid === uuid) {
        result = child;
      }
    });
    return result;
  }

  private getOriginalColor(axis: 'X' | 'Y' | 'Z' | 'VIEW'): number {
    if (axis === 'X') return this.X_COLOR;
    if (axis === 'Y') return this.Y_COLOR;
    if (axis === 'Z') return this.Z_COLOR;
    return this.CENTER_COLOR;
  }

  public updateTransform(targetPosition: THREE.Vector3, camera: THREE.OrthographicCamera, cameraTarget: THREE.Vector3) {
    this.root.position.copy(targetPosition);

    // Size is set by GizmoManager based on object size
    const scale = this.GIZMO_BASE_SIZE;
    this.root.scale.setScalar(scale);

    // Fade rings whose normal is nearly parallel to view direction
    const cameraDir = camera.position.clone().sub(cameraTarget).normalize();
    
    [this.xRing, this.yRing, this.zRing].forEach(ring => {
      if (ring) {
        const normal = ring.userData.normal as THREE.Vector3;
        const dot = Math.abs(normal.dot(cameraDir));
        (ring.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.lerp(0.85, 0.15, dot);
      }
    });
  }
}
