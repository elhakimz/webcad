import * as THREE from "three"
import { Entity } from "../core/model/Entity"
import { Line } from "../core/model/Line"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"

export class Viewer {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement

  private isPanning = false
  private lastPanPos = new THREE.Vector2()
  private previewObject: THREE.Object3D | null = null
  private helperGroup: THREE.Group = new THREE.Group()

  constructor(canvas:HTMLCanvasElement){
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.helperGroup);

    // Setup Orthographic Camera with dummy bounds, resize() will set them correctly
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1000)
    
    this.renderer = new THREE.WebGLRenderer({canvas})
    
    this.resize()
    this.camera.position.set(this.camera.right, this.camera.top, 500) 

    this.setupEvents()
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    this.renderer.setSize(w, h);
    
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private getNormalizedDeviceCoordinates(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return new THREE.Vector2(
      (x / rect.width) * 2 - 1,
      -(y / rect.height) * 2 + 1
    );
  }

  setPreview(entity: Entity | null) {
    if (this.previewObject) {
      this.scene.remove(this.previewObject);
      if (this.previewObject instanceof THREE.Line || this.previewObject instanceof THREE.LineLoop) {
        this.previewObject.geometry.dispose();
        if (Array.isArray(this.previewObject.material)) {
          this.previewObject.material.forEach(m => m.dispose());
        } else {
          this.previewObject.material.dispose();
        }
      }
      this.previewObject = null;
    }

    if (entity) {
      const previewColor = 0x888888; // Grey for preview
      if (entity instanceof Line) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(entity.x1, entity.y1, 0),
          new THREE.Vector3(entity.x2, entity.y2, 0)
        ]);
        const mat = new THREE.LineBasicMaterial({ color: previewColor });
        this.previewObject = new THREE.Line(geo, mat);
      } else if (entity instanceof Circle) {
        const curve = new THREE.EllipseCurve(entity.cx, entity.cy, entity.r, entity.r, 0, 2 * Math.PI, false, 0);
        const points = curve.getPoints(50);
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: previewColor });
        this.previewObject = new THREE.LineLoop(geo, mat);
      } else if (entity instanceof Arc) {
        const curve = new THREE.EllipseCurve(entity.cx, entity.cy, entity.r, entity.r, entity.startAngle, entity.endAngle, !entity.ccw, 0);
        const points = curve.getPoints(50);
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: previewColor });
        this.previewObject = new THREE.Line(geo, mat);
      }

      if (this.previewObject) {
        this.scene.add(this.previewObject);
      }
    }

    this.render();
  }

  setHelpers(points: { x: number, y: number }[] | null) {
    // Clear existing helpers
    while (this.helperGroup.children.length > 0) {
      const obj = this.helperGroup.children[0];
      this.helperGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    if (points) {
      const helperColor = 0x555555;
      const size = 10000; // Infinite-ish

      points.forEach(pt => {
        const hGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(pt.x - size, pt.y, 0),
          new THREE.Vector3(pt.x + size, pt.y, 0)
        ]);
        const vGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(pt.x, pt.y - size, 0),
          new THREE.Vector3(pt.x, pt.y + size, 0)
        ]);

        const mat = new THREE.LineBasicMaterial({ color: helperColor });
        this.helperGroup.add(new THREE.Line(hGeo, mat));
        this.helperGroup.add(new THREE.Line(vGeo, mat));
      });
    }

    this.render();
  }

  private setupEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1
      this.camera.zoom *= zoomAmount
      this.camera.updateProjectionMatrix()
      this.render()
    }, { passive: false })

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1) { // Middle button
        this.isPanning = true
        this.lastPanPos.set(e.clientX, e.clientY)
        this.canvas.setPointerCapture(e.pointerId)
      }
    })

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.isPanning) {
        const dx = e.clientX - this.lastPanPos.x
        const dy = e.clientY - this.lastPanPos.y
        this.camera.position.x -= dx / this.camera.zoom
        this.camera.position.y += dy / this.camera.zoom
        this.lastPanPos.set(e.clientX, e.clientY)
        this.render()
      }
    })

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button === 1) {
        this.isPanning = false
        this.canvas.releasePointerCapture(e.pointerId)
      }
    })
  }

  screenToWorld(clientX: number, clientY: number): { x: number, y: number } {
    const mouse = this.getNormalizedDeviceCoordinates(clientX, clientY);
    const vec = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vec.unproject(this.camera)
    return { x: vec.x, y: vec.y }
  }

  addLine(x1:number,y1:number,x2:number,y2:number, id?: string){
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1,y1,0),
      new THREE.Vector3(x2,y2,0)
    ])
    const mat = new THREE.LineBasicMaterial({color:0x00ff00})
    const line = new THREE.Line(geo,mat)
    if (id) {
      line.name = id;
    }
    this.scene.add(line)
  }

  addCircle(cx:number, cy:number, r:number, id?: string){
    const curve = new THREE.EllipseCurve(cx, cy, r, r, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const circle = new THREE.LineLoop(geo, mat);
    if (id) {
      circle.name = id;
    }
    this.scene.add(circle);
  }

  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean, id?: string) {
    const curve = new THREE.EllipseCurve(cx, cy, r, r, startAngle, endAngle, !ccw, 0);
    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const arc = new THREE.Line(geo, mat);
    if (id) {
      arc.name = id;
    }
    this.scene.add(arc);
  }

  addMesh(geometry: THREE.BufferGeometry, id?: string) {
    const mat = new THREE.MeshStandardMaterial({ 
      color: 0x00ff00,
      metalness: 0.1,
      roughness: 0.5
    });
    const mesh = new THREE.Mesh(geometry, mat);
    if (id) mesh.name = id;
    this.scene.add(mesh);
  }

  pickEntity(clientX: number, clientY: number): string | null {
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 5 / this.camera.zoom }; 

    const mouse = this.getNormalizedDeviceCoordinates(clientX, clientY);

    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObjects(this.scene.children);

    if (intersects.length > 0) {
      return intersects[0].object.name || null;
    }
    return null;
  }


  removeObject(id: string) {
    const obj = this.scene.getObjectByName(id);
    if (obj) {
      this.scene.remove(obj);
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineLoop) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
  }

  moveObject(id: string, dx: number, dy: number) {
    const obj = this.scene.getObjectByName(id);
    if (obj) {
      obj.position.x += dx;
      obj.position.y += dy;
    }
  }

  zoomWindow(p1: {x: number, y: number}, p2: {x: number, y: number}) {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    const width = maxX - minX;
    const height = maxY - minY;

    this.camera.position.set(minX + width / 2, minY + height / 2, 500);

    const rect = this.canvas.getBoundingClientRect();
    const aspect = rect.width / rect.height;
    const boxAspect = width / height;

    if (boxAspect > aspect) {
      this.camera.zoom = rect.width / width;
    } else {
      this.camera.zoom = rect.height / height;
    }

    this.camera.updateProjectionMatrix();
    this.render();
  }


  zoomAll(entities: Entity[]) {
    if (entities.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    entities.forEach(e => {
      if (e instanceof Line) {
        minX = Math.min(minX, e.x1, e.x2);
        maxX = Math.max(maxX, e.x1, e.x2);
        minY = Math.min(minY, e.y1, e.y2);
        maxY = Math.max(maxY, e.y1, e.y2);
      } else if (e instanceof Circle) {
        minX = Math.min(minX, e.cx - e.r);
        maxX = Math.max(maxX, e.cx + e.r);
        minY = Math.min(minY, e.cy - e.r);
        maxY = Math.max(maxY, e.cy + e.r);
      } else if (e instanceof Arc) {
        minX = Math.min(minX, e.cx - e.r);
        maxX = Math.max(maxX, e.cx + e.r);
        minY = Math.min(minY, e.cy - e.r);
        maxY = Math.max(maxY, e.cy + e.r);
      }
    });
    const margin = Math.max(maxX - minX, maxY - minY) * 0.1;
    this.zoomWindow({x: minX - margin, y: minY - margin}, {x: maxX + margin, y: maxY + margin});
  }

  render(){
    this.renderer.render(this.scene,this.camera)
  }
}
