import * as THREE from "three"
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { Entity } from "../core/model/Entity"
import { Line } from "../core/model/Line"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"
import { Point } from "../core/model/Point"
import { Polyline } from "../core/model/Polyline"
import { Text } from "../core/model/Text"
import { bulgeToArc } from "../core/engine/MathUtils"

export class Viewer {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  font: Font | null = null

  private isPanning = false
  private lastPanPos = new THREE.Vector2()
  private previewObject: THREE.Object3D | null = null
  private helperGroup: THREE.Group = new THREE.Group()
  private cursorGroup: THREE.Group = new THREE.Group()
  private textQueue: Text[] = []

  constructor(canvas:HTMLCanvasElement){
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.helperGroup);
    this.scene.add(this.cursorGroup);
    this.cursorGroup.renderOrder = 999; // Render on top

    // Setup Orthographic Camera with dummy bounds, resize() will set them correctly
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1000)
    
    this.renderer = new THREE.WebGLRenderer({canvas})
    
    this.resize()
    this.camera.position.set(this.camera.right, this.camera.top, 500) 

    this.setupEvents()
    this.initCursor()
    this.loadFont()
  }

  private loadFont() {
    const loader = new FontLoader();
    loader.load('/fonts/helvetiker_regular.typeface.json', (font) => {
      this.font = font;
      this.textQueue.forEach(entity => this.addText(entity));
      this.textQueue = [];
      this.render();
    });
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

    const mat = new THREE.LineBasicMaterial({ color: cursorColor });
    this.cursorGroup.add(new THREE.Line(hGeo, mat));
    this.cursorGroup.add(new THREE.Line(vGeo, mat));

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

  setCursor(x: number, y: number) {
    this.cursorGroup.position.set(x, y, 0);
    this.render();
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
      if (this.previewObject instanceof THREE.Line || this.previewObject instanceof THREE.LineLoop || this.previewObject instanceof THREE.Points || this.previewObject instanceof THREE.Group || this.previewObject instanceof THREE.Mesh) {
        this.previewObject.traverse((obj) => {
          if (obj instanceof THREE.Line || obj instanceof THREE.LineLoop || obj instanceof THREE.Points || obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
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
      } else if (entity instanceof Point) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(entity.x, entity.y, 0)
        ]);
        const mat = new THREE.PointsMaterial({ color: previewColor, size: 5, sizeAttenuation: false });
        this.previewObject = new THREE.Points(geo, mat);
      } else if (entity instanceof Polyline) {
        this.previewObject = this.createPolylineObject(entity, previewColor);
      } else if (entity instanceof Text) {
        this.previewObject = this.createTextObject(entity, previewColor);
      }

      if (this.previewObject) {
        this.scene.add(this.previewObject);
      }
    }

    this.render();
  }

  private createTextObject(entity: Text, color: number): THREE.Object3D {
    if (!this.font) return new THREE.Group();

    const shapes = this.font.generateShapes(entity.text, entity.height);
    const geometry = new THREE.ShapeGeometry(shapes);
    
    // AutoCAD text starts at insertion point, Three.js shapes also start at 0,0.
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(entity.x, entity.y, 0);
    mesh.rotation.z = entity.rotation * (Math.PI / 180);
    mesh.renderOrder = 10;

    // Create an invisible hit-box for better picking
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    
    const hitBoxGeo = new THREE.PlaneGeometry(width || 0.1, height || 0.1);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    // Align hitBox to the text (PlaneGeometry is centered, text is from bottom-left)
    hitBox.position.set(width / 2, height / 2, 0);
    mesh.add(hitBox);
    
    return mesh;
  }

  private createPolylineObject(entity: Polyline, color: number): THREE.Object3D {
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color });

    for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
      const v1 = entity.vertices[i];
      const v2 = entity.vertices[(i + 1) % entity.vertices.length];

      if (Math.abs(v1.bulge) < 1e-6) {
        // Line segment
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(v1.x, v1.y, 0),
          new THREE.Vector3(v2.x, v2.y, 0)
        ]);
        group.add(new THREE.Line(geo, mat));
      } else {
        // Arc segment
        const arcParams = bulgeToArc(v1, v2, v1.bulge);
        if (arcParams) {
          const curve = new THREE.EllipseCurve(
            arcParams.cx, arcParams.cy, arcParams.r, arcParams.r,
            arcParams.startAngle, arcParams.endAngle, !arcParams.ccw, 0
          );
          const points = curve.getPoints(20);
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          group.add(new THREE.Line(geo, mat));
        }
      }
    }
    return group;
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
      const size = 1000000; // Infinite-ish

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

  addPoint(x: number, y: number, id?: string) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, y, 0)
    ]);
    const mat = new THREE.PointsMaterial({ color: 0x00ff00, size: 5, sizeAttenuation: false });
    const point = new THREE.Points(geo, mat);
    if (id) {
      point.name = id;
    }
    this.scene.add(point);
  }

  addPolyline(entity: Polyline) {
    const obj = this.createPolylineObject(entity, 0x00ff00);
    obj.name = entity.id;
    this.scene.add(obj);
  }

  addText(entity: Text) {
    if (!this.font) {
      this.textQueue.push(entity);
      return;
    }
    const obj = this.createTextObject(entity, 0x00ff00);
    obj.name = entity.id;
    this.scene.add(obj);
    this.render();
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

  removeObject(id: string) {
    const obj = this.scene.getObjectByName(id);
    if (obj) {
      this.scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.Points) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
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
      const box = e.getBoundingBox();
      minX = Math.min(minX, box.minX);
      maxX = Math.max(maxX, box.maxX);
      minY = Math.min(minY, box.minY);
      maxY = Math.max(maxY, box.maxY);
    });
    
    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const margin = Math.max(width, height) * 0.1 || 10;
    this.zoomWindow({x: minX - margin, y: minY - margin}, {x: maxX + margin, y: maxY + margin});
  }

  render(){
    this.renderer.render(this.scene,this.camera)
  }
}
