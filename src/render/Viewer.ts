import * as THREE from "three"
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { Entity } from "../core/model/Entity"
import { UnitsConfig } from "../core/model/Document"
import { FormatUtils } from "../core/engine/FormatUtils"
import { Line } from "../core/model/Line"
import { Solid3D } from "../core/model/Solid3D"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"
import { Point } from "../core/model/Point"
import { Polyline } from "../core/model/Polyline"
import { Text } from "../core/model/Text"
import { MText } from "../core/model/MText"
import { Solid } from "../core/model/Solid"
import { Donut } from "../core/model/Donut"
import { Ellipse } from "../core/model/Ellipse"
import { Dimension } from "../core/model/Dimension"
import { Trace } from "../core/model/Trace"
import { Shape } from "../core/model/Shape"
import { Hatch } from "../core/model/Hatch"
import { Insert } from "../core/model/Insert"
import { BlockDefinition } from "../core/model/Block"
import { bulgeToArc, generateHatchLines, clipLineWithPolygon, aciToRgb, getLinetypeSettings, tessellateSpline } from "../core/engine/MathUtils"
import { Spline } from "../core/model/Spline"
import { Note } from "../core/model/Note"
import { SnapPoint, SnapType } from "../core/engine/SnapEngine"
import { PreviewObject, ZoomWindowPreview, SelectionBoxPreview, XMarkerPreview, PLinePointsPreview, RotationPreview, PolylinePreview, SolidPointsPreview, SplinePreview, EntitiesPreview } from "../core/commands/types"
import { GridRenderer } from "./GridRenderer"
import { CursorRenderer } from "./CursorRenderer"

export class Viewer {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  font: InstanceType<typeof Font> | null = null

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
  private gridRenderer: GridRenderer;
  private cursorRenderer: CursorRenderer;
  private textQueue: Text[] = []
  private noteQueue: Note[] = []
  private selectionBox: THREE.Line | null = null
  private shadingMode: 'WIREFRAME' | 'PHONG' = 'WIREFRAME';
  public target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

  constructor(canvas:HTMLCanvasElement){
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.helperGroup);
    this.scene.add(this.boundaryGroup);
    this.scene.add(this.baseLineGroup);

    // Add lights for shading
    const ambientLight = new THREE.AmbientLight(0x666666);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1).normalize();
    this.scene.add(directionalLight);

    this.gridRenderer = new GridRenderer(this.scene);
    
    // Setup Orthographic Camera with dummy bounds, resize() will set them correctly
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10000, 10000)
    
    this.cursorRenderer = new CursorRenderer(this.scene, this.camera);

    this.renderer = new THREE.WebGLRenderer({canvas})
    
    this.resize();
    this.camera.position.set(0, 0, 500);
    this.camera.lookAt(0, 0, 0); 

    this.setupEvents()
    this.loadFont()
  }

  private loadFont() {
    const loader = new TTFLoader();
    loader.load('/fonts/osifont.ttf', (json: object) => {
      this.font = new Font(json);
      this.textQueue.forEach(entity => this.addText(entity));
      this.textQueue = [];
      this.noteQueue.forEach(entity => this.addNote(entity));
      this.noteQueue = [];
      this.scheduleRender();
    });
  }


  setCursor(x: number, y: number, z: number = 0, quaternion?: THREE.Quaternion) {
    this.cursorRenderer.setCursor(x, y, z, quaternion);
    this.scheduleRender();
  }

  setCursorHover(isHovering: boolean, isEdge: boolean = false) {
    this.cursorRenderer.setCursorHover(isHovering, isEdge);
    this.scheduleRender();
  }

  private zPreviewLine: THREE.Line | null = null;

  setZPreviewLine(x: number, y: number, z: number) {
    if (z === 0) {
      if (this.zPreviewLine) {
        this.zPreviewLine.visible = false;
        this.scheduleRender();
      }
      return;
    }

    const points = [
      new THREE.Vector3(x, y, 0),
      new THREE.Vector3(x, y, z)
    ];

    if (!this.zPreviewLine) {
      const material = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, depthWrite: false });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.zPreviewLine = new THREE.Line(geometry, material);
      this.zPreviewLine.renderOrder = 1000;
      this.scene.add(this.zPreviewLine);
    } else {
      this.zPreviewLine.geometry.setFromPoints(points);
      this.zPreviewLine.visible = true;
    }
    this.scheduleRender();
  }

  setActivePointMarker(x: number | null, y: number | null, z: number = 0.1, quaternion?: THREE.Quaternion) {
    this.cursorRenderer.setActivePointMarker(x, y, z, quaternion);
    this.scheduleRender();
  }

  setAxesVisible(visible: boolean) {
    this.gridRenderer.setAxesVisible(visible);
    this.scheduleRender();
  }

  set3DMode(enabled: boolean) {
    if (enabled) {
      // Switch to Isometric view
      const size = (this.camera.top - this.camera.bottom) / 2;
      this.camera.up.set(0, 0, 1); // Z up for 3D
      this.camera.position.set(size, -size, size);
      this.camera.lookAt(0, 0, 0);
    } else {
      // Switch to Top view
      this.camera.up.set(0, 1, 0); // Y up for 2D
      this.camera.position.set(0, 0, 500);
      this.camera.lookAt(0, 0, 0);
    }
    this.camera.updateProjectionMatrix();
    this.scheduleRender();
  }

  setCameraView(view: string) {
    const size = (this.camera.top - this.camera.bottom) / 2 || 500;
    
    switch (view) {
      case 'TOP':
        this.camera.up.set(0, 1, 0);
        this.camera.position.set(0, 0, size * 2);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BOTTOM':
        this.camera.up.set(0, -1, 0);
        this.camera.position.set(0, 0, -size * 2);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'FRONT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, -size * 2, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BACK':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, size * 2, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'LEFT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size * 2, 0, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'RIGHT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size * 2, 0, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'PERSPECTIVE':
      case 'ISOMETRIC':
      case 'ISO':
      case 'PERSPECTIVE_FRONT':
      case 'PERSPECTIVE_TOP':
      case 'PERSPECTIVE_BOTTOM':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size, -size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'PERSPECTIVE_LEFT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size, -size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'PERSPECTIVE_BACK':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size, size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'PERSPECTIVE_RIGHT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size, size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'FRONT_TOP':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, -size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'FRONT_BOTTOM':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, -size, -size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'FRONT_LEFT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size, -size, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'FRONT_RIGHT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size, -size, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BACK_TOP':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, size, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BACK_BOTTOM':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, size, -size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BACK_LEFT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size, size, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'BACK_RIGHT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size, size, 0);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'TOP_LEFT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(-size, 0, size);
        this.camera.lookAt(0, 0, 0);
        break;
      case 'TOP_RIGHT':
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(size, 0, size);
        this.camera.lookAt(0, 0, 0);
        break;
      default:
        console.warn(`Unknown view: ${view}`);
        return;
    }
    
    this.camera.updateProjectionMatrix();
    this.scheduleRender();
  }

  setShadingMode(mode: 'WIREFRAME' | 'PHONG') {
    this.shadingMode = mode;
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.type !== 'Text') {
        const material = obj.material as any;
        const color = material.color;
        if (color) {
          if (mode === 'WIREFRAME') {
            obj.material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, wireframe: true });
          } else {
            obj.material = new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, wireframe: false });
          }
        }
      }
    });
    this.scheduleRender();
  }

  orbit(deltaX: number, deltaY: number) {
    const relPos = this.camera.position.clone().sub(this.target);
    const radius = relPos.length();
    let theta = Math.atan2(relPos.y, relPos.x);
    let phi = Math.acos(relPos.z / radius);
    
    theta -= deltaX * 0.01;
    phi -= deltaY * 0.01;
    
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    
    relPos.x = radius * Math.sin(phi) * Math.cos(theta);
    relPos.y = radius * Math.sin(phi) * Math.sin(theta);
    relPos.z = radius * Math.cos(phi);
    
    this.camera.position.copy(this.target).add(relPos);
    
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.scheduleRender();
  }

  updateGrid(spacing: number, enabled: boolean) {
    this.gridRenderer.updateGrid(spacing, enabled, this.camera.position);
    this.scheduleRender();
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
    
    // Update resolution for all LineMaterials
    this.scene.traverse(obj => {
      const anyObj = obj as any;
      if (anyObj.material && anyObj.material.isLineMaterial) {
        anyObj.material.resolution.set(w, h);
      }
    });
    
    this.scheduleRender();
  }

  public getNormalizedDeviceCoordinates(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    return new THREE.Vector2(
      (x / rect.width) * 2 - 1,
      -(y / rect.height) * 2 + 1
    );
  }

  private createPreviewObject(entity: PreviewObject, previewColor: number, units: UnitsConfig): THREE.Object3D | null {
    let obj: THREE.Object3D | null = null;
    if (entity instanceof Line) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(entity.x1, entity.y1, 0),
        new THREE.Vector3(entity.x2, entity.y2, 0)
      ]);
      const mat = new THREE.LineBasicMaterial({ color: previewColor });
      obj = new THREE.Line(geo, mat);
    } else if (entity instanceof Circle) {
      const curve = new THREE.EllipseCurve(entity.cx, entity.cy, entity.r, entity.r, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(50);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: previewColor });
      obj = new THREE.LineLoop(geo, mat);
    } else if (entity instanceof Arc) {
      const curve = new THREE.EllipseCurve(entity.cx, entity.cy, entity.r, entity.r, entity.startAngle, entity.endAngle, !entity.ccw, 0);
      const points = curve.getPoints(50);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: previewColor });
      obj = new THREE.Line(geo, mat);
    } else if (entity instanceof Point) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(entity.x, entity.y, 0)
      ]);
      const mat = new THREE.PointsMaterial({ color: previewColor, size: 5, sizeAttenuation: false });
      obj = new THREE.Points(geo, mat);
    } else if (entity instanceof Dimension) {
      obj = this.createDimensionObject(entity, units, previewColor);
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
      obj = new THREE.LineSegments(geo, mat);
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
      obj = group;
    } else if ('type' in entity && entity.type === 'selection_box') {
      const b = entity as SelectionBoxPreview;
      const color = b.isCrossing ? 0x00FF00 : 0x0000FF; // Green for crossing, Blue for window
      const mat = new THREE.LineDashedMaterial({
          color: color,
          linewidth: 1,
          scale: 1,
          dashSize: 3 / this.camera.zoom,
          gapSize: 3 / this.camera.zoom,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(b.x1, b.y1, 0),
          new THREE.Vector3(b.x2, b.y1, 0),
          new THREE.Vector3(b.x2, b.y2, 0),
          new THREE.Vector3(b.x1, b.y2, 0),
          new THREE.Vector3(b.x1, b.y1, 0)
      ]);
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      obj = line;
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
      obj = group;
    } else if (entity instanceof Polyline || ('type' in entity && entity.type === 'polyline_preview')) {
        if (entity instanceof Polyline) {
            obj = this.createPolylineObject(entity, previewColor);
        } else {
            const p = entity as PolylinePreview;
            const pline = new Polyline('preview', p.vertices, p.closed);
            obj = this.createPolylineObject(pline, previewColor);
        }
    } else if ('type' in entity && entity.type === 'rotation_preview') {
      const { angle, baseX, baseY } = entity as RotationPreview;
      const radius = 20 / this.camera.zoom;
      const curve = new THREE.EllipseCurve(baseX, baseY, radius, radius, 0, angle, angle < 0, 0);
      const points = curve.getPoints(20);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0x00FFFF });
      obj = new THREE.Line(geo, mat);
    } else if (entity instanceof Text) {
      obj = this.createTextObject(entity.text, entity.height, previewColor, "Arial");
    } else if (entity instanceof Note) {
      obj = this.createNoteObject(entity, previewColor);
    } else if (entity instanceof Spline || ('type' in entity && entity.type === 'spline_preview')) {
      const sp = (entity instanceof Spline) ? entity : (entity as SplinePreview);
      const pts = tessellateSpline(sp.controlPoints, sp.degree, sp.knots);
      const geom = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
      obj = new THREE.Line(geom, new THREE.LineBasicMaterial({ color: previewColor }));
    } else if (entity instanceof Solid) {
      obj = this.createSolidObject(entity, previewColor);
    } else if (entity instanceof Donut) {
      obj = this.createDonutObject(entity.cx, entity.cy, entity.innerRadius, entity.outerRadius, previewColor);
    } else if (entity instanceof Ellipse) {
      obj = this.createEllipseObject(entity.cx, entity.cy, entity.majorX, entity.majorY, entity.ratio, entity.startAngle || 0, entity.endAngle || Math.PI * 2, entity.ccw !== false, previewColor);
    }
    return obj;
  }

  setPreview(entity: PreviewObject | null, units: UnitsConfig = { type: 'decimal', precision: 4, scale: 1.0 }) {
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
      if ('type' in entity && entity.type === 'entities') {
        const group = new THREE.Group();
        for (const e of entity.entities) {
          const obj = this.createPreviewObject(e, previewColor, units);
          if (obj) group.add(obj);
        }
        this.previewObject = group;
      } else {
        this.previewObject = this.createPreviewObject(entity, previewColor, units);
      }

      if (this.previewObject) {
        this.scene.add(this.previewObject);
      }
    }

    this.scheduleRender();
  }

  private createTextObject(text: string, textHeight: number, colorIndex: number, fontName = "Arial"): THREE.Object3D {
    const scale = 20.0; // Use high scale for crispness
    
    // Create a temporary canvas to measure text
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.font = `${textHeight * scale}px ${fontName}`;
    const metrics = tempCtx.measureText(text);
    
    const cw = Math.max(1, metrics.width);
    const ch = Math.max(1, textHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    // Draw text
    ctx.font = `${textHeight * scale}px ${fontName}`;
    ctx.textBaseline = "top";
    const threeColor = new THREE.Color(aciToRgb(colorIndex));
    ctx.fillStyle = threeColor.getStyle(); // Use ACI color
    ctx.fillText(text, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const width = cw / scale;
    const height = ch / scale;
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;

    // Center the mesh inside the group so group origin is text center
    mesh.position.x = 0; // PlaneGeometry is already centered!
    mesh.position.y = 0; // PlaneGeometry is already centered!
    mesh.position.z = 0.2; // Lift above other geometry

    const group = new THREE.Group();
    group.add(mesh);

    return group;
  }

  private createMTextObject(entity: MText, colorIndex: number): THREE.Object3D {
    // Use a higher fixed scale to ensure crisp text regardless of zoom
    let scale = 20.0; 
    let cw = entity.width * scale;
    let ch = entity.height * scale;

    // Safety limit to prevent exceeding browser canvas limits
    const maxDim = 4096;
    if (cw > maxDim || ch > maxDim) {
      const reduction = Math.min(maxDim / cw, maxDim / ch);
      scale *= reduction;
      cw = entity.width * scale;
      ch = entity.height * scale;
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    ctx.scale(scale, scale);
    ctx.clearRect(0, 0, entity.width, entity.height);

    const color = aciToRgb(colorIndex);
    const hexColor = `#${color.toString(16).padStart(6, '0')}`;
    
    ctx.font = `${entity.textHeight}px Arial`;
    ctx.fillStyle = hexColor;
    ctx.textBaseline = "top";

    entity.layoutLines.forEach(line => {
      const canvasX = line.x - entity.bounds.x;
      const canvasY = (entity.bounds.y + entity.height) - line.y;
      ctx.fillText(line.text, canvasX, canvasY);
    });

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const geometry = new THREE.PlaneGeometry(entity.width, entity.height);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.x = entity.bounds.x + entity.width / 2;
    mesh.position.y = entity.bounds.y + entity.height / 2;
    mesh.position.z = (entity as any).elevation || 0;

    if ((entity as any).thickness && (entity as any).thickness !== 0) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, (entity as any).thickness)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: aciToRgb(colorIndex) });
      const line = new THREE.Line(lineGeo, lineMat);
      mesh.add(line);

      // Create duplicate at top
      const topMesh = mesh.clone();
      const lineChild = topMesh.children.find(c => c instanceof THREE.Line);
      if (lineChild) topMesh.remove(lineChild);
      
      topMesh.position.z = ((entity as any).elevation || 0) + (entity as any).thickness;
      
      mesh.userData = { type: 'Text' };
      topMesh.userData = { type: 'Text' };

      const group = new THREE.Group();
      group.add(mesh);
      group.add(topMesh);
      group.rotation.z = entity.rotation;
      return group;
    }

    mesh.userData = { type: 'Text' };
    mesh.rotation.z = entity.rotation;
    return mesh;
  }

  private createSolidObject(entity: Solid, colorIndex: number): THREE.Object3D {
    const color = aciToRgb(colorIndex);
    const shape = new THREE.Shape();
    if (entity.vertices && entity.vertices.length > 0) {
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

  private createPolylineObject(entity: Polyline, colorIndex: number, linetype?: string): THREE.Object3D {
    const color = aciToRgb(colorIndex);
    const group = new THREE.Group();
    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color });
    const thickness = entity.thickness || 0;
    const elevation = entity.elevation || 0;

    const meshMat = this.shadingMode === 'WIREFRAME' 
      ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, wireframe: true })
      : new THREE.MeshPhongMaterial({ color, side: THREE.DoubleSide, wireframe: false });

    for (let i = 0; i < entity.vertices.length - (entity.closed ? 0 : 1); i++) {
      const v1 = entity.vertices[i];
      const v2 = entity.vertices[(i + 1) % entity.vertices.length];

      if (Math.abs(v1.bulge) < 1e-6) {
        // Line segment
        if (thickness !== 0) {
          const dx = v2.x - v1.x;
          const dy = v2.y - v1.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          
          const geo = new THREE.PlaneGeometry(len, Math.abs(thickness));
          geo.rotateX(Math.PI / 2); // Make it vertical (XZ plane)
          geo.rotateZ(angle); // Rotate in XY plane
          geo.translate((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, elevation + thickness / 2);
          
          const mesh = new THREE.Mesh(geo, meshMat);
          mesh.userData = { type: 'Solid3D' };
          group.add(mesh);
        } else if (pattern) {
            const dashed = this.generateDashedPath([{ x: v1.x, y: v1.y }, { x: v2.x, y: v2.y }], pattern);
            dashed.forEach(seg => {
                const geo = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(seg.x1, seg.y1, elevation),
                    new THREE.Vector3(seg.x2, seg.y2, elevation)
                ]);
                group.add(new THREE.Line(geo, material));
            });
        } else {
            const geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(v1.x, v1.y, elevation),
                new THREE.Vector3(v2.x, v2.y, elevation)
            ]);
            group.add(new THREE.Line(geo, material));
        }
      } else {
        // Arc segment
        const arcParams = bulgeToArc(v1, v2, v1.bulge);
        if (arcParams) {
          if (thickness !== 0) {
            const curve = new THREE.EllipseCurve(
              arcParams.cx, arcParams.cy, arcParams.r, arcParams.r,
              arcParams.startAngle, arcParams.endAngle, !arcParams.ccw, 0
            );
            const points = curve.getPoints(20); // 20 segments per arc segment is usually enough

            const vertices: number[] = [];
            const indices: number[] = [];
            
            for (let i = 0; i < points.length - 1; i++) {
              const p1 = points[i];
              const p2 = points[i + 1];
              
              const baseIdx = vertices.length / 3;
              
              // 4 vertices for the quad segment
              vertices.push(p1.x, p1.y, elevation); // 0
              vertices.push(p2.x, p2.y, elevation); // 1
              vertices.push(p2.x, p2.y, elevation + thickness); // 2
              vertices.push(p1.x, p1.y, elevation + thickness); // 3
              
              // 2 triangles for the quad
              indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
              indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            
            const mesh = new THREE.Mesh(geometry, meshMat);
            mesh.userData = { type: 'Solid3D' };
            group.add(mesh);
          } else {
            const curve = new THREE.EllipseCurve(
              arcParams.cx, arcParams.cy, arcParams.r, arcParams.r,
              arcParams.startAngle, arcParams.endAngle, !arcParams.ccw, 0
            );
            const points = curve.getPoints(50);
            
            if (pattern) {
                const dashed = this.generateDashedPath(points, pattern);
                dashed.forEach(seg => {
                    const geo = new THREE.BufferGeometry().setFromPoints([
                        new THREE.Vector3(seg.x1, seg.y1, elevation),
                        new THREE.Vector3(seg.x2, seg.y2, elevation)
                    ]);
                    group.add(new THREE.Line(geo, material));
                });
            } else {
                const pts3d = points.map(p => new THREE.Vector3(p.x, p.y, elevation));
                const geo = new THREE.BufferGeometry().setFromPoints(pts3d);
                group.add(new THREE.Line(geo, material));
            }
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

    this.scheduleRender();
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
    this.scheduleRender();
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
    this.scheduleRender();
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

    this.scheduleRender();
  }

  private setupEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1
      this.camera.zoom *= zoomAmount
      this.camera.updateProjectionMatrix()
      this.scheduleRender()
    }, { passive: false })

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && this.isLeftPanEnabled)) { 
        this.isPanning = true;
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
        this.target.x -= dx / this.camera.zoom
        this.target.y += dy / this.camera.zoom
        this.lastPanPos.set(e.clientX, e.clientY)
        this.scheduleRender()
      }
    })

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button === 1) {
        this.isPanning = false
        this.canvas.releasePointerCapture(e.pointerId)
      }
      if (e.button === 0 && this.isLeftPanEnabled) {
        this.isPanning = false;
        this.isLeftPanEnabled = false;
        this.hasPanned = false;
        this.panEnded = true;
        this.canvas.releasePointerCapture(e.pointerId);
      }
    })
  }

  screenToWorldActual(clientX: number, clientY: number): THREE.Vector3 {
    const mouse = this.getNormalizedDeviceCoordinates(clientX, clientY);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    
    const pos = this.camera.position;
    const absX = Math.abs(pos.x);
    const absY = Math.abs(pos.y);
    const absZ = Math.abs(pos.z);
    
    const plane = new THREE.Plane();
    
    if (absZ > absX && absZ > absY) {
      plane.set(new THREE.Vector3(0, 0, 1), 0); // XY plane
    } else if (absY > absX && absY > absZ) {
      plane.set(new THREE.Vector3(0, 1, 0), 0); // XZ plane
    } else if (absX > absY && absX > absZ) {
      plane.set(new THREE.Vector3(1, 0, 0), 0); // YZ plane
    }
    
    const target = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, target);
    return target;
  }

  screenToWorld(clientX: number, clientY: number): { x: number, y: number, z: number } {
    const target = this.screenToWorldActual(clientX, clientY);
    
    const pos = this.camera.position;
    const absX = Math.abs(pos.x);
    const absY = Math.abs(pos.y);
    const absZ = Math.abs(pos.z);
    
    if (absZ > absX && absZ > absY) {
      // TOP or BOTTOM view
      return { x: target.x, y: target.y, z: target.z };
    } else if (absY > absX && absY > absZ) {
      // FRONT or BACK view
      return { x: target.x, y: target.z, z: target.y };
    } else if (absX > absY && absX > absZ) {
      // LEFT or RIGHT view
      // For LEFT/RIGHT, target.y is world Y, target.z is world Z
      // Map world Y to screen X, world Z to screen Y
      return { x: target.y, y: target.z, z: target.x };
    }
    
    return { x: target.x, y: target.y, z: target.z };
  }

  addLine(x1:number,y1:number,x2:number,y2:number, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string, elevation = 0, thickness = 0){
    const obj = this.createLineObject(x1, y1, x2, y2, color || 7, linetype, elevation, thickness);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addCircle(cx:number, cy:number, r:number, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string, elevation = 0, thickness = 0){
    const obj = this.createCircleObject(cx, cy, r, color || 7, linetype, elevation, thickness);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number, ccw: boolean, id?: string, layer?: string, color?: number, isVisible = true, linetype?: string, elevation = 0, thickness = 0) {
    const obj = this.createArcObject(cx, cy, r, startAngle, endAngle, ccw, color || 7, linetype, elevation, thickness);

    if (id) obj.name = id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addPoint(x: number, y: number, id?: string, layer?: string, color?: number, isVisible = true, elevation = 0, thickness = 0) {
    const size = 2;
    const pts = [
      x - size, y - size, elevation,
      x + size, y + size, elevation,
      x + size, y - size, elevation,
      x - size, y + size, elevation
    ];
    
    if (thickness !== 0) {
      pts.push(
        x, y, elevation,
        x, y, elevation + thickness
      );
    }

    const positions = new Float32Array(pts);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: aciToRgb(color || 7) });
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

  addSolid3D(entity: Solid3D, layer?: string, color?: number, isVisible = true) {
    const obj = this.createSolid3DObject(entity, color || 7);
    if (entity.id) obj.name = entity.id;
    if (layer) obj.userData = { ...obj.userData, layer };
    obj.visible = isVisible;
    
    // Apply entity's persisted position and rotation on top of center
    obj.position.add(new THREE.Vector3(entity.position.x, entity.position.y, entity.position.z));
    const euler = new THREE.Euler(entity.rotation.x, entity.rotation.y, entity.rotation.z);
    obj.quaternion.setFromEuler(euler);
    
    this.scene.add(obj);
  }

  private createSolid3DObject(entity: Solid3D, colorIndex: number): THREE.Object3D {
    const color = aciToRgb(colorIndex);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(entity.positions, 3));
    geometry.setIndex(entity.indices);
    geometry.computeVertexNormals();
    
    // Compute bounding box and center
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    
    // Translate geometry to be centered at (0,0,0) locally
    geometry.translate(-center.x, -center.y, -center.z);
    
    const material = this.shadingMode === 'WIREFRAME' 
      ? new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, wireframe: true })
      : new THREE.MeshPhongMaterial({ 
          color, 
          side: THREE.DoubleSide, 
          wireframe: false,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1
        });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { type: 'Solid3D', faceMapping: entity.faceMapping };
    mesh.name = entity.id;
    
    // Create edges geometry
    let line: THREE.Object3D;
    console.log(`[createSolid3DObject] entity ${entity.id} has edgeLines:`, !!entity.edgeLines, entity.edgeLines?.length);
    if (entity.edgeLines && entity.edgeLines.length > 0) {
      const edgeGroup = new THREE.Group();
      
      for (let edgeIdx = 0; edgeIdx < entity.edgeLines.length; edgeIdx++) {
        const edgePoints = entity.edgeLines[edgeIdx];
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < edgePoints.length; i += 3) {
          pts.push(new THREE.Vector3(edgePoints[i], edgePoints[i+1], edgePoints[i+2]));
        }
        // Translate points to local space (relative to center)
        for (const pt of pts) {
          pt.sub(center);
        }
        
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const radius = 0.15; // Thicker radius in world units (was 0.05)
        
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = pts[i];
          const p2 = pts[i+1];
          const distance = p1.distanceTo(p2);
          if (distance < 0.001) continue;
          
          const cylGeo = new THREE.CylinderGeometry(radius, radius, distance, 6);
          const cyl = new THREE.Mesh(cylGeo, lineMat);
          
          // Position at midpoint
          cyl.position.copy(p1).add(p2).multiplyScalar(0.5);
          
          // Rotate to align with direction
          const direction = p2.clone().sub(p1).normalize();
          cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          
          cyl.userData.edgeIndex = edgeIdx;
          cyl.userData.entityId = entity.id;
          edgeGroup.add(cyl);
        }
      }
      line = edgeGroup;
    } else {
      // Fallback to EdgesGeometry
      const edges = new THREE.EdgesGeometry(geometry, 1);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 }); // Black edges
      line = new THREE.LineSegments(edges, lineMat);
    }
    
    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);
    group.userData = { type: 'Solid3D' };
    
    // Set group position to world center
    group.position.copy(center);
    
    return group;
  }

  highlightFace(entityId: string, faceIndex: number | null) {
    const obj = this.scene.getObjectByName(entityId);
    if (!obj || !(obj instanceof THREE.Group)) return;
    
    // Find the mesh
    const mesh = obj.children.find(c => c instanceof THREE.Mesh) as THREE.Mesh;
    if (!mesh) return;
    
    // Remove existing face highlight if any
    const existingHighlight = obj.getObjectByName('faceHighlight');
    if (existingHighlight) obj.remove(existingHighlight);
    
    if (faceIndex === null) {
      this.scheduleRender();
      return;
    }
    
    const faceMapping = mesh.userData.faceMapping;
    if (!faceMapping) return;
    
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const indices = geometry.getIndex()!.array;
    const positions = geometry.getAttribute('position').array;
    
    const faceIndices: number[] = [];
    for (let i = 0; i < faceMapping.length; i++) {
      if (faceMapping[i] === faceIndex) {
        faceIndices.push(indices[i*3], indices[i*3+1], indices[i*3+2]);
      }
    }
    
    if (faceIndices.length === 0) return;
    
    const faceGeo = new THREE.BufferGeometry();
    faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    faceGeo.setIndex(faceIndices);
    
    // Orange color for face highlight
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xffa500, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.name = 'faceHighlight';
    
    obj.add(faceMesh);
    this.scheduleRender();
  }

  highlightEdge(entityId: string, edgeIndex: number | null) {
    // Find all edge lines belonging to this entity
    const entityEdgeLines: THREE.Object3D[] = [];
    this.scene.traverse(obj => {
      if (obj.userData.entityId === entityId && obj.userData.edgeIndex !== undefined) {
        entityEdgeLines.push(obj);
      }
    });

    if (entityEdgeLines.length === 0) return;

    // Reset all edges to black
    entityEdgeLines.forEach(line => {
      const mat = (line as any).material;
      if (mat && mat.color) {
        mat.color.setHex(0x000000);
        mat.needsUpdate = true;
      }
    });

    // Highlight the specific edge
    if (edgeIndex !== null) {
      const target = entityEdgeLines.find(l => l.userData.edgeIndex === edgeIndex);
      if (target) {
        const mat = (target as any).material;
        if (mat && mat.color) {
          mat.color.setHex(0xffa500); // Orange
          mat.needsUpdate = true;
        }
      }
    }

    this.scheduleRender();
  }

  drawDebugLine(p1: {x:number,y:number,z:number}, p2: {x:number,y:number,z:number}, color: number = 0xffa500) {
    const prev = this.scene.getObjectByName('debugLine');
    if (prev) this.scene.remove(prev);

    const v1 = new THREE.Vector3(p1.x, p1.y, p1.z);
    const v2 = new THREE.Vector3(p2.x, p2.y, p2.z);
    const distance = v1.distanceTo(v2);
    if (distance < 0.001) return;

    const radius = 1.0; // Much thicker radius for large scale
    const geo = new THREE.CylinderGeometry(radius, radius, distance, 6);
    const mat = new THREE.MeshBasicMaterial({ 
      color: color,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const cyl = new THREE.Mesh(geo, mat);
    
    cyl.position.copy(v1).add(v2).multiplyScalar(0.5);
    const direction = v2.clone().sub(v1).normalize();
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    
    cyl.name = 'debugLine';
    this.scene.add(cyl);
    this.scheduleRender();
  }

  addPolyline(entity: Polyline, layer?: string, color?: number, isVisible = true, linetype?: string) {
    const obj = this.createPolylineObject(entity, color || 7, linetype);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }


  addText(entity: Text, layer?: string, color?: number, isVisible = true) {
    const obj = this.createTextObject(entity.text, entity.height, color || 7, "Arial");
    const mesh = obj.children[0] as THREE.Mesh;
    const width = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
    const height = (mesh.geometry as THREE.PlaneGeometry).parameters.height;
    
    // Group origin is center. To place bottom-left at (x,y):
    obj.position.x = entity.x + width / 2;
    obj.position.y = entity.y + height / 2;
    obj.position.z = entity.elevation || 0;
    obj.rotation.z = entity.rotation * (Math.PI / 180);

    if (entity.thickness && entity.thickness !== 0) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, entity.thickness)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: aciToRgb(color || 7) });
      const line = new THREE.Line(lineGeo, lineMat);
      obj.add(line);

      // Create duplicate at top
      const topObj = obj.clone();
      // Remove the line from the top object so we don't have duplicates
      const lineChild = topObj.children.find(c => c instanceof THREE.Line);
      if (lineChild) topObj.remove(lineChild);
      
      topObj.position.z = (entity.elevation || 0) + entity.thickness;
      this.scene.add(topObj);
    }

    obj.name = entity.id;
    obj.userData = { layer, type: 'Text' };
    obj.visible = isVisible;
    this.scene.add(obj);
    this.render();
  }
  
  addMText(entity: MText, layer?: string, color?: number, isVisible = true) {
    const obj = this.createMTextObject(entity, color || 7);
    obj.name = entity.id;
    obj.userData = { layer, type: 'Text' };
    obj.visible = isVisible;
    this.scene.add(obj);
    this.render();
  }

  addSolid(entity: Solid, layer?: string, color?: number, isVisible = true) {
    const obj = this.createSolidObject(entity, color || 7);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addDonut(entity: Donut, layer?: string, color?: number, isVisible = true) {
    const obj = this.createDonutObject(entity.cx, entity.cy, entity.innerRadius, entity.outerRadius, color || 7);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addSpline(entity: Spline, layer?: string, color?: number, isVisible = true, linetype = 'CONTINUOUS') {
    const obj = this.createSplineObject(entity, color || 7, linetype);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addEllipse(entity: Ellipse, layer?: string, color?: number, isVisible = true) {
    const obj = this.createEllipseObject(entity.cx, entity.cy, entity.majorX, entity.majorY, entity.ratio, entity.startAngle, entity.endAngle, entity.ccw, color || 7);
    obj.name = entity.id;
    if (layer) {
      obj.userData = { layer };
    }
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  addDimension(entity: Dimension, units: UnitsConfig, layer?: string, color?: number, isVisible = true) {
    const obj = this.createDimensionObject(entity, units, color || 7);
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

    if (!patternData && entity.pattern.toUpperCase() !== "SOLID") {
      console.warn(`[Viewer] Hatch pattern "${entity.pattern}" not found, falling back to default.`);
    }

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
      const spacing = 8 * entity.patternScale;
      const angle = entity.angle;
      const lines = generateHatchLines(vertices, spacing, angle);

      for (const line of lines) {
        const segments = clipLineWithPolygon(line, entity.boundaryVertices);
        for (const seg of segments) {
          allSegments.push({ x1: seg.p1.x, y1: seg.p1.y, x2: seg.p2.x, y2: seg.p2.y });
        }
      }
    }

    if (allSegments.length === 0 && entity.pattern.toUpperCase() !== "SOLID") {
      console.warn(`[Viewer] Hatch "${entity.id}" (Pattern: ${entity.pattern}) generated no lines. The boundary might be too small for the current pattern scale.`);
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

  private createLineObject(x1: number, y1: number, x2: number, y2: number, color: number, linetype?: string, elevation = 0, thickness = 0): THREE.Object3D {
    if (thickness !== 0) {
      const vertices = new Float32Array([
        x1, y1, elevation,
        x2, y2, elevation,
        x2, y2, elevation + thickness,
        x1, y1, elevation + thickness
      ]);
      const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      geometry.computeVertexNormals();
      
      const material = this.shadingMode === 'WIREFRAME' 
        ? new THREE.MeshBasicMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: true })
        : new THREE.MeshPhongMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: false });
        
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { type: 'Solid3D' };
      return mesh;
    }

    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath([{ x: x1, y: y1 }, { x: x2, y: y2 }], pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, elevation), new THREE.Vector3(seg.x2, seg.y2, elevation)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, elevation), new THREE.Vector3(x2, y2, elevation)]);
        return new THREE.Line(geo, material);
    }
  }

  private createCircleObject(cx: number, cy: number, r: number, color: number, linetype?: string, elevation = 0, thickness = 0): THREE.Object3D {
    if (thickness !== 0) {
      const geometry = new THREE.CylinderGeometry(r, r, Math.abs(thickness), 32, 1, true);
      geometry.rotateX(Math.PI / 2); // Align with Z axis
      geometry.translate(cx, cy, elevation + thickness / 2);
      
      const material = this.shadingMode === 'WIREFRAME' 
        ? new THREE.MeshBasicMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: true })
        : new THREE.MeshPhongMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: false });
        
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { type: 'Solid3D' };
      return mesh;
    }

    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const curve = new THREE.EllipseCurve(cx, cy, r, r, 0, 2 * Math.PI, false, 0);
    const points = curve.getPoints(100);
    const pts3d = points.map(p => new THREE.Vector3(p.x, p.y, elevation));
    
    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath(points, pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, elevation), new THREE.Vector3(seg.x2, seg.y2, elevation)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts3d), material);
    }
  }

  private createArcObject(cx: number, cy: number, r: number, s: number, e: number, ccw: boolean, color: number, linetype?: string, elevation = 0, thickness = 0): THREE.Object3D {
    const curve = new THREE.EllipseCurve(cx, cy, r, r, s, e, !ccw, 0);
    const points = curve.getPoints(50);

    if (thickness !== 0) {
      const vertices: number[] = [];
      const indices: number[] = [];
      
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        
        const baseIdx = vertices.length / 3;
        
        // 4 vertices for the quad segment
        vertices.push(p1.x, p1.y, elevation); // 0
        vertices.push(p2.x, p2.y, elevation); // 1
        vertices.push(p2.x, p2.y, elevation + thickness); // 2
        vertices.push(p1.x, p1.y, elevation + thickness); // 3
        
        // 2 triangles for the quad (DoubleSide will handle culling)
        indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
        indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
      }
      
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      
      const material = this.shadingMode === 'WIREFRAME' 
        ? new THREE.MeshBasicMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: true })
        : new THREE.MeshPhongMaterial({ color: aciToRgb(color), side: THREE.DoubleSide, wireframe: false });
        
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = { type: 'Solid3D' };
      return mesh;
    }

    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    const pts3d = points.map(p => new THREE.Vector3(p.x, p.y, elevation));

    if (pattern) {
        const group = new THREE.Group();
        const dashed = this.generateDashedPath(points, pattern);
        dashed.forEach(seg => {
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, elevation), new THREE.Vector3(seg.x2, seg.y2, elevation)]);
            group.add(new THREE.Line(geo, material));
        });
        return group;
    } else {
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3d), material);
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

  private createSplineObject(entity: Spline, color: number, linetype: string): THREE.Object3D {
    const pts = entity.sampledPoints;
    if (pts.length < 2) return new THREE.Group();

    const pattern = linetype ? getLinetypeSettings(linetype) : null;
    const material = new THREE.LineBasicMaterial({ color: aciToRgb(color) });
    
    if (pattern) {
      const group = new THREE.Group();
      const dashed = this.generateDashedPath(pts, pattern);
      dashed.forEach(seg => {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(seg.x1, seg.y1, 0), new THREE.Vector3(seg.x2, seg.y2, 0)]);
        group.add(new THREE.Line(geo, material));
      });
      return group;
    } else {
      const geometry = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
      return new THREE.Line(geometry, material);
    }
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

  private createDimensionObject(entity: Dimension, units: UnitsConfig, colorIndex: number): THREE.Object3D {
    const color = aciToRgb(colorIndex);
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

    if (entity.type === 'RADIUS') {
      const p1 = { x: entity.x1, y: entity.y1 }; // Center
      const p2 = { x: entity.x2, y: entity.y2 }; // Boundary point
      
      const r = entity.computeValue();
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const ux = r > 1e-6 ? dx / r : 1;
      const uy = r > 1e-6 ? dy / r : 0;
      
      // Line from center to boundary (no extra extension beyond arrow)
      const text = "R" + FormatUtils.formatValue(r, units);
      const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
      const mesh = textMesh.children[0] as THREE.Mesh;
      const textWidth = (mesh.geometry as THREE.PlaneGeometry).parameters.width;

      const lineMat = new THREE.LineBasicMaterial({ color });

      if (!style.DIMTAD) {
        const midDist = r * 0.5;
        const gapHalf = textWidth / 2 + style.gap;
        
        const line1 = [
          new THREE.Vector3(p1.x, p1.y, 0),
          new THREE.Vector3(p1.x + ux * (midDist - gapHalf), p1.y + uy * (midDist - gapHalf), 0)
        ];
        const line2 = [
          new THREE.Vector3(p1.x + ux * (midDist + gapHalf), p1.y + uy * (midDist + gapHalf), 0),
          new THREE.Vector3(p2.x, p2.y, 0)
        ];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line1), lineMat));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line2), lineMat));
      } else {
        const linePoints = [
          new THREE.Vector3(p1.x, p1.y, 0),
          new THREE.Vector3(p2.x, p2.y, 0)
        ];
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), lineMat));
      }
      // Arrow at boundary p2 pointing to object's edge
      const arrowBase = { x: p2.x - ux * arrowSize, y: p2.y - uy * arrowSize };
      const perpX = -uy;
      const perpY = ux;
      const arrowLeft = { x: arrowBase.x + perpX * arrowSize * 0.5, y: arrowBase.y + perpY * arrowSize * 0.5 };
      const arrowRight = { x: arrowBase.x - perpX * arrowSize * 0.5, y: arrowBase.y - perpY * arrowSize * 0.5 };
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(p2.x, p2.y);
      arrowShape.lineTo(arrowLeft.x, arrowLeft.y);
      arrowShape.lineTo(arrowRight.x, arrowRight.y);
      arrowShape.closePath();
      group.add(new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color })));
        
        // Align text with dimension line
        const angle = Math.atan2(uy, ux);
        textMesh.rotation.z = angle;
        
        // Position at 50% of the radius (middle of the line)
        const midDist = r * 0.5;
        const tx = p1.x + ux * midDist;
        const ty = p1.y + uy * midDist;
        
        // Offset text slightly perpendicular to sit "over" the line
        const vOffset = style.DIMTAD === false ? 0 : 1;
        const ox = -uy * vOffset;
        const oy = ux * vOffset;
        
        textMesh.position.set(tx + ox, ty + oy, 0);
        
        group.add(textMesh);
      return group;
    } else if (entity.type === 'DIAMETER') {
      const center = { x: entity.x1, y: entity.y1 };
      const edgePt = { x: entity.x2, y: entity.y2 };
      const click = entity.dimLineLocation || edgePt;
      
      const dx = edgePt.x - center.x;
      const dy = edgePt.y - center.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const diameter = radius * 2;
      
      const ux = radius > 1e-6 ? dx / radius : 1;
      const uy = radius > 1e-6 ? dy / radius : 0;
      
      const oppositePt = { x: center.x - ux * radius, y: center.y - uy * radius };
      
      const text = "Ø" + FormatUtils.formatValue(diameter, units);
      const textWidthApprox = text.length * style.textHeight * 0.75;
      
      const distToClick = Math.sqrt((click.x - center.x)**2 + (click.y - center.y)**2);
      const fitsInside = textWidthApprox < (diameter * 0.75);
      const isInside = (distToClick <= radius) && fitsInside;
      
      const lineMat = new THREE.LineBasicMaterial({ color });
      
      const createArrow = (pt: {x:number, y:number}, dirX: number, dirY: number) => {
        const arrowBase = { x: pt.x + dirX * arrowSize, y: pt.y + dirY * arrowSize };
        const perpX = -dirY;
        const perpY = dirX;
        const arrowLeft = { x: arrowBase.x + perpX * arrowSize * 0.4, y: arrowBase.y + perpY * arrowSize * 0.4 };
        const arrowRight = { x: arrowBase.x - perpX * arrowSize * 0.4, y: arrowBase.y - perpY * arrowSize * 0.4 };
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(pt.x, pt.y);
        arrowShape.lineTo(arrowLeft.x, arrowLeft.y);
        arrowShape.lineTo(arrowRight.x, arrowRight.y);
        arrowShape.closePath();
        group.add(new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color })));
      };

      const isAligned = entity.properties?.textAligned === true;
      const useDogLeg = style.DIMTOH === true || (!isAligned && style.DIMTOH !== false);

      if (isInside) {
        if (style.DIMTAD === false) {
          const midX = (oppositePt.x + edgePt.x) / 2;
          const midY = (oppositePt.y + edgePt.y) / 2;
          const gapHalf = textWidthApprox / 2 + style.gap;
          
          const line1 = [
            new THREE.Vector3(oppositePt.x, oppositePt.y, 0),
            new THREE.Vector3(midX - ux * gapHalf, midY - uy * gapHalf, 0)
          ];
          const line2 = [
            new THREE.Vector3(midX + ux * gapHalf, midY + uy * gapHalf, 0),
            new THREE.Vector3(edgePt.x, edgePt.y, 0)
          ];
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line1), lineMat));
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line2), lineMat));
        } else {
          const linePoints = [
            new THREE.Vector3(oppositePt.x, oppositePt.y, 0),
            new THREE.Vector3(edgePt.x, edgePt.y, 0)
          ];
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), lineMat));
        }
        
        createArrow(edgePt, -ux, -uy);
        createArrow(oppositePt, ux, uy);
        
        const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
        
        let angle = Math.atan2(uy, ux);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        textMesh.rotation.z = angle;
        
        const vOffset = style.DIMTAD === false ? 0 : 1;
        const vox = -Math.sin(angle) * vOffset;
        const voy = Math.cos(angle) * vOffset;
        
        textMesh.position.set(center.x + vox, center.y + voy, 0);
        group.add(textMesh);
      } else {
        const outsideDist = Math.max(distToClick, radius + 5);
        const leaderEnd = { x: center.x + ux * outsideDist, y: center.y + uy * outsideDist };
        
        if (!useDogLeg) {
          const nx = -uy;
          const ny = ux;
          
          const D = (click.x - center.x) * nx + (click.y - center.y) * ny;
          
          const dimLineStart = { x: oppositePt.x + nx * D, y: oppositePt.y + ny * D };
          const dimLineEnd = { x: edgePt.x + nx * D, y: edgePt.y + ny * D };
          
          const overhang = 1.5;
          const signD = D >= 0 ? 1 : -1;
          
          const extLine1 = [
             new THREE.Vector3(oppositePt.x, oppositePt.y, 0),
             new THREE.Vector3(dimLineStart.x + nx * signD * overhang, dimLineStart.y + ny * signD * overhang, 0)
          ];
          const extLine2 = [
             new THREE.Vector3(edgePt.x, edgePt.y, 0),
             new THREE.Vector3(dimLineEnd.x + nx * signD * overhang, dimLineEnd.y + ny * signD * overhang, 0)
          ];
          
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(extLine1), lineMat));
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(extLine2), lineMat));
          
          if (style.DIMTAD === false) {
            const midX = (dimLineStart.x + dimLineEnd.x) / 2;
            const midY = (dimLineStart.y + dimLineEnd.y) / 2;
            const gapHalf = textWidthApprox / 2 + style.gap;
            
            const line1 = [
              new THREE.Vector3(dimLineStart.x, dimLineStart.y, 0),
              new THREE.Vector3(midX - ux * gapHalf, midY - uy * gapHalf, 0)
            ];
            const line2 = [
              new THREE.Vector3(midX + ux * gapHalf, midY + uy * gapHalf, 0),
              new THREE.Vector3(dimLineEnd.x, dimLineEnd.y, 0)
            ];
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line1), lineMat));
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line2), lineMat));
          } else {
            const dimLine = [
               new THREE.Vector3(dimLineStart.x, dimLineStart.y, 0),
               new THREE.Vector3(dimLineEnd.x, dimLineEnd.y, 0)
            ];
            group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dimLine), lineMat));
          }
          
          createArrow(dimLineEnd, ux, uy);
          createArrow(dimLineStart, -ux, -uy);

        const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
        
        let angle = Math.atan2(uy, ux);
        if (angle > Math.PI / 2 || angle <= -Math.PI / 2) angle += Math.PI;
        textMesh.rotation.z = angle;
        
        const midX = (dimLineStart.x + dimLineEnd.x) / 2;
        const midY = (dimLineStart.y + dimLineEnd.y) / 2;
        
        const vOffset = style.DIMTAD === false ? 0 : 1;
        const vox = -Math.sin(angle) * vOffset;
        const voy = Math.cos(angle) * vOffset;
        
        textMesh.position.set(midX + vox, midY + voy, 0);
        group.add(textMesh);
        } else {
          const isRight = leaderEnd.x >= center.x;
          const doglegLength = style.textHeight * 1.5;
          const doglegEnd = { x: leaderEnd.x + (isRight ? doglegLength : -doglegLength), y: leaderEnd.y };
          
          const linePoints = [
            new THREE.Vector3(oppositePt.x, oppositePt.y, 0),
            new THREE.Vector3(edgePt.x, edgePt.y, 0),
            new THREE.Vector3(leaderEnd.x, leaderEnd.y, 0),
            new THREE.Vector3(doglegEnd.x, doglegEnd.y, 0)
          ];
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePoints), lineMat));
          
          createArrow(edgePt, -ux, -uy);
          createArrow(oppositePt, ux, uy);
          
        const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
        const mesh = textMesh.children[0] as THREE.Mesh;
        const width = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
        
        const textGap = 1;
        const tx = isRight ? doglegEnd.x + textGap + width / 2 : doglegEnd.x - textGap - width / 2;
        const ty = doglegEnd.y + 0.5;
        
        textMesh.position.set(tx, ty, 0);
        group.add(textMesh);
        }
      }
      return group;
    } else if (entity.type === 'ANGULAR') {
      const vertex = entity.properties.vertex as { x: number, y: number };
      const dimLoc = entity.dimLineLocation || { x: entity.x1, y: entity.y1 };
      
      const angle1 = Math.atan2(entity.y1 - vertex.y, entity.x1 - vertex.x);
      const angle2 = Math.atan2(entity.y2 - vertex.y, entity.x2 - vertex.x);
      
      const arcRadius = Math.sqrt((dimLoc.x - vertex.x)**2 + (dimLoc.y - vertex.y)**2);
      
      const sA = angle1;
      let eA = angle2;
      
      // Ensure we take the shortest arc or the one that matches the click?
      // For now, consistent ordering
      let diff = eA - sA;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      eA = sA + diff;

      const midA = sA + (eA - sA) * 0.5;
      const deg = Math.abs(diff * 180 / Math.PI);
      const text = deg.toFixed(style.precision) + "°";

      const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
      const mesh = textMesh.children[0] as THREE.Mesh;
      const textWidth = (mesh.geometry as THREE.PlaneGeometry).parameters.width;

      const gapHalf = textWidth / 2 + style.gap;
      const angularGap = gapHalf / arcRadius;

      if (!style.DIMTAD) {
        // Part 1: sA to midA - angularGap
        const arcPoints1: THREE.Vector3[] = [];
        const segments1 = 16;
        for (let i = 0; i <= segments1; i++) {
          const t = i / segments1;
          const a = sA + t * (midA - angularGap - sA);
          arcPoints1.push(new THREE.Vector3(
            vertex.x + Math.cos(a) * arcRadius,
            vertex.y + Math.sin(a) * arcRadius,
            0
          ));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints1), new THREE.LineBasicMaterial({ color })));

        // Part 2: midA + angularGap to eA
        const arcPoints2: THREE.Vector3[] = [];
        const segments2 = 16;
        for (let i = 0; i <= segments2; i++) {
          const t = i / segments2;
          const a = midA + angularGap + t * (eA - (midA + angularGap));
          arcPoints2.push(new THREE.Vector3(
            vertex.x + Math.cos(a) * arcRadius,
            vertex.y + Math.sin(a) * arcRadius,
            0
          ));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints2), new THREE.LineBasicMaterial({ color })));
      } else {
        const arcPoints: THREE.Vector3[] = [];
        const segments = 32;
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const a = sA + t * (eA - sA);
          arcPoints.push(new THREE.Vector3(
            vertex.x + Math.cos(a) * arcRadius,
            vertex.y + Math.sin(a) * arcRadius,
            0
          ));
        }
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPoints), new THREE.LineBasicMaterial({ color })));
      }

      // Arrowheads at both ends
      const addArrowAtAngle = (ang: number, isEnd: boolean) => {
        const p = { x: vertex.x + Math.cos(ang) * arcRadius, y: vertex.y + Math.sin(ang) * arcRadius };
        const tangentAng = ang + (isEnd ? Math.PI / 2 : -Math.PI / 2) * (diff > 0 ? 1 : -1);
        const ux = Math.cos(tangentAng);
        const uy = Math.sin(tangentAng);
        
        const arrowSize = style.arrowSize;
        const arrowBase = { x: p.x - ux * arrowSize, y: p.y - uy * arrowSize };
        const perpX = -uy;
        const perpY = ux;
        const arrowLeft = { x: arrowBase.x + perpX * arrowSize * 0.4, y: arrowBase.y + perpY * arrowSize * 0.4 };
        const arrowRight = { x: arrowBase.x - perpX * arrowSize * 0.4, y: arrowBase.y - perpY * arrowSize * 0.4 };
        
        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(p.x, p.y);
        arrowShape.lineTo(arrowLeft.x, arrowLeft.y);
        arrowShape.lineTo(arrowRight.x, arrowRight.y);
        arrowShape.closePath();
        group.add(new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color })));
      };
      
      addArrowAtAngle(sA, false);
      addArrowAtAngle(eA, true);

      const tx = vertex.x + Math.cos(midA) * (!style.DIMTAD ? arcRadius : arcRadius + style.textHeight + 2);
      const ty = vertex.y + Math.sin(midA) * (!style.DIMTAD ? arcRadius : arcRadius + style.textHeight + 2);
      
      // Rotate text to be readable (tangent to arc)
      let textAng = midA + Math.PI / 2;
      // Keep text upright
      if (textAng > Math.PI / 2 && textAng < 3 * Math.PI / 2) textAng += Math.PI;
      
      textMesh.rotation.z = textAng;
      textMesh.position.set(tx, ty, 0);
      group.add(textMesh);
      
      textPos = { x: vertex.x + Math.cos(midA) * arcRadius, y: vertex.y + Math.sin(midA) * arcRadius };
      return group;
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
      const textOffsetX = style.DIMTAD === false ? 0 : (ux >= 0 ? perpX * gap : -perpX * gap);
      const textOffsetY = style.DIMTAD === false ? 0 : (ux >= 0 ? perpY * gap : -perpY * gap);
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
      const textOffsetX = style.DIMTAD === false ? 0 : (offsetDist > 0 ? -nx * gap : nx * gap);
      const textOffsetY = style.DIMTAD === false ? 0 : (offsetDist > 0 ? -ny * gap : ny * gap);
      textPos = { x: textMidX + textOffsetX, y: textMidY + textOffsetY };
    } else {
      e1 = { x: entity.x1 + nx * offset, y: entity.y1 + ny * offset };
      e2 = { x: entity.x2 + nx * offset, y: entity.y2 + ny * offset };
      const midX = (e1.x + e2.x) / 2;
      const midY = (e1.y + e2.y) / 2;
      textPos = { x: midX + (style.DIMTAD === false ? 0 : nx * gap), y: midY + (style.DIMTAD === false ? 0 : ny * gap) };
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

    let value = entity.computeValue();
    const text = FormatUtils.formatValue(value, units);

    const textMesh = this.createTextObject(text, style.textHeight, colorIndex, "osifont");
    const mesh = textMesh.children[0] as THREE.Mesh;
    const textWidth = (mesh.geometry as THREE.PlaneGeometry).parameters.width;

    if (style.DIMTAD === false) {
      const midX = (e1.x + e2.x) / 2;
      const midY = (e1.y + e2.y) / 2;
      const gapHalf = textWidth / 2 + style.gap;
      
      const line1 = [
        new THREE.Vector3(e1.x, e1.y, 0),
        new THREE.Vector3(midX - ux * gapHalf, midY - uy * gapHalf, 0)
      ];
      const line2 = [
        new THREE.Vector3(midX + ux * gapHalf, midY + uy * gapHalf, 0),
        new THREE.Vector3(e2.x, e2.y, 0)
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line1), extMat));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line2), extMat));
    } else {
      const dimLinePoints = [
        new THREE.Vector3(e1.x, e1.y, 0),
        new THREE.Vector3(e2.x, e2.y, 0)
      ];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(dimLinePoints), extMat));
    }

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

      textMesh.position.set(textPos.x, textPos.y, 0);
      if (entity.type === 'ALIGNED') {
        const textAngle = Math.atan2(uy, ux);
        textMesh.rotation.z = textAngle;
      }
      group.add(textMesh);

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

  moveObject(id: string, dx: number, dy: number, dz: number = 0) {
    const obj = this.scene.getObjectByName(id);
    if (obj) {
      obj.position.x += dx;
      obj.position.y += dy;
      obj.position.z += dz;
    }
  }

  getCenterOfObjects(ids: string[]): THREE.Vector3 | null {
    const box = new THREE.Box3();
    let hasValidObject = false;
    ids.forEach(id => {
      const obj = this.scene.getObjectByName(id);
      if (obj) {
        box.expandByObject(obj);
        hasValidObject = true;
      }
    });
    if (!hasValidObject) return null;
    const center = new THREE.Vector3();
    box.getCenter(center);
    return center;
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
    const highlightColor = 0xddc040; // Neutral Yellow/Gold

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

        const pos = this.camera.position;
        const absX = Math.abs(pos.x);
        const absY = Math.abs(pos.y);
        const absZ = Math.abs(pos.z);

        let pts: THREE.Vector3[] = [];
        if (absY > absX && absY > absZ) {
            // FRONT or BACK (XZ plane)
            pts = [
                new THREE.Vector3(minX, 0, minY),
                new THREE.Vector3(maxX, 0, minY),
                new THREE.Vector3(maxX, 0, maxY),
                new THREE.Vector3(minX, 0, maxY),
                new THREE.Vector3(minX, 0, minY)
            ];
        } else if (absX > absY && absX > absZ) {
            // LEFT or RIGHT (YZ plane)
            pts = [
                new THREE.Vector3(0, minX, minY),
                new THREE.Vector3(0, maxX, minY),
                new THREE.Vector3(0, maxX, maxY),
                new THREE.Vector3(0, minX, maxY),
                new THREE.Vector3(0, minX, minY)
            ];
        } else {
            // TOP or BOTTOM (XY plane)
            pts = [
                new THREE.Vector3(minX, minY, 0),
                new THREE.Vector3(maxX, minY, 0),
                new THREE.Vector3(maxX, maxY, 0),
                new THREE.Vector3(minX, maxY, 0),
                new THREE.Vector3(minX, minY, 0)
            ];
        }
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

  zoomScale(factor: number) {
    this.camera.zoom *= factor;
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
    this.cursorRenderer.setSnapMarker(snap);
    this.render();
  }

  addNote(entity: Note, layer?: string, color?: number, isVisible = true) {
    if (!this.font) {
      this.noteQueue.push(entity);
      return;
    }
    const obj = this.createNoteObject(entity, color || 7);
    if (entity.id) obj.name = entity.id;
    if (layer) obj.userData = { layer };
    obj.visible = isVisible;
    this.scene.add(obj);
  }

  private createNoteObject(entity: Note, colorIndex: number): THREE.Object3D {
    const group = new THREE.Group();
    const color = aciToRgb(colorIndex);
    const mat = new THREE.LineDashedMaterial({
      color,
      dashSize: 0.5,
      gapSize: 0.25
    });

    const p1 = entity.anchorPoint;
    const p2 = entity.bendPoint;
    const isFreePoint = entity.targetEntityId === null;

    let textWidth = 0.5; // Default fallback
    let textMesh: THREE.Object3D | null = null;
    
    const textMeshObj = this.createTextObject(entity.text, entity.height, colorIndex, "osifont");
    const mesh = textMeshObj.children[0] as THREE.Mesh;
    textWidth = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
    textMesh = textMeshObj;

    if (isFreePoint) {
      // Just vertical line at p2 (bendPoint)
      const sepHeight = entity.height;
      const sepPoints = [
        new THREE.Vector3(p2.x, p2.y - entity.height, 0),
        new THREE.Vector3(p2.x, p2.y + sepHeight, 0)
      ];
      const sepGeo = new THREE.BufferGeometry().setFromPoints(sepPoints);
      const sepLine = new THREE.Line(sepGeo, mat);
      sepLine.computeLineDistances();
      group.add(sepLine);

      // Place text
      if (textMesh) {
        const textGap = 0.1;
        const mesh = textMesh.children[0] as THREE.Mesh;
        const width = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
        const height = (mesh.geometry as THREE.PlaneGeometry).parameters.height;
        textMesh.position.set(p2.x + textGap + width / 2, p2.y + height / 2, 0);
        group.add(textMesh);
      }
    } else {
      // Normal note with leader and shelf
      const leaderPoints = [
        new THREE.Vector3(p1.x, p1.y, 0),
        new THREE.Vector3(p2.x, p2.y, 0)
      ];
      const leaderGeo = new THREE.BufferGeometry().setFromPoints(leaderPoints);
      const leaderLine = new THREE.Line(leaderGeo, mat);
      leaderLine.computeLineDistances();
      group.add(leaderLine);

      // Arrowhead at p1 pointing towards p1 (from p2)
      const dir = new THREE.Vector3(p1.x - p2.x, p1.y - p2.y, 0).normalize();
      const arrowSize = entity.height * 0.5;
      const leftWing = new THREE.Vector3()
        .copy(dir)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6)
        .multiplyScalar(-arrowSize)
        .add(new THREE.Vector3(p1.x, p1.y, 0));
      const rightWing = new THREE.Vector3()
        .copy(dir)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 6)
        .multiplyScalar(-arrowSize)
        .add(new THREE.Vector3(p1.x, p1.y, 0));
      
      const arrowShape = new THREE.Shape();
      arrowShape.moveTo(p1.x, p1.y);
      arrowShape.lineTo(leftWing.x, leftWing.y);
      arrowShape.lineTo(rightWing.x, rightWing.y);
      arrowShape.closePath();
      
      const arrowMesh = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color }));
      group.add(arrowMesh);

      // Shelf
      const shelfDir = p2.x >= p1.x ? 1 : -1;
      const shelfLength = Math.max(textWidth, entity.height * 2) + 0.5;
      const shelfEnd = {
        x: p2.x + shelfDir * shelfLength,
        y: p2.y
      };

      const shelfPoints = [
        new THREE.Vector3(p2.x, p2.y, 0),
        new THREE.Vector3(shelfEnd.x, shelfEnd.y, 0)
      ];
      const shelfGeo = new THREE.BufferGeometry().setFromPoints(shelfPoints);
      const shelfLine = new THREE.Line(shelfGeo, mat);
      shelfLine.computeLineDistances();
      group.add(shelfLine);

      // Vertical separator
      const sepHeight = entity.height;
      const sepTop = {
        x: shelfEnd.x,
        y: shelfEnd.y + sepHeight
      };
      const sepPoints = [
        new THREE.Vector3(shelfEnd.x, shelfEnd.y - entity.height, 0),
        new THREE.Vector3(sepTop.x, sepTop.y, 0)
      ];
      const sepGeo = new THREE.BufferGeometry().setFromPoints(sepPoints);
      const sepLine = new THREE.Line(sepGeo, mat);
      group.add(sepLine);

      // Place text
      if (textMesh) {
        const textGap = 0.1;
        const mesh = textMesh.children[0] as THREE.Mesh;
        const width = (mesh.geometry as THREE.PlaneGeometry).parameters.width;
        const height = (mesh.geometry as THREE.PlaneGeometry).parameters.height;
        
        // Align text based on shelf direction
        if (shelfDir > 0) {
          textMesh.position.set(shelfEnd.x + textGap + width / 2, shelfEnd.y + height / 2, 0);
        } else {
          textMesh.position.set(shelfEnd.x - textGap - width / 2, shelfEnd.y + height / 2, 0);
        }
        group.add(textMesh);
      }
    }

    return group;
  }

  private renderRequested = false;

  scheduleRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      requestAnimationFrame(() => {
        this.renderRequested = false;
        this.render();
      });
    }
  }

  public onBeforeRender: () => void = () => {};

  render(){
    this.onBeforeRender();
    this.gridRenderer.updateAxesScale(1 / this.camera.zoom);
    this.renderer.render(this.scene,this.camera)
  }
}
