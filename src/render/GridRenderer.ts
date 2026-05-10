import * as THREE from "three";

export class GridRenderer {
  private gridGroup: THREE.Group = new THREE.Group();
  private axesGroup: THREE.Group = new THREE.Group();
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.gridGroup);
    this.scene.add(this.axesGroup);
    this.initAxes();
  }

  private initAxes() {
    const hex = 0x888888;
    const origin = new THREE.Vector3(0, 0, 0);
    
    // Dot at origin
    const dotGeo = new THREE.BufferGeometry().setFromPoints([origin]);
    const dotMat = new THREE.PointsMaterial({ color: hex, size: 6, sizeAttenuation: false });
    const dot = new THREE.Points(dotGeo, dotMat);
    this.axesGroup.add(dot);

    // Arrows
    const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 50, hex, 10, 5);
    const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 50, hex, 10, 5);
    this.axesGroup.add(arrowX, arrowY);

    // Labels
    const createLabel = (text: string, pos: THREE.Vector3) => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d')!;
      ctx.font = '24px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText(text, 8, 24);
      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(pos);
      sprite.scale.set(15, 15, 1);
      return sprite;
    };
    
    const labelX = createLabel('X', new THREE.Vector3(65, 0, 0));
    const labelY = createLabel('Y', new THREE.Vector3(0, 65, 0));
    this.axesGroup.add(labelX, labelY);
  }

  updateGrid(spacing: number, enabled: boolean, cameraPosition: THREE.Vector3) {
    this.gridGroup.visible = enabled;
    
    // Clear old grid
    while (this.gridGroup.children.length > 0) {
      const obj = this.gridGroup.children[0];
      this.gridGroup.remove(obj);
      if (obj instanceof THREE.Points) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    if (!enabled) return;

    // Create a large grid around the current view
    const count = 100; // 100x100 grid of dots
    const positions = [];
    
    // Align grid to the camera center
    const cx = Math.round(cameraPosition.x / spacing) * spacing;
    const cy = Math.round(cameraPosition.y / spacing) * spacing;

    for (let i = -count; i <= count; i++) {
        for (let j = -count; j <= count; j++) {
            positions.push(cx + i * spacing, cy + j * spacing, -0.5);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x444444, size: 1, sizeAttenuation: false });
    const grid = new THREE.Points(geo, mat);
    this.gridGroup.add(grid);
  }

  setAxesVisible(visible: boolean) {
    this.axesGroup.visible = visible;
  }

  updateAxesScale(scale: number) {
    if (this.axesGroup.visible) {
      this.axesGroup.scale.set(scale, scale, 1);
    }
  }
}
