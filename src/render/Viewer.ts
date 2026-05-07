import * as THREE from "three"
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Entity } from "../core/model/Entity"
import { Line } from "../core/model/Line"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"
import { Point } from "../core/model/Point"
import { Polyline } from "../core/model/Polyline"
import { Text } from "../core/model/Text"
import { Solid } from "../core/model/Solid"
import { Donut } from "../core/model/Donut"
import { Ellipse } from "../core/model/Ellipse"
import { Dimension } from "../core/model/Dimension"
import { Trace } from "../core/model/Trace"
import { Shape } from "../core/model/Shape"
import { Hatch } from "../core/model/Hatch"
import { Insert } from "../core/model/Insert"
import { BlockDefinition } from "../core/model/Block"
import { bulgeToArc, generateHatchLines, clipLineWithPolygon, aciToRgb, getLinetypeSettings } from "../core/engine/MathUtils"
import { SnapPoint, SnapType } from "../core/engine/SnapEngine"
import { PreviewObject, ZoomWindowPreview, XMarkerPreview, PLinePointsPreview, RotationPreview, PolylinePreview, SolidPointsPreview } from "../core/commands/types"

export class Viewer {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  font: Font | null = null

  private isPanning = false
  private isLeftPanEnabled = false
  private hasPanned = false
  private panEnded = false
  private lastPanPos = new THREE.Vector2()
  private panStartX = 0
  private panStartY = 0
  private previewObject: THREE.Object3D | null = null
  private helperGroup: THREE.Group = new THREE.Group()
  private boundaryGroup: THREE.Group = new THREE.Group()
  private baseLineGroup: THREE.Group = new THREE.Group()
  private cursorGroup: THREE.Group = new THREE.Group()
  private snapMarkerGroup: THREE.Group = new THREE.Group()
  private activePointMarkerGroup: THREE.Group = new THREE.Group()
  private gridGroup: THREE.Group = new THREE.Group()
  private textQueue: Text[] = []
  private selectionBox: THREE.Line | null = null

  constructor(canvas:HTMLCanvasElement){
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.helperGroup);
    this.scene.add(this.boundaryGroup);
    this.scene.add(this.baseLineGroup);
    this.scene.add(this.cursorGroup);
    this.scene.add(this.snapMarkerGroup);
    this.scene.add(this.activePointMarkerGroup);
    this.scene.add(this.gridGroup);
    
    this.cursorGroup.renderOrder = 999; // Render on top
    this.snapMarkerGroup.renderOrder = 1000; // Render snap on top of cursor
    this.activePointMarkerGroup.renderOrder = 1001; // Active point marker on very top

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
    loader.load('/fonts/osifont.ttf', (json: object) => {
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

  setActivePointMarker(x: number | null, y: number | null) {
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
      marker.position.set(x, y, 0.1);
      this.activePointMarkerGroup.add(marker);
    }
    this.render();
  }

  updateGrid(spacing: number, enabled: boolean) {
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
    const cx = Math.round(this.camera.position.x / spacing) * spacing;
    const cy = Math.round(this.camera.position.y / spacing) * spacing;

    for (let i = -count; i <= count; i++) {
        for (let j = -count; j <= count; j++) {
            positions.push(cx + i * spacing, cy + j * spacing, -0.5);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x333333, size: 1, sizeAttenuation: false });
    const grid = new THREE.Points(geo, mat);
    this.gridGroup.add(grid);
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

  setPreview(entity: PreviewObject | null) {
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
        this.previewObject = new THREE.Line(entity instanceof Line ? geo : geo, mat);
        this.previewObject = new THREE.Line(geo, mat);
      } else if (entity instanceof Point) {
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(entity.x, entity.y, 0)
        ]);
        const mat = new THREE.PointsMaterial({ color: previewColor, size: 5, sizeAttenuation: false });
        this.previewObject = new THREE.Points(geo, mat);
      } else if (entity instanceof Dimension) {
        this.previewObject = this.createDimensionObject(entity, previewColor);
      } else if ('type' in entity && entity.type === 'xmarker') {
        const m = entity as XMarkerPreview;
        const size = m.size || 10 / this.camera.zoom;
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(m.x - size, m.y - size, 0),
          new THREE.Vector3(m.x + size, m.y + size, 0),
          new THREE.Vector3(m.x - size, m.y + size, 0),
          new THREE.Vector3(m.x + size, m.y - size, 0)
        ]);
        const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        this.previewObject = new THREE.LineSegments(geo, mat);
      } else if ('type' in entity && entity.type === 'zoomwindow') {
        const w = entity as ZoomWindowPreview;
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
      } else if ('type' in entity && (entity.type === 'plinepoints' || entity.type === 'solidpoints')) {
        const p = entity as PLinePointsPreview | SolidPointsPreview;
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
      } else if (entity instanceof Polyline || ('type' in entity && entity.type === 'polyline_preview')) {
          if (entity instanceof Polyline) {
              this.previewObject = this.createPolylineObject(entity, previewColor);
          } else {
              const p = entity as PolylinePreview;
              const pline = new Polyline('preview', p.vertices, p.closed);
              this.previewObject = this.createPolylineObject(pline, previewColor);
          }
      } else if ('type' in entity && entity.type === 'rotation_preview') {
        const { angle, baseX, baseY } = entity as RotationPreview;
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
      } else if (entity instanceof Donut) {
        this.previewObject = this.createDonutObject(entity.cx, entity.cy, entity.innerRadius, entity.outerRadius, previewColor);
      } else if (entity instanceof Ellipse) {
        this.previewObject = this.createEllipseObject(entity.cx, entity.cy, entity.majorX, entity.majorY, entity.ratio, entity.startAngle || 0, entity.endAngle || Math.PI * 2, entity.ccw !== false, previewColor);
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
    
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, mat);
    
    mesh.position.set(entity.x, entity.y, 0);
    mesh.rotation.z = entity.rotation * (Math.PI / 180);
    mesh.renderOrder = 10;

    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    
    const hitBoxGeo = new THREE.PlaneGeometry(width || 0.1, height || 0.1);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
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
    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color });

    for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
      const v1 = entity.vertices[i];
      const v2 = entity.vertices[(i + 1) % entity.vertices.length];

      if (Math.abs(v1.bulge) < 1e-6) {
        // Line segment
        if (pattern) {
            const dashed = this.generateDashedPath([{ x: v1.x, y: v1.y }, { x: v2.x, y: v2.y }], pattern);
            dashed.forEach(seg => {
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(seg.x1, seg.y1, 0),
                    new THREE.Vector3(seg.x2, seg.y2, 0)
                ]);
                group.add(new THREE.Line(geo, material));
            });
        } else {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(v1.x, v1.y, 0),
                new THREE.Vector3(v2.x, v2.y, 0)
            ]);
            group.add(new THREE.Line(geo, material));
        }
      } else {
        // Arc segment
        const arcParams = bulgeToArc(v1, v2, v1.bulge);
        if (arcParams) {
          const curve = new THREE.EllipseCurve(
            arcParams.cx, arcParams.cy, arcParams.r, arcParams.r,
            arcParams.startAngle, arcParams.endAngle, !arcParams.ccw, 0
          );
          const points = curve.getPoints(50);
          
          if (pattern) {
              const dashed = this.generateDashedPath(points, pattern);
              dashed.forEach(seg => {
                  const geo = new THREE.BufferGeometry().setFromPoints([
                      new THREE.Vector3(seg.x1, seg.y1, 0),
                      new THREE.Vector3(seg.x2, seg.y2, 0)
                  ]);
                  group.add(new THREE.Line(geo, material));
              });
          } else {
              const geo = new THREE.BufferGeometry().setFromPoints(points);
              group.add(new THREE.Line(geo, material));
          }
        }
      }
    }
    return group;
  }

  setHelpers(points: { x: number, y: number }[] | null) {
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
      const size = 1000000; 

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

        const xSize = 5 / this.camera.zoom;
        const xPositions = new Float32Array([
          pt.x - xSize, pt.y - xSize, 0,
          pt.x + xSize, pt.y + xSize, 0,
          pt.x - xSize, pt.y + xSize, 0,
          pt.x + xSize, pt.y - xSize, 0
        ]);
        const xGeo = new THREE.BufferGeometry();
        xGeo.setAttribute('position', new THREE.BufferAttribute(xPositions, 3));
        const xMat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
        const xMarker = new THREE.LineSegments(xGeo, xMat);
        this.helperGroup.add(xMarker);
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
      if (e.button === 1 || (e.button === 0 && this.isLeftPanEnabled)) { 
        if (e.button === 0 && this.isLeftPanEnabled && this.hasPanned) {
          this.isLeftPanEnabled = false
          this.isPanning = false
          this.hasPanned = false
          this.panEnded = true
          return
        }
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
        if (this.isLeftPanEnabled) this.hasPanned = true
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
      if (e.button === 0 && this.isLeftPanEnabled) {
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
    const obj = this.createLineObject(x1, y1, x2, y2, color || 7, linetype);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addCircle(cx:number, cy:number, r:number, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string){
    const obj = this.createCircleObject(cx, cy, r, color || 7, linetype);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string) {
    const obj = this.createArcObject(cx, cy, r, startAngle, endAngle, ccw, color || 7, linetype);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
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
      lines.userData = { layer };
    }
    lines.visible = isVisible;
    this.scene.add(lines);
  }

  addPolyline(entity: Polyline, layer?: string, color?: number, isVisible = true, linetype?: string) {
    const obj = this.createPolylineObject(entity, aciToRgb(color), linetype);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
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
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
    this.render();
  }

  addSolid(entity: Solid, layer?: string, color?: number, isVisible = true) {
    const obj = this.createSolidObject(entity, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addDonut(entity: Donut, layer?: string, color?: number, isVisible = true) {
    const obj = this.createDonutObject(entity.cx, entity.cy, entity.innerRadius, entity.outerRadius, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addEllipse(entity: Ellipse, layer?: string, color?: number, isVisible = true) {
    const obj = this.createEllipseObject(entity.cx, entity.cy, entity.majorX, entity.majorY, entity.ratio, entity.startAngle, entity.endAngle, entity.ccw, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addDimension(entity: Dimension, layer?: string, color?: number, isVisible = true) {
    const obj = this.createDimensionObject(entity, aciToRgb(color));
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
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
      mesh.userData = { layer };
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

    for (const seg of entity.segments) {
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
      lines.userData = { layer };
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
              const dashed = this.generateDashedPath([seg.p1, seg.p2], lineDef.dashPattern);
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
      color: aciToRgb(color)
    });

    const mesh = new THREE.LineSegments(geometry, material);
    mesh.position.z = 0.1;
    mesh.renderOrder = 500;
    mesh.name = entity.id;
    if (layer) {
      mesh.userData = { layer };
    }
    mesh.visible = isVisible;
    this.scene.add(mesh);
  }

  addInsert(entity: Insert, block: BlockDefinition, layerProperties: Map<string, {color: number, linetype: string}>, insertLayer: string, isVisible = true) {
    const group = new THREE.Group();
    group.name = entity.id;

    block.entities.forEach(e => {
        let obj: THREE.Object3D | null = null;

        // AutoCAD Logic: 
        // 1. If entity is on Layer "0", it inherits the INSERT's layer properties.
        // 2. Otherwise, it uses its own layer's properties.
        const targetLayerName = (e.layer === "0" || !e.layer) ? insertLayer : e.layer;
        const props = layerProperties.get(targetLayerName) || { color: 7, linetype: "CONTINUOUS" };
        const color = props.color;
        const linetype = props.linetype;

        if (e instanceof Line) {
            obj = this.createLineObject(e.x1 - block.basePoint.x, e.y1 - block.basePoint.y, e.x2 - block.basePoint.x, e.y2 - block.basePoint.y, color, linetype);
        } else if (e instanceof Circle) {
            obj = this.createCircleObject(e.cx - block.basePoint.x, e.cy - block.basePoint.y, e.r, color, linetype);
        } else if (e instanceof Arc) {
            obj = this.createArcObject(e.cx - block.basePoint.x, e.cy - block.basePoint.y, e.r, e.startAngle, e.endAngle, e.ccw, color, linetype);
        } else if (e instanceof Polyline) {
            const shifted = new Polyline(e.id, e.vertices.map(v => ({ ...v, x: v.x - block.basePoint.x, y: v.y - block.basePoint.y })), e.closed);
            obj = this.createPolylineObject(shifted, aciToRgb(color), linetype);
        }

        if (obj) group.add(obj);
    });

    group.position.set(entity.x, entity.y, 0);
    group.scale.set(entity.scaleX, entity.scaleY, 1);
    group.rotation.z = entity.rotation * (Math.PI / 180);

    if (insertLayer) group.userData = { layer: insertLayer };
    group.visible = isVisible;
    this.scene.add(group);
  }

  private createLineObject(x1: number, y1: number, x2: number, y2: number, color: number, linetype?: string): THREE.Object3D {
    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath([{ x: x1, y: y1 }, { x: x2, y: y2 }], pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, 0), new THREE.Vector3(seg.x2, seg.y2, 0)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, 0), new THREE.Vector3(x2, y2, 0)]);
        return new THREE.Line(geo, material);
    }
  }

  private createCircleObject(cx: number, cy: number, r: number, color: number, linetype?: string): THREE.Object3D {
    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const curve = new THREE.EllipseCurve(cx, cy, r, r, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(100);
    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath(points, pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, 0), new THREE.Vector3(seg.x2, seg.y2, 0)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
    }
  }

  private createArcObject(cx: number, cy: number, r: number, s: number, e: number, ccw: boolean, color: number, linetype?: string): THREE.Object3D {
    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const curve = new THREE.EllipseCurve(cx, cy, r, r, s, e, !ccw, 0);
    const points = curve.getPoints(50);
    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath(points, pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, 0), new THREE.Vector3(seg.x2, seg.y2, 0)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    }
  }

  private createDonutObject(cx: number, cy: number, innerR: number, outerR: number, color: number): THREE.Object3D {
    const geometry = innerR > 0 
        ? new THREE.RingGeometry(innerR, outerR, 32)
        : new THREE.CircleGeometry(outerR, 32);
    const material = new THREE.MeshBasicMaterial({ color: aciToRgb(color), side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, 0);
    return mesh;
  }

  private createEllipseObject(cx: number, cy: number, majorX: number, majorY: number, ratio: number, startAngle: number, endAngle: number, ccw: boolean, color: number): THREE.Object3D {
    const majorR = Math.sqrt(majorX**2 + majorY**2);
    const minorR = majorR * ratio;
    const rotation = Math.atan2(majorY, majorX);
    
    const s = startAngle || 0;
    const e = endAngle || Math.PI * 2;
    const isFullEllipse = Math.abs(e - s) >= Math.PI * 1.99;
    
    const curve = new THREE.EllipseCurve(cx, cy, majorR, minorR, s, e, !ccw, rotation);
    const points = curve.getPoints(100);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    
    if (isFullEllipse) {
      return new THREE.LineLoop(geo, mat);
    }
    return new THREE.Line(geo, mat);
  }

  private createDimensionObject(entity: Dimension, color: number): THREE.Object3D {
    const group = new THREE.Group();
    const style = entity.style;
    const arrowSize = style.arrowSize;
    const offset = style.offset;
    const gap = style.gap;

    const dx = entity.x2 - entity.x1;
    const dy = entity.y2 - entity.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return group;

    const ux = dx / len;
    const uy = dy / len;

    const nx = -uy;
    const ny = ux;
    let textPos: { x: number, y: number };
    let e1: { x: number, y: number };
    let e2: { x: number, y: number };

    if (entity.type === 'RADIUS' && entity.dimLineLocation) {
      const leaderPoints = [
        new THREE.Vector3(entity.x1, entity.y1, 0),
        new THREE.Vector3(entity.dimLineLocation.x, entity.dimLineLocation.y, 0)
      ];
      const leaderMat = new THREE.LineBasicMaterial({ color });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leaderPoints), leaderMat));

      const arrowDirX = entity.dimLineLocation.x - entity.x1;
      const arrowDirY = entity.dimLineLocation.y - entity.y1;
      const arrowLen = Math.sqrt(arrowDirX * arrowDirX + arrowDirY * arrowDirY);
      if (arrowLen > 0.1) {
        const ax = arrowDirX / arrowLen;
        const ay = arrowDirY / arrowLen;
        const arrowBase = { x: entity.x1 + ax * arrowSize, y: entity.y1 + ay * arrowSize };
        const perpX = -ay;
        const perpY = ax;
        const arrowLeft = { x: arrowBase.x + perpX * arrowSize * 0.5, y: arrowBase.y + perpY * arrowSize * 0.5 };
        const arrowRight = { x: arrowBase.x - perpX * arrowSize * 0.5, y: arrowBase.y - perpY * arrowSize * 0.5 };
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(entity.x1, entity.y1);
        arrowShape.lineTo(arrowLeft.x, arrowLeft.y);
        arrowShape.lineTo(arrowRight.x, arrowRight.y);
        arrowShape.closePath();
        group.add(new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color })));
      }

      textPos = { x: entity.dimLineLocation.x + 5, y: entity.dimLineLocation.y };
    } else if (entity.type === 'ANGULAR' && entity.properties && entity.properties.vertex && entity.dimLineLocation) {
      const vertex = entity.properties.vertex as { x: number, y: number };
      
      const line1Points = [
        new THREE.Vector3(vertex.x, vertex.y, 0),
        new THREE.Vector3(entity.x1, entity.y1, 0)
      ];
      const line2Points = [
        new THREE.Vector3(vertex.x, vertex.y, 0),
        new THREE.Vector3(entity.x2, entity.y2, 0)
      ];
      const extMat = new THREE.LineBasicMaterial({ color });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line1Points), extMat));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line2Points), extMat));

      const angle1 = Math.atan2(entity.y1 - vertex.y, entity.x1 - vertex.x);
      const angle2 = Math.atan2(entity.y2 - vertex.y, entity.x2 - vertex.x);
      let startAngle = angle1;
      let endAngle = angle2;
      if (endAngle < startAngle) {
        const temp = startAngle;
        startAngle = endAngle;
        endAngle = temp;
      }
      const arcRadius = 15;
      
      const arcPoints: THREE.Vector3[] = [];
      const segments = 32;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = startAngle + t * (endAngle - startAngle);
        arcPoints.push(new THREE.Vector3(
          vertex.x + Math.cos(a) * arcRadius,
          vertex.y + Math.sin(a) * arcRadius,
          0
        ));
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints), extMat));

      textPos = { x: entity.dimLineLocation.x + 5, y: entity.dimLineLocation.y };
    } else if (entity.type === 'ALIGNED' && entity.dimLineLocation) {
      const perpX = -uy;
      const perpY = ux;
      const toDimLineX = entity.dimLineLocation.x - entity.x1;
      const toDimLineY = entity.dimLineLocation.y - entity.y1;
      const offsetDist = toDimLineX * perpX + toDimLineY * perpY;
      
      e1 = { x: entity.x1 + perpX * offsetDist, y: entity.y1 + perpY * offsetDist };
      e2 = { x: entity.x2 + perpX * offsetDist, y: entity.y2 + perpY * offsetDist };
      
      const midX = (e1.x + e2.x) / 2;
      const midY = (e1.y + e2.y) / 2;
      const textOffsetX = ux >= 0 ? perpX * gap : -perpX * gap;
      const textOffsetY = ux >= 0 ? perpY * gap : -perpY * gap;
      textPos = { x: midX + textOffsetX, y: midY + textOffsetY };
    } else if (entity.dimLineLocation) {
      const midX = (entity.x1 + entity.x2) / 2;
      const midY = (entity.y1 + entity.y2) / 2;
      const toDimLineX = entity.dimLineLocation.x - midX;
      const toDimLineY = entity.dimLineLocation.y - midY;
      const offsetDist = toDimLineX * nx + toDimLineY * ny;
      
      e1 = { x: entity.x1 + nx * offsetDist, y: entity.y1 + ny * offsetDist };
      e2 = { x: entity.x2 + nx * offsetDist, y: entity.y2 + ny * offsetDist };
      
      const textMidX = (e1.x + e2.x) / 2;
      const textMidY = (e1.y + e2.y) / 2;
      const textOffsetX = offsetDist > 0 ? -nx * gap : nx * gap;
      const textOffsetY = offsetDist > 0 ? -ny * gap : ny * gap;
      textPos = { x: textMidX + textOffsetX, y: textMidY + textOffsetY };
    } else {
      e1 = { x: entity.x1 + nx * offset, y: entity.y1 + ny * offset };
      e2 = { x: entity.x2 + nx * offset, y: entity.y2 + ny * offset };
      const midX = (e1.x + e2.x) / 2;
      const midY = (e1.y + e2.y) / 2;
      textPos = { x: midX + nx * gap, y: midY + ny * gap };
    }

    const ext1Points = [
      new THREE.Vector3(entity.x1, entity.y1, 0),
      new THREE.Vector3(e1.x, e1.y, 0)
    ];
    const ext2Points = [
      new THREE.Vector3(entity.x2, entity.y2, 0),
      new THREE.Vector3(e2.x, e2.y, 0)
    ];
    const extMat = new THREE.LineBasicMaterial({ color });
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ext1Points), extMat));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ext2Points), extMat));

    const dimLinePoints = [
      new THREE.Vector3(e1.x, e1.y, 0),
      new THREE.Vector3(e2.x, e2.y, 0)
    ];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dimLinePoints), extMat));

    const isVerticalDimLine = Math.abs(e2.x - e1.x) < 0.1;
    const isAligned = entity.type === 'ALIGNED';
    
    let arrow1Dir: { x: number, y: number };
    let arrow2Dir: { x: number, y: number };

    if (isAligned) {
      arrow1Dir = { x: -ux, y: -uy };
      arrow2Dir = { x: ux, y: uy };
    } else if (isVerticalDimLine) {
      const pointUp = e2.y > e1.y;
      arrow1Dir = { x: 0, y: pointUp ? -1 : 1 };
      arrow2Dir = { x: 0, y: pointUp ? 1 : -1 };
    } else {
      const pointRight = e2.x > e1.x;
      arrow1Dir = { x: pointRight ? -1 : 1, y: 0 };
      arrow2Dir = { x: pointRight ? 1 : -1, y: 0 };
    }

    let arrowPerpX: number, arrowPerpY: number;
    if (isAligned) {
      arrowPerpX = -uy;
      arrowPerpY = ux;
    } else if (isVerticalDimLine) {
      arrowPerpX = 1;
      arrowPerpY = 0;
    } else {
      arrowPerpX = 0;
      arrowPerpY = 1;
    }

    const arrow1Base = { x: e1.x - arrow1Dir.x * arrowSize, y: e1.y - arrow1Dir.y * arrowSize };
    const arrow1Left = { x: arrow1Base.x + arrowPerpX * arrowSize * 0.5, y: arrow1Base.y + arrowPerpY * arrowSize * 0.5 };
    const arrow1Right = { x: arrow1Base.x - arrowPerpX * arrowSize * 0.5, y: arrow1Base.y - arrowPerpY * arrowSize * 0.5 };
    const arrow1Shape = new THREE.Shape();
    arrow1Shape.moveTo(e1.x, e1.y);
    arrow1Shape.lineTo(arrow1Left.x, arrow1Left.y);
    arrow1Shape.lineTo(arrow1Right.x, arrow1Right.y);
    arrow1Shape.closePath();
    const arrow1Mesh = new THREE.Mesh(new THREE.ShapeGeometry(arrow1Shape), new THREE.MeshBasicMaterial({ color }));
    group.add(arrow1Mesh);

    const arrow2Base = { x: e2.x - arrow2Dir.x * arrowSize, y: e2.y - arrow2Dir.y * arrowSize };
    const arrow2Left = { x: arrow2Base.x + arrowPerpX * arrowSize * 0.5, y: arrow2Base.y + arrowPerpY * arrowSize * 0.5 };
    const arrow2Right = { x: arrow2Base.x - arrowPerpX * arrowSize * 0.5, y: arrow2Base.y - arrowPerpY * arrowSize * 0.5 };
    const arrow2Shape = new THREE.Shape();
    arrow2Shape.moveTo(e2.x, e2.y);
    arrow2Shape.lineTo(arrow2Left.x, arrow2Left.y);
    arrow2Shape.lineTo(arrow2Right.x, arrow2Right.y);
    arrow2Shape.closePath();
    const arrow2Mesh = new THREE.Mesh(new THREE.ShapeGeometry(arrow2Shape), new THREE.MeshBasicMaterial({ color }));
    group.add(arrow2Mesh);

    let value = entity.computeValue();
    let text: string;
    if (entity.type === 'RADIUS') {
      text = "R" + value.toFixed(style.precision);
    } else if (entity.type === 'ANGULAR' && entity.properties && entity.properties.vertex) {
      const vertex = entity.properties.vertex as { x: number, y: number };
      const angle1 = Math.atan2(entity.y1 - vertex.y, entity.x1 - vertex.x);
      const angle2 = Math.atan2(entity.y2 - vertex.y, entity.x2 - vertex.x);
      let angleDiff = Math.abs(angle2 - angle1) * (180 / Math.PI);
      if (angleDiff > 180) angleDiff = 360 - angleDiff;
      value = angleDiff;
      text = angleDiff.toFixed(style.precision) + "°";
    } else {
      text = value.toFixed(style.precision);
    }

    if (this.font) {
      const shapes = this.font.generateShapes(text, style.textHeight);
      const textGeo = new THREE.ShapeGeometry(shapes);
      const textMat = new THREE.MeshBasicMaterial({ color });
      const textMesh = new THREE.Mesh(textGeo, textMat);
      textMesh.position.set(textPos.x, textPos.y, 0);
      if (entity.type === 'ALIGNED') {
        const textAngle = Math.atan2(uy, ux);
        textMesh.rotation.z = textAngle;
      }
      group.add(textMesh);
    }

    return group;
  }

  private generateDashedPath(
    points: { x: number; y: number }[],
    dashPattern: number[]
  ): { x1: number; y1: number; x2: number; y2: number }[] {
    const results: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (points.length < 2 || dashPattern.length === 0) return [];

    let patternIndex = 0;
    let distanceInCurrentDash = 0;

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const segmentLen = Math.sqrt(dx * dx + dy * dy);
        if (segmentLen === 0) continue;

        const ux = dx / segmentLen;
        const uy = dy / segmentLen;

        let distanceProcessedInSegment = 0;

        while (distanceProcessedInSegment < segmentLen) {
            const currentDashValue = dashPattern[patternIndex % dashPattern.length];
            const currentDashLimit = Math.abs(currentDashValue);
            const remainingInDash = currentDashLimit - distanceInCurrentDash;
            const remainingInSegment = segmentLen - distanceProcessedInSegment;

            const step = Math.min(remainingInDash, remainingInSegment);

            // AutoCAD PAT: Positive = Dash, Zero = Dot, Negative = Gap
            if (currentDashValue > 0) {
                // Dash
                results.push({
                    x1: p1.x + ux * distanceProcessedInSegment,
                    y1: p1.y + uy * distanceProcessedInSegment,
                    x2: p1.x + ux * (distanceProcessedInSegment + step),
                    y2: p1.y + uy * (distanceProcessedInSegment + step)
                });
            } else if (currentDashValue === 0) {
                // Dot (rendered as a tiny dash for visibility)
                const dotX = p1.x + ux * distanceProcessedInSegment;
                const dotY = p1.y + uy * distanceProcessedInSegment;
                results.push({
                    x1: dotX, y1: dotY,
                    x2: dotX + ux * 0.01, y2: dotY + uy * 0.01
                });
                // Force advance since dash limit is 0
                patternIndex++;
                distanceInCurrentDash = 0;
                continue; 
            }
            // Negative values are gaps, we don't push anything

            distanceProcessedInSegment += step;
            distanceInCurrentDash += step;

            if (distanceInCurrentDash >= currentDashLimit - 1e-6) {
                patternIndex++;
                distanceInCurrentDash = 0;
            }
        }
    }

    return results;
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
            child.material.forEach(m => (m as THREE.Material).dispose());
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
          obj.name !== 'baseLineGroup' && obj.name !== 'cursorGroup' && obj.name !== 'gridGroup') {
        toRemove.push(obj);
      }
    });
    for (const obj of toRemove) {
      this.scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineLoop || child instanceof THREE.Points) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => (m as THREE.Material).dispose());
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
        const layerName = (obj.userData as { layer?: string }).layer || "0";
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

    const objectsToProcess: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.name && obj.name !== "PREVIEW" && !obj.name.startsWith("CURSOR")) {
        objectsToProcess.push(obj);
      }
    });

    objectsToProcess.forEach(obj => {
      const isHighlighted = ids.includes(obj.name!);
      
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
      } else if (isHighlighted && (obj as THREE.Mesh).material) {
        if (!this.originalColors.has(obj.name!)) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            if (mat.length > 0 && 'color' in mat[0]) {
              this.originalColors.set(obj.name!, (mat[0] as THREE.MeshBasicMaterial).color.getHex());
            }
          } else if ('color' in mat) {
            this.originalColors.set(obj.name!, (mat as THREE.MeshBasicMaterial).color.getHex());
          }
        }
      }
    });

    objectsToProcess.forEach(obj => {
      const isHighlighted = ids.includes(obj.name!);
      
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
      } else if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        const originalColor = this.originalColors.get(obj.name!);
        
        if (isHighlighted) {
          const targetColor = highlightColor;
          if (Array.isArray(mat)) {
            mat.forEach(m => {
              if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
            });
          } else if ('color' in mat) {
            (mat as THREE.MeshBasicMaterial).color.set(targetColor);
          }
        } else if (originalColor !== undefined) {
          const targetColor = originalColor;
          if (Array.isArray(mat)) {
            mat.forEach(m => {
              if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(targetColor);
            });
          } else if ('color' in mat) {
            (mat as THREE.MeshBasicMaterial).color.set(targetColor);
          }
        }
      }
    });
    this.render();
  }

  clearHighlight() {
    this.scene.traverse((obj) => {
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
      } else if (obj.name && this.originalColors.has(obj.name) && (obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        const originalColor = this.originalColors.get(obj.name)!;
        if (Array.isArray(mat)) {
          mat.forEach(m => {
            if (m && 'color' in m) (m as THREE.MeshBasicMaterial).color.set(originalColor);
          });
        } else if ('color' in mat) {
          (mat as THREE.MeshBasicMaterial).color.set(originalColor);
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
        
        const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
        
        const line = new THREE.Line(geo, mat);
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
      this.hasPanned = false
    }
    if (!enabled) this.isPanning = false
  }

  wasPanEnded(): boolean {
    return this.panEnded
  }

  clearPanEndedFlag() {
    this.panEnded = false
  }

  getPanStartPosition() {
    return { x: this.panStartX, y: this.panStartY }
  }

  isPanningActive() {
    return this.isPanning;
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
    this.render();
  }

  render(){
    this.renderer.render(this.scene,this.camera)
  }
}
