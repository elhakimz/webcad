import * as THREE from "three"
import { FontLoader, Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Entity } from "../core/model/Entity"
import { Line } from "../core/model/Line"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"
import { Point } from "../core/model/Point"
import { Polyline } from "../core/model/Polyline"
import { Text } from "../core/model/Text"
import { Solid } from "../core/model/Solid"
import { Trace } from "../core/model/Trace"
import { Shape } from "../core/model/Shape"
import { bulgeToArc, generateHatchLines, clipLineWithPolygon, aciToRgb, getLinetypeSettings } from "../core/engine/MathUtils"
import { SnapPoint, SnapType } from "../core/engine/SnapEngine"

export class Viewer {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  font: Font | null = null

  private isPanning = false
  private isLeftPanEnabled = false
  private lastPanPos = new THREE.Vector2()
  private panStartX = 0
  private panStartY = 0
  private previewObject: THREE.Object3D | null = null
  private helperGroup: THREE.Group = new THREE.Group()
  private boundaryGroup: THREE.Group = new THREE.Group()
  private baseLineGroup: THREE.Group = new THREE.Group()
  private cursorGroup: THREE.Group = new THREE.Group()
  private snapMarkerGroup: THREE.Group = new THREE.Group()
  private persistentMarkerGroup: THREE.Group = new THREE.Group()
  private textQueue: Text[] = []
  private selectionBox: THREE.Line | null = null
  private objects: Map<string, THREE.Object3D> = new Map()

  constructor(canvas:HTMLCanvasElement){
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.helperGroup);
    this.scene.add(this.boundaryGroup);
    this.scene.add(this.baseLineGroup);
    this.scene.add(this.cursorGroup);
    this.scene.add(this.snapMarkerGroup);
    this.cursorGroup.renderOrder = 999; // Render on top
    this.snapMarkerGroup.renderOrder = 1000; // Render snap on top of cursor

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
    const loader = new TTFLoader();
    loader.load('/fonts/osifont.ttf', (json) => {
      this.font = new Font(json);
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
      } else if ((entity as any).type === 'xmarker') {
        const m = entity as { x: number, y: number, size?: number };
        const size = m.size || 10 / this.camera.zoom;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(m.x - size, m.y - size, 0),
          new THREE.Vector3(m.x + size, m.y + size, 0),
          new THREE.Vector3(m.x - size, m.y + size, 0),
          new THREE.Vector3(m.x + size, m.y - size, 0)
        ]);
        const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        this.previewObject = new THREE.LineSegments(geo, mat);
      } else if ((entity as any).type === 'zoomwindow') {
        const w = entity as { x1: number, y1: number, x2: number, y2: number };
        const size = 10 / this.camera.zoom;
        const group = new THREE.Group();
        const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        const createX = (x: number, y: number) => {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x - size, y - size, 0),
            new THREE.Vector3(x + size, y + size, 0),
            new THREE.Vector3(x - size, y + size, 0),
            new THREE.Vector3(x + size, y - size, 0)
          ]);
          group.add(new THREE.LineSegments(geo, mat));
        };
        createX(w.x1, w.y1);
        createX(w.x2, w.y2);
        this.previewObject = group;
      } else if ((entity as any).type === 'plinepoints' || (entity as any).type === 'solidpoints') {
        const p = entity as { points: { x: number, y: number }[] };
        const size = 10 / this.camera.zoom;
        const group = new THREE.Group();
        const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        p.points.forEach(pt => {
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(pt.x - size, pt.y - size, 0),
            new THREE.Vector3(pt.x + size, pt.y + size, 0),
            new THREE.Vector3(pt.x - size, pt.y + size, 0),
            new THREE.Vector3(pt.x + size, pt.y - size, 0)
          ]);
          group.add(new THREE.LineSegments(geo, mat));
        });
        this.previewObject = group;
      } else if (entity instanceof Polyline || (entity as any).type === 'polyline_preview') {
        this.previewObject = this.createPolylineObject(entity as Polyline, previewColor);
      } else if ((entity as any).type === 'rotation_preview') {
        const { angle, baseX, baseY } = entity as any;
        const radius = 20 / this.camera.zoom;
        const curve = new THREE.EllipseCurve(baseX, baseY, radius, radius, 0, angle, angle < 0, 0);
        const points = curve.getPoints(20);
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        this.previewObject = new THREE.Line(geo, mat);
      } else if (entity instanceof Text) {
        this.previewObject = this.createTextObject(entity, previewColor);
      } else if (entity instanceof Solid) {
        this.previewObject = this.createSolidObject(entity, previewColor);
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
    
    // WebCAD text starts at insertion point, Three.js shapes also start at 0,0.
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

  private createSolidObject(entity: Solid, color: number): THREE.Object3D {
    const shape = new THREE.Shape();
    if (entity.vertices.length > 0) {
      shape.moveTo(entity.vertices[0].x, entity.vertices[0].y);
      for (let i = 1; i < entity.vertices.length; i++) {
        shape.lineTo(entity.vertices[i].x, entity.vertices[i].y);
      }
      shape.closePath();
    }

    const geometry = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    return new THREE.Mesh(geometry, mat);
  }

  private createPolylineObject(entity: Polyline, color: number, linetype?: string): THREE.Object3D {
    const group = new THREE.Group();
    const mat = this.getLineMaterial(color, linetype);

    for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
      const v1 = entity.vertices[i];
      const v2 = entity.vertices[(i + 1) % entity.vertices.length];

      if (Math.abs(v1.bulge) < 1e-6) {
        // Line segment
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(v1.x, v1.y, 0),
          new THREE.Vector3(v2.x, v2.y, 0)
        ]);
        const line = new THREE.Line(geo, mat);
        if (mat instanceof THREE.LineDashedMaterial) line.computeLineDistances();
        group.add(line);
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
          const arc = new THREE.Line(geo, mat);
          if (mat instanceof THREE.LineDashedMaterial) arc.computeLineDistances();
          group.add(arc);
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

  addBoundaryMarker(x: number, y: number) {
    const size = 5;
    const positions = new Float32Array([
      x - size, y - size, 0,
      x + size, y + size, 0,
      x + size, y - size, 0,
      x - size, y + size, 0
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff });
    const marker = new THREE.LineSegments(geo, mat);
    this.boundaryGroup.add(marker);
    this.render();
  }

  clearBoundaryMarkers() {
    while (this.boundaryGroup.children.length > 0) {
      const obj = this.boundaryGroup.children[0];
      this.boundaryGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    this.render();
  }

  setBaseLine(p1: { x: number; y: number } | null, p2: { x: number; y: number } | null) {
    while (this.baseLineGroup.children.length > 0) {
      const obj = this.baseLineGroup.children[0];
      this.baseLineGroup.remove(obj);
      if (obj instanceof THREE.Line) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }

    if (p1 && p2) {
      const positions = new Float32Array([p1.x, p1.y, 0, p2.x, p2.y, 0]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({ color: 0x00ffff });
      const line = new THREE.Line(geometry, material);
      this.baseLineGroup.add(line);
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
      if (e.button === 1 || (e.button === 0 && this.isLeftPanEnabled)) { // Middle button or left when enabled
        this.isPanning = true
        this.lastPanPos.set(e.clientX, e.clientY)
        if (this.isLeftPanEnabled) {
          this.panStartX = this.camera.position.x
          this.panStartY = this.camera.position.y
        }
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

  addLine(x1:number,y1:number,x2:number,y2:number, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string){
    const rgb = aciToRgb(color);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1,y1,0),
      new THREE.Vector3(x2,y2,0)
    ])
    
    const mat = this.getLineMaterial(rgb, linetype);
    const line = new THREE.Line(geo, mat)
    if (mat instanceof THREE.LineDashedMaterial) line.computeLineDistances();

    if (id) {
      line.name = id;
    }
    if (layer) {
      (line as any).userData = { layer };
    }
    line.visible = isVisible;
    this.scene.add(line)
  }

  addCircle(cx:number, cy:number, r:number, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string){
    const curve = new THREE.EllipseCurve(cx, cy, r, r, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const rgb = aciToRgb(color);

    const mat = this.getLineMaterial(rgb, linetype);
    const circle = new THREE.LineLoop(geo, mat);
    if (mat instanceof THREE.LineDashedMaterial) circle.computeLineDistances();

    if (id) {
      circle.name = id;
    }
    if (layer) {
      (circle as any).userData = { layer };
    }
    circle.visible = isVisible;
    this.scene.add(circle);
  }

  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string) {
    const curve = new THREE.EllipseCurve(cx, cy, r, r, startAngle, endAngle, !ccw, 0);
    const points = curve.getPoints(50);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const rgb = aciToRgb(color);

    const mat = this.getLineMaterial(rgb, linetype);
    const arc = new THREE.Line(geo, mat);
    if (mat instanceof THREE.LineDashedMaterial) arc.computeLineDistances();

    if (id) {
      arc.name = id;
    }
    if (layer) {
      (arc as any).userData = { layer };
    }
    arc.visible = isVisible;
    this.scene.add(arc);
  }

  addPoint(x: number, y: number, id?: string, layer?: string, color?: number, isVisible = true) {
    const size = 2;
    const positions = new Float32Array([
      x - size, y - size, 0,
      x + size, y + size, 0,
      x + size, y - size, 0,
      x - size, y + size, 0
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const lines = new THREE.LineSegments(geo, mat);
    if (id) {
      lines.name = id;
    }
    if (layer) {
      (lines as any).userData = { layer };
    }
    lines.visible = isVisible;
    this.scene.add(lines);
  }

  addPolyline(entity: Polyline, layer?: string, color?: number, isVisible = true, linetype?: string) {
    const obj = this.createPolylineObject(entity, aciToRgb(color), linetype);
    obj.name = entity.id;
    if (layer) {
      (obj as any).userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }


  addText(entity: Text, layer?: string, color?: number, isVisible = true) {
    if (!this.font) {
      this.textQueue.push(entity);
      return;
    }
    const obj = this.createTextObject(entity, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      (obj as any).userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
    this.render();
  }

  addSolid(entity: Solid, layer?: string, color?: number, isVisible = true) {
    const obj = this.createSolidObject(entity, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      (obj as any).userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addTrace(entity: Trace, layer?: string, color?: number, isVisible = true) {
    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) return;

    const ux = dx / len;
    const uy = dy / len;

    const halfW = entity.width / 2;
    const px = -uy * halfW;
    const py = ux * halfW;

    const vertices = new Float32Array([
      entity.x1 + px, entity.y1 + py, 0,
      entity.x2 + px, entity.y2 + py, 0,
      entity.x2 - px, entity.y2 - py, 0,
      entity.x1 - px, entity.y1 - py, 0
    ]);

    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    const material = new THREE.MeshBasicMaterial({ color: aciToRgb(color), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = entity.id;
    if (layer) {
      (mesh as any).userData = { layer };
    }
    mesh.visible = isVisible;
    this.scene.add(mesh);
  }

  addShape(entity: Shape, layer?: string, color?: number, isVisible = true) {
    if (entity.segments.length === 0) return;

    const positions: number[] = [];
    const rad = (entity.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (const seg of entity.segments as { x1: number; y1: number; x2: number; y2: number; isArc?: boolean; cx?: number; cy?: number; r?: number; startAngle?: number; endAngle?: number }[]) {
      if (seg.isArc && seg.cx !== undefined && seg.cy !== undefined && seg.r !== undefined && seg.startAngle !== undefined && seg.endAngle !== undefined) {
        const arcPositions = this.createArcGeometry(seg.cx, seg.cy, seg.r, seg.startAngle, seg.endAngle);
        for (const p of arcPositions) {
          const sx = p.x * entity.shapeScale;
          const sy = p.y * entity.shapeScale;
          const rx = sx * cos - sy * sin + entity.x;
          const ry = sx * sin + sy * cos + entity.y;
          positions.push(rx, ry, 0);
        }
      } else {
        const sx1 = seg.x1 * entity.shapeScale;
        const sy1 = seg.y1 * entity.shapeScale;
        const sx2 = seg.x2 * entity.shapeScale;
        const sy2 = seg.y2 * entity.shapeScale;

        const rx1 = sx1 * cos - sy1 * sin + entity.x;
        const ry1 = sx1 * sin + sy1 * cos + entity.y;
        const rx2 = sx2 * cos - sy2 * sin + entity.x;
        const ry2 = sx2 * sin + sy2 * cos + entity.y;

        positions.push(rx1, ry1, 0, rx2, ry2, 0);
      }
    }

    if (positions.length === 0) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = entity.id;
    if (layer) {
      (lines as any).userData = { layer };
    }
    lines.visible = isVisible;
    this.scene.add(lines);
  }

  private createArcGeometry(cx: number, cy: number, r: number, startAngle: number, endAngle: number): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const segments = 16;

    points.push({ x: cx + r * Math.cos(startAngle), y: cy + r * Math.sin(startAngle) });

    for (let i = 1; i <= segments; i++) {
      const angle = startAngle + (endAngle - startAngle) * i / segments;
      points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }

    return points;
  }

  addHatch(entity: Hatch, layer?: string, color?: number, isVisible = true) {
    if (entity.boundaryVertices.length < 3) return;

    const patternData = entity.getPatternData();
    const allSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const vertices = entity.boundaryVertices;

    if (patternData && patternData.lines.length > 0) {
      for (const lineDef of patternData.lines) {
        const effectiveAngle = lineDef.angle + entity.angle;
        const spacing = lineDef.spacing * entity.patternScale;
        const offsetX = lineDef.offset[0];
        const offsetY = lineDef.offset[1];
        const lines = generateHatchLines(vertices, spacing, effectiveAngle, offsetX, offsetY);

        for (const line of lines) {
          const segments = clipLineWithPolygon(line, entity.boundaryVertices);
          for (const seg of segments) {
            if (lineDef.dashPattern.length === 0) {
              allSegments.push({ x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y });
            } else {
              const dashed = this.generateDashedLine(seg.p1, seg.p2, lineDef.dashPattern);
              allSegments.push(...dashed);
            }
          }
        }
      }
    } else {
      const spacing = 8 / entity.patternScale;
      const angle = entity.angle;
      const lines = generateHatchLines(vertices, spacing, angle);

      for (const line of lines) {
        const segments = clipLineWithPolygon(line, entity.boundaryVertices);
        for (const seg of segments) {
          allSegments.push({ x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y });
        }
      }
    }

    if (allSegments.length === 0) return;

    const positions: number[] = [];
    for (const seg of allSegments) {
      positions.push(seg.x1, seg.y1, 0);
      positions.push(seg.x2, seg.y2, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: aciToRgb(color),
      linewidth: 1
    });

    const mesh = new THREE.LineSegments(geometry, material);
    mesh.position.z = 0.1;
    mesh.renderOrder = 500;
    mesh.name = entity.id;
    if (layer) {
      (mesh as any).userData = { layer };
    }
    mesh.visible = isVisible;
    this.scene.add(mesh);
  }

  private generateDashedLine(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    dashPattern: number[]
  ): { x1: number; y1: number; x2: number; y2: number }[] {
    const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0 || dashPattern.length === 0) {
      segments.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      return segments;
    }

    const ux = dx / len;
    const uy = dy / len;

    let current = 0;
    let dashIndex = 0;
    let startOffset = 0;

    while (current < len) {
      const dashLen = Math.abs(dashPattern[dashIndex % dashPattern.length]);
      const gapLen = Math.abs(dashPattern[(dashIndex + 1) % dashPattern.length]);

      if (dashPattern[dashIndex % dashPattern.length] > 0) {
        const segStart = current + startOffset;
        const segEnd = Math.min(current + dashLen, len);

        if (segEnd > segStart) {
          segments.push({
            x1: p1.x + ux * segStart,
            y1: p1.y + uy * segStart,
            x2: p1.x + ux * segEnd,
            y2: p1.y + uy * segEnd
          });
        }
      }

      current += dashLen + gapLen;
      dashIndex += 2;
      startOffset = 0;
    }

    return segments;
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

  clear() {
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.name && obj.name !== 'helperGroup' && obj.name !== 'boundaryGroup' && 
          obj.name !== 'baseLineGroup' && obj.name !== 'cursorGroup' && obj.name !== 'persistentMarkerGroup') {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
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

  updateLayerVisibility(layerMap: Map<string, { isVisible: boolean, isFrozen: boolean }>) {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || 
          obj instanceof THREE.LineLoop || obj instanceof THREE.Points) {
        const layerName = (obj as any).userData?.layer || "0";
        const layerInfo = layerMap.get(layerName);
        if (layerInfo) {
          obj.visible = layerInfo.isVisible && !layerInfo.isFrozen;
        }
      }
    });
    this.render();
  }

  private originalColors: Map<string, number> = new Map();

  setHighlight(ids: string[]) {
    const highlightColor = 0xffff00; // Yellow

    // Collect all objects to process
    const objectsToProcess: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.name && obj.name !== "PREVIEW" && !obj.name.startsWith("CURSOR")) {
        objectsToProcess.push(obj);
      }
    });

    // First pass: capture current colors for highlighted items (including Group children)
    objectsToProcess.forEach(obj => {
      const isHighlighted = ids.includes(obj.name!);
      
      // Handle Groups - capture colors from all children
      if (isHighlighted && obj instanceof THREE.Group) {
        obj.traverse((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.Mesh) {
            const childName = obj.name + '_' + child.uuid;
            if (!this.originalColors.has(childName) && child.material) {
              if (Array.isArray(child.material)) {
                if (child.material.length > 0 && 'color' in child.material[0]) {
                  this.originalColors.set(childName, (child.material[0] as THREE.MeshBasicMaterial).color.getHex());
                }
              } else if ('color' in child.material) {
                this.originalColors.set(childName, (child.material as THREE.MeshBasicMaterial).color.getHex());
              }
            }
          }
        });
      } else if (isHighlighted && obj.material) {
        // Handle regular objects
        if (!this.originalColors.has(obj.name)) {
          if (Array.isArray(obj.material)) {
            if (obj.material.length > 0 && 'color' in obj.material[0]) {
              this.originalColors.set(obj.name, (obj.material[0] as THREE.MeshBasicMaterial).color.getHex());
            }
          } else if ('color' in obj.material) {
            this.originalColors.set(obj.name, (obj.material as THREE.MeshBasicMaterial).color.getHex());
          }
        }
      }
    });

    // Second pass: apply highlight or restore original color
    objectsToProcess.forEach(obj => {
      const isHighlighted = ids.includes(obj.name!);
      
      // Handle Groups - apply highlight to all children
      if (obj instanceof THREE.Group) {
        obj.traverse((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.Mesh) {
            const childName = obj.name + '_' + child.uuid;
            const originalColor = this.originalColors.get(childName);
            
            if (isHighlighted) {
              const targetColor = highlightColor;
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => {
                    if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
                  });
                } else if ('color' in child.material) {
                  (child.material as THREE.MeshBasicMaterial).color.set(targetColor);
                }
              }
            } else if (originalColor !== undefined) {
              const targetColor = originalColor;
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => {
                    if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
                  });
                } else if ('color' in child.material) {
                  (child.material as THREE.MeshBasicMaterial).color.set(targetColor);
                }
              }
            }
          }
        });
      } else if (obj.material) {
        // Handle regular objects
        const originalColor = this.originalColors.get(obj.name!);
        
        if (isHighlighted) {
          const targetColor = highlightColor;
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
              if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
            });
          } else if ('color' in obj.material) {
            (obj.material as THREE.MeshBasicMaterial).color.set(targetColor);
          }
        } else if (originalColor !== undefined) {
          const targetColor = originalColor;
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => {
              if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
            });
          } else if ('color' in obj.material) {
            (obj.material as THREE.MeshBasicMaterial).color.set(targetColor);
          }
        }
      }
    });
    this.render();
  }

  clearHighlight() {
    // Restore original colors
    this.scene.traverse((obj) => {
      // Handle Groups - restore colors to all children
      if (obj instanceof THREE.Group) {
        obj.traverse((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.Mesh) {
            const childName = obj.name + '_' + child.uuid;
            if (this.originalColors.has(childName) && child.material) {
              const originalColor = this.originalColors.get(childName)!;
              if (Array.isArray(child.material)) {
                child.material.forEach(m => {
                  if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(originalColor);
                });
              } else if ('color' in child.material) {
                (child.material as THREE.MeshBasicMaterial).color.set(originalColor);
              }
            }
          }
        });
      } else if (obj.name && this.originalColors.has(obj.name) && obj.material) {
        // Handle regular objects
        const originalColor = this.originalColors.get(obj.name)!;
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => {
            if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(originalColor);
          });
        } else if ('color' in obj.material) {
          (obj.material as THREE.MeshBasicMaterial).color.set(originalColor);
        }
      }
    });
    this.originalColors.clear();
    this.render();
  }

  setSelectionBox(p1: {x: number, y: number} | null, p2?: {x: number, y: number}) {
    if (this.selectionBox) {
        this.scene.remove(this.selectionBox);
        this.selectionBox.geometry.dispose();
        (this.selectionBox.material as THREE.Material).dispose();
        this.selectionBox = null;
    }

    if (p1 && p2) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);

        const pts = [
            new THREE.Vector3(minX, minY, 0),
            new THREE.Vector3(maxX, minY, 0),
            new THREE.Vector3(maxX, maxY, 0),
            new THREE.Vector3(minX, maxY, 0),
            new THREE.Vector3(minX, minY, 0)
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        
        const mat = new THREE.LineDashedMaterial({ 
            color: 0xffff00, 
            dashSize: 5, 
            gapSize: 3,
            transparent: true, 
            opacity: 0.8 
        });
        
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        line.renderOrder = 1000;
        
        this.selectionBox = line;
        this.scene.add(this.selectionBox);
    }
    this.render();
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

  setLeftPanEnabled(enabled: boolean) {
    this.isLeftPanEnabled = enabled
    if (enabled) {
      this.panStartX = this.camera.position.x
      this.panStartY = this.camera.position.y
    }
    if (!enabled) this.isPanning = false
  }

  getPanStartPosition() {
    return { x: this.panStartX, y: this.panStartY }
  }

  setPanStartPosition(x: number, y: number) {
    this.panStartX = x
    this.panStartY = y
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
      const color = 0xffff00; // Yellow for snaps
      const size = 6 / this.camera.zoom;
      let geo: THREE.BufferGeometry | null = null;
      let mat = new THREE.LineBasicMaterial({ color });
      let mesh: THREE.Object3D | null = null;

      switch (snap.type) {
        case SnapType.ENDPOINT:
          // Square
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
          // Triangle
          geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, size, 0),
            new THREE.Vector3(-size, -size, 0),
            new THREE.Vector3(size, -size, 0),
            new THREE.Vector3(0, size, 0)
          ]);
          mesh = new THREE.Line(geo, mat);
          break;
        case SnapType.CENTER:
          // Circle
          const curve = new THREE.EllipseCurve(0, 0, size, size, 0, 2 * Math.PI, false, 0);
          const points = curve.getPoints(16);
          geo = new THREE.BufferGeometry().setFromPoints(points);
          mesh = new THREE.LineLoop(geo, mat);
          break;
      }

      if (mesh) {
        mesh.position.set(snap.x, snap.y, 0);
        this.snapMarkerGroup.add(mesh);
      }
    }
    this.render();
  }

  render(){
    this.renderer.render(this.scene,this.camera)
  }

  private getLineMaterial(color: number, linetype?: string): THREE.LineBasicMaterial {
    const dashSettings = linetype ? getLinetypeSettings(linetype) : null;
    if (dashSettings) {
      return new THREE.LineDashedMaterial({ 
        color, 
        dashSize: dashSettings.dashSize / this.camera.zoom, 
        gapSize: dashSettings.gapSize / this.camera.zoom 
      });
    }
    return new THREE.LineBasicMaterial({ color });
  }
}
