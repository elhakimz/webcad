import * as THREE from "three";
import type { App } from "../app";
import type { Viewer } from "../render/Viewer";
import type { Entity } from "../core/model/Entity";
import { Solid3D } from "../core/model/Solid3D";
import { Arc } from "../core/model/Arc";
import { Circle } from "../core/model/Circle";
import { Dimension } from "../core/model/Dimension";
import { Donut } from "../core/model/Donut";
import { Ellipse } from "../core/model/Ellipse";
import { Hatch } from "../core/model/Hatch";
import { ImagePlane } from "../core/model/ImagePlane";
import { Insert } from "../core/model/Insert";
import { Line } from "../core/model/Line";
import { MText } from "../core/model/MText";
import { Note } from "../core/model/Note";
import { Point } from "../core/model/Point";
import { Polyline } from "../core/model/Polyline";
import { Shape } from "../core/model/Shape";
import { Solid } from "../core/model/Solid";
import { Spline } from "../core/model/Spline";
import { Text } from "../core/model/Text";
import { Trace } from "../core/model/Trace";
import { Selection3DEngine } from "../core/engine/Selection3DEngine";
import { SelectionEngine } from "../core/engine/SelectionEngine";
import { OpenCascadeService } from "../core/io/OpenCascadeService";

/**
 * In-app test bridge (WEBCAD-156).
 *
 * The viewport is one <canvas>; a test driver outside the page can see pixels and
 * nothing else. This exposes the state the renderer already has — camera, scene
 * graph, selection, snap — as a semantic API on `window.__webcadTest`, so a test
 * asks "which face is selected?" instead of comparing screenshots.
 *
 * Everything here reads or calls into the existing managers. No geometry, picking,
 * or selection logic is reimplemented: if the bridge and the UI disagree, that is a
 * bug in the bridge.
 *
 * Enabled in dev builds, or in any build via `?testBridge=1`.
 */

export type Vec3 = [number, number, number];

export type ViewPreset =
  | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'
  | 'iso' | 'isometric' | 'orthogonal' | 'perspective';

export type SelectMode = 'replace' | 'add' | 'toggle';

/** What backend `createRenderer()` settled on, and why (WEBCAD-170). */
export interface RendererInfo {
  kind: string;
  requested: string;
  /** True when the requested backend could not be honoured — the assertion that matters. */
  fellBack: boolean;
  reason: string;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  /** Always null: the renderer uses a single OrthographicCamera, which has no field of view. */
  fov: number | null;
  zoom: number;
  projection: 'ortho' | 'persp';
  viewPreset: string;
  /** False in plain views (TOP/FRONT/...), where the camera angle is locked. */
  canOrbit: boolean;
}

export interface ScreenPoint {
  /** Pixels relative to the canvas bounding rect. */
  x: number;
  y: number;
  /** Viewport pixels — what `page.mouse.click()` expects. */
  clientX: number;
  clientY: number;
  /** False when the point projects outside the canvas or behind the camera. */
  onScreen: boolean;
}

export interface ObjectSummary {
  id: string;
  type: string;
  name: string;
  visible: boolean;
  layer: string;
}

export interface Box3 {
  min: Vec3;
  max: Vec3;
}

export interface ObjectDetail extends ObjectSummary {
  transform: { position: Vec3 };
  bbox: Box3 | null;
  /** Sub-entity counts. Present for solids only. */
  vertices?: number;
  edges?: number;
  faces?: number;
  /** Solids only: feature history and the size of the kernel snapshot. */
  features?: string[];
  brepBytes?: number | null;
}

export interface ValidityReport {
  id: string;
  /**
   * Whether the OCC worker currently holds a shape for this solid at all.
   *
   * False is a real finding, not a precondition failure: it means the document has a
   * solid the kernel cannot operate on, so the next boolean or fillet would fail.
   */
  inKernel: boolean;
  /** BRepCheck_Analyzer's verdict. Null when the shape is not in the kernel. */
  isValid: boolean | null;
  /** Faces the kernel counts by exploring the shape. Null when not in the kernel. */
  faceCount: number | null;
  /** Faces in the tessellated model the viewport draws from. */
  modelFaceCount: number;
  /**
   * Whether the kernel and the model agree on face count.
   *
   * They are two separate representations — the B-rep in the worker and the triangle
   * soup in the document — and they drift independently. A mismatch means the
   * viewport is showing something the kernel no longer believes in, which is the
   * failure mode behind the B-rep restore work (#20 / #138).
   */
  faceCountMatches: boolean;
  /** The kernel's explanation when it rejects the shape; empty when it is happy. */
  errorMsg: string;
}

export interface VertexInfo { id: string; position: Vec3 }
export interface EdgeInfo { id: string; startVertexId: string | null; endVertexId: string | null; start: Vec3; end: Vec3; midpoint: Vec3 }
export interface FaceInfo { id: string; centroid: Vec3; normal: Vec3; triangles: number }

export interface SelectionState {
  objects: string[];
  faces: { objectId: string; faceId: string }[];
  edges: { objectId: string; edgeId: string }[];
  /** Always empty — see `selectVertex()`. */
  vertices: { objectId: string; vertexId: string }[];
}

export type PickResult =
  | { type: 'empty' }
  | { type: 'object'; objectId: string }
  | { type: 'face'; objectId: string; faceId: string }
  | { type: 'edge'; objectId: string; edgeId: string };

export interface CommandResult {
  success: boolean;
  /** Log lines the app emitted while the command ran. */
  output: string[];
}

export interface SnapState {
  active: boolean;
  mode: string | null;
  snappedPoint: Vec3 | null;
  /** Where the cursor resolved to, snapped or not. */
  point: Vec3 | null;
}

export interface DraftingSettings {
  ortho: boolean;
  osnap: boolean;
  otrack: boolean;
  snap: boolean;
  grid: boolean;
  snapSpacing: number;
  gridSpacing: number;
  mode3d: boolean;
}

/** Thrown for calls the app genuinely cannot serve, so tests fail with a reason instead of a wrong answer. */
export class TestBridgeError extends Error {
  constructor(public code: 'not-found' | 'unsupported' | 'bad-argument', message: string) {
    super(message);
    this.name = 'TestBridgeError';
  }
}

const EPS = 1e-6;

const vec3 = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

/** Accepts both call styles so tests can pass whichever is natural. */
const toVector3 = (p: Vec3 | { x: number; y: number; z?: number }): THREE.Vector3 =>
  Array.isArray(p)
    ? new THREE.Vector3(p[0], p[1], p[2])
    : new THREE.Vector3(p.x, p.y, p.z ?? 0);

/**
 * Entity class to reported type name.
 *
 * Deliberately not `constructor.name`: a production build minifies class names, so a
 * solid comes back as "sn" and every `type === 'Solid3D'` filter in a test silently
 * matches nothing. Subclasses are listed before their bases, since the first match wins.
 */
const ENTITY_TYPES: [new (...args: never[]) => Entity, string][] = [
  [Solid3D, 'Solid3D'],
  [Donut, 'Donut'],
  [Ellipse, 'Ellipse'],
  [Arc, 'Arc'],
  [Circle, 'Circle'],
  [MText, 'MText'],
  [Text, 'Text'],
  [Note, 'Note'],
  [Dimension, 'Dimension'],
  [Hatch, 'Hatch'],
  [ImagePlane, 'ImagePlane'],
  [Insert, 'Insert'],
  [Polyline, 'Polyline'],
  [Spline, 'Spline'],
  [Trace, 'Trace'],
  [Shape, 'Shape'],
  [Solid, 'Solid'],
  [Line, 'Line'],
  [Point, 'Point'],
];

const typeNameOf = (e: Entity): string => {
  for (const [ctor, name] of ENTITY_TYPES) {
    if (e instanceof ctor) return name;
  }
  return e.constructor.name;
};

const VIEW_PRESETS: Record<ViewPreset, string> = {
  top: 'TOP',
  bottom: 'BOTTOM',
  front: 'FRONT',
  back: 'BACK',
  left: 'LEFT',
  right: 'RIGHT',
  iso: 'ISO',
  isometric: 'ISOMETRIC',
  orthogonal: 'ORTHOGONAL',
  perspective: 'PERSPECTIVE',
};

export class TestBridge {
  readonly version = 1;

  private ready = false;
  private idle = false;
  private inFlight = 0;
  private framePendingSince = 0;

  constructor(
    private readonly app: App,
    private readonly viewer: Viewer,
  ) {
    this.watch();
  }

  // ---------------------------------------------------------------- Epic 1: readiness

  /** True once the kernel is up, the document exists, and at least one frame has been drawn. */
  isReady(): boolean {
    return (
      OpenCascadeService.getInstance().isInitialized &&
      !!this.app.doc &&
      !!this.viewer.canvas.width &&
      this.canvasRect().width > 0
    );
  }

  /** True when nothing is in flight: no kernel request, no queued frame, no bridge command. */
  isIdle(): boolean {
    return (
      this.isReady() &&
      OpenCascadeService.getInstance().pendingCount === 0 &&
      !this.framePending() &&
      this.inFlight === 0
    );
  }

  async whenReady(timeoutMs = 60_000): Promise<void> {
    await this.waitFor(() => this.isReady(), timeoutMs, 'app never became ready');
  }

  async whenIdle(timeoutMs = 120_000): Promise<void> {
    await this.waitFor(() => this.isIdle(), timeoutMs, 'app never became idle');
  }

  // ---------------------------------------------------------------- Epic 2: camera

  getCameraState(): CameraState {
    const cam = this.viewer.camera;
    return {
      position: vec3(cam.position),
      target: vec3(this.viewer.target),
      up: vec3(cam.up),
      fov: null,
      zoom: cam.zoom,
      projection: 'ortho',
      viewPreset: this.viewer.currentViewName,
      canOrbit: !this.viewer.isPlainView,
    };
  }

  async setView(preset: ViewPreset | string): Promise<void> {
    const key = String(preset).toLowerCase() as ViewPreset;
    const name = VIEW_PRESETS[key] ?? String(preset).toUpperCase();
    this.viewer.setCameraView(name);
    if (this.viewer.currentViewName !== name) {
      throw new TestBridgeError('bad-argument', `unknown view preset "${preset}"`);
    }
    // setCameraView aims the camera at the world origin but leaves `target` where it
    // was; sync it so a following orbit()/pan() pivots around what we are looking at.
    this.viewer.target.set(0, 0, 0);
    this.viewer.scheduleRender();
    await this.settle();
  }

  async orbit(deltaAzimuthDeg: number, deltaElevationDeg: number): Promise<void> {
    if (this.viewer.isPlainView) {
      throw new TestBridgeError(
        'unsupported',
        `cannot orbit in the locked view "${this.viewer.currentViewName}" — call setView('orthogonal') first`,
      );
    }
    // Viewer.orbit() takes mouse pixel deltas at 0.01 rad per pixel.
    const toPixels = (deg: number) => (deg * Math.PI) / 180 / 0.01;
    this.viewer.orbit(toPixels(deltaAzimuthDeg), toPixels(deltaElevationDeg));
    await this.settle();
  }

  async zoom(factor: number): Promise<void> {
    if (!(factor > 0)) throw new TestBridgeError('bad-argument', 'zoom factor must be > 0');
    this.viewer.camera.zoom *= factor;
    this.viewer.camera.updateProjectionMatrix();
    this.viewer.scheduleRender();
    await this.settle();
  }

  async zoomToFit(objectIds?: string[]): Promise<void> {
    const entities = (objectIds ?? this.app.doc.getAllEntities().map((e) => e.id))
      .map((id) => this.entity(id));
    if (entities.length === 0) return;
    this.viewer.zoomAll(entities);
    await this.settle();
  }

  /** Move camera and target together, in world units, along the camera's right/up axes. */
  async pan(dxWorld: number, dyWorld: number): Promise<void> {
    const cam = this.viewer.camera;
    const forward = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(forward, cam.up).normalize();
    const up = cam.up.clone().normalize();
    const delta = new THREE.Vector3()
      .addScaledVector(right, dxWorld)
      .addScaledVector(up, dyWorld);
    cam.position.add(delta);
    this.viewer.target.add(delta);
    cam.updateProjectionMatrix();
    this.viewer.scheduleRender();
    await this.settle();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setProjection(projection: 'ortho' | 'perspective'): Promise<void> {
    if (projection === 'ortho') return;
    throw new TestBridgeError(
      'unsupported',
      'the renderer holds a single THREE.OrthographicCamera. The "PERSPECTIVE_*" view ' +
        'presets are angled orthographic views, not a perspective projection, so there is ' +
        'nothing to switch to.',
    );
  }

  /** Project a world point to canvas pixels. The inverse of `screenToWorld`. */
  worldToScreen(point: Vec3 | { x: number; y: number; z?: number }): ScreenPoint {
    const rect = this.canvasRect();
    const ndc = toVector3(point).project(this.viewer.camera);
    const x = ((ndc.x + 1) / 2) * rect.width;
    const y = ((1 - ndc.y) / 2) * rect.height;
    return {
      x,
      y,
      clientX: rect.left + x,
      clientY: rect.top + y,
      onScreen: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height && ndc.z >= -1 && ndc.z <= 1,
    };
  }

  /**
   * Cast a ray through a canvas pixel and intersect the plane z = planeZ.
   *
   * This is deliberately not `Viewer.screenToWorld()`: that one picks its plane by
   * comparing |camera.x|, |camera.y| and |camera.z| and swizzles the result for
   * drafting, which yields nonsense in angled views where no axis dominates.
   */
  screenToWorld(x: number, y: number, planeZ = 0): Vec3 {
    const rect = this.canvasRect();
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.viewer.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);

    // Guard the grazing case as well as the exactly-parallel one. FRONT/BACK/LEFT/RIGHT
    // look straight along the z = k planes, and floating-point noise there is enough for
    // intersectPlane() to return a point hundreds of units away instead of nothing.
    const alignment = Math.abs(ray.ray.direction.dot(plane.normal));
    const hit = alignment < 1e-6 ? null : ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) {
      throw new TestBridgeError(
        'unsupported',
        `the ${this.viewer.currentViewName} view looks along the plane z = ${planeZ}, so a pixel ` +
          `does not map to one point on it. Pick a view that faces the plane, or project from a ` +
          `known point with worldToScreen() instead.`,
      );
    }
    return vec3(hit);
  }

  /**
   * Whether a real mouse event at this canvas pixel would actually reach the viewport.
   *
   * The canvas spans the whole viewport area, but the command log and the docked
   * panes are painted on top of it. A point inside the canvas rect can still be
   * covered, in which case a dispatched click goes to the panel and the app never
   * sees it — worth catching at the aiming stage rather than as a missing selection.
   */
  isClickable(x: number, y: number): boolean {
    const rect = this.canvasRect();
    return document.elementFromPoint(rect.left + x, rect.top + y) === this.viewer.canvas;
  }

  /** Canvas size and offset, so a driver can convert between the two pixel spaces itself. */
  getCanvasRect(): { x: number; y: number; width: number; height: number } {
    const r = this.canvasRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  /**
   * Which renderer drew the frame (WEBCAD-170).
   *
   * `createRenderer()` falls back to WebGL on any WebGPU failure, silently and by
   * design. Without a way to read the outcome, a suite launched with `?renderer=webgpu`
   * on a machine with no adapter would pass while testing the wrong backend entirely —
   * so `fellBack` is the assertion that matters, not `kind` alone.
   */
  getRendererInfo(): RendererInfo {
    return { ...this.viewer.rendererInfo };
  }

  // ---------------------------------------------------------------- Epic 3: scene graph

  listObjects(): ObjectSummary[] {
    return this.app.doc.getAllEntities().map((e) => this.summarise(e));
  }

  getObject(id: string): ObjectDetail {
    const e = this.entity(id);
    const detail: ObjectDetail = {
      ...this.summarise(e),
      transform: { position: e instanceof Solid3D ? vec3(e.position) : [0, 0, 0] },
      bbox: this.boxOf(e),
    };
    if (e instanceof Solid3D) {
      detail.vertices = this.getVertices(id).length;
      detail.edges = (e.edgeLines ?? []).length;
      detail.faces = this.faceIndices(e).length;
      detail.features = (e.features ?? []).map((f: { type: string }) => f.type);
      detail.brepBytes = e.brepSnapshot ? e.brepSnapshot.length : null;
    }
    return detail;
  }

  getBoundingBox(id: string | string[]): Box3 {
    const ids = Array.isArray(id) ? id : [id];
    if (ids.length === 0) throw new TestBridgeError('bad-argument', 'getBoundingBox needs at least one id');
    const box = new THREE.Box3();
    box.makeEmpty();
    for (const one of ids) {
      const b = this.boxOf(this.entity(one));
      if (!b) continue;
      box.expandByPoint(new THREE.Vector3(...b.min));
      box.expandByPoint(new THREE.Vector3(...b.max));
    }
    if (box.isEmpty()) throw new TestBridgeError('not-found', `no geometry to bound in ${ids.join(', ')}`);
    return { min: vec3(box.min), max: vec3(box.max) };
  }

  /**
   * Unique corner points of a solid.
   *
   * Derived from edge endpoints rather than the render buffer: the tessellation
   * duplicates every corner once per face (a box has 24 buffer vertices), while the
   * edge polylines carry the topological corners — 8 for a box, as you would expect.
   */
  getVertices(objectId: string): VertexInfo[] {
    const solid = this.solid(objectId);
    const raw: THREE.Vector3[] = [];
    for (const edge of solid.edgeLines ?? []) {
      if (edge.length < 3) continue;
      raw.push(new THREE.Vector3(edge[0], edge[1], edge[2]));
      raw.push(new THREE.Vector3(edge[edge.length - 3], edge[edge.length - 2], edge[edge.length - 1]));
    }
    if (raw.length === 0) {
      const pos = solid.positions;
      for (let i = 0; i < pos.length; i += 3) raw.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
    }
    return this.dedupe(raw).map((p, i) => ({ id: `v${i}`, position: vec3(p) }));
  }

  /**
   * Edge ids are indices into `edgeLines` — the same index the `EDGE:<id>:<n>`
   * command protocol takes, so an id from here can be handed straight to SFILLET.
   *
   * Note the list is not deduplicated: the tessellator emits one polyline per
   * face-edge use, so a box reports 24 entries covering 12 distinct edges. Two ids
   * can therefore name the same physical edge.
   */
  getEdges(objectId: string): EdgeInfo[] {
    const solid = this.solid(objectId);
    const vertices = this.getVertices(objectId);
    const idAt = (p: THREE.Vector3): string | null =>
      vertices.find((v) => new THREE.Vector3(...v.position).distanceTo(p) < 1e-4)?.id ?? null;

    return (solid.edgeLines ?? []).map((edge, index) => {
      const start = new THREE.Vector3(edge[0], edge[1], edge[2]);
      const end = new THREE.Vector3(edge[edge.length - 3], edge[edge.length - 2], edge[edge.length - 1]);
      // Midpoint of the polyline, not of the chord — matters for curved edges.
      const mid = edge.length >= 6
        ? (() => {
            const k = Math.floor(edge.length / 6) * 3;
            return new THREE.Vector3(edge[k], edge[k + 1], edge[k + 2]);
          })()
        : start.clone().lerp(end, 0.5);
      return {
        id: `e${index}`,
        startVertexId: idAt(start),
        endVertexId: idAt(end),
        start: vec3(start),
        end: vec3(end),
        midpoint: vec3(mid),
      };
    });
  }

  /** Face ids are the values in `faceMapping` — the same index `FACE:<id>:<n>` takes. */
  getFaces(objectId: string): FaceInfo[] {
    const solid = this.solid(objectId);
    const { positions, indices, faceMapping } = solid;
    if (!faceMapping) return [];

    const acc = new Map<number, { centroid: THREE.Vector3; normal: THREE.Vector3; triangles: number }>();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    for (let t = 0; t < faceMapping.length; t++) {
      const faceIndex = faceMapping[t];
      const i0 = indices[t * 3] * 3;
      const i1 = indices[t * 3 + 1] * 3;
      const i2 = indices[t * 3 + 2] * 3;
      if (i2 === undefined || i2 + 2 >= positions.length) continue;

      a.set(positions[i0], positions[i0 + 1], positions[i0 + 2]);
      b.set(positions[i1], positions[i1 + 1], positions[i1 + 2]);
      c.set(positions[i2], positions[i2 + 1], positions[i2 + 2]);

      // Cross product magnitude is twice the triangle area, so summing un-normalised
      // cross products weights each triangle's normal by its area for free.
      const normal = new THREE.Vector3()
        .subVectors(b, a)
        .cross(new THREE.Vector3().subVectors(c, a));
      const centroid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);

      const entry = acc.get(faceIndex);
      if (entry) {
        entry.centroid.add(centroid);
        entry.normal.add(normal);
        entry.triangles++;
      } else {
        acc.set(faceIndex, { centroid, normal, triangles: 1 });
      }
    }

    return [...acc.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([faceIndex, v]) => ({
        id: `f${faceIndex}`,
        centroid: vec3(v.centroid.divideScalar(v.triangles)),
        normal: vec3(v.normal.lengthSq() > EPS ? v.normal.normalize() : new THREE.Vector3(0, 0, 1)),
        triangles: v.triangles,
      }));
  }

  /**
   * Ask the geometry kernel whether a solid is sound, and whether it still matches
   * what the viewport is drawing.
   *
   * Deliberately does *not* push the entity's `brepSnapshot` into the worker first.
   * Re-importing would guarantee a hit and make the check meaningless — the point is
   * to report the kernel's actual current state, including "the kernel has never
   * heard of this solid". Call `syncToKernel()` explicitly if a test wants the shape
   * loaded before checking.
   */
  async checkValidity(objectId: string): Promise<ValidityReport> {
    const solid = this.solid(objectId);
    const modelFaceCount = this.faceIndices(solid).length;

    this.inFlight++;
    try {
      const result = await OpenCascadeService.getInstance().checkValidity(objectId);
      return {
        id: objectId,
        inKernel: true,
        isValid: result.isValid,
        faceCount: result.faceCount,
        modelFaceCount,
        faceCountMatches: result.faceCount === modelFaceCount,
        errorMsg: result.errorMsg ?? '',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // The worker reports a cache miss as a thrown "Shape not found" — a state
      // worth reporting, not an error to propagate.
      if (/not found/i.test(message)) {
        return {
          id: objectId,
          inKernel: false,
          isValid: null,
          faceCount: null,
          modelFaceCount,
          faceCountMatches: false,
          errorMsg: message,
        };
      }
      throw new TestBridgeError('unsupported', `checkValidity failed for ${objectId}: ${message}`);
    } finally {
      this.inFlight--;
    }
  }

  /**
   * Push a solid's stored B-rep into the worker cache, as the solid handlers do for
   * externally loaded shapes. Returns false when the entity carries no snapshot.
   */
  async syncToKernel(objectId: string): Promise<boolean> {
    const solid = this.solid(objectId);
    if (!solid.brepSnapshot) return false;
    this.inFlight++;
    try {
      await OpenCascadeService.getInstance().importBRep(objectId, solid.brepSnapshot);
      return true;
    } finally {
      this.inFlight--;
    }
  }

  // ---------------------------------------------------------------- Epic 4: selection

  selectObject(id: string, mode: SelectMode = 'replace'): SelectionState {
    this.entity(id); // throws if unknown
    const set = this.app.selectedEntityIds;
    if (mode === 'replace') {
      set.clear();
      set.add(id);
    } else if (mode === 'add') {
      set.add(id);
    } else {
      if (set.has(id)) set.delete(id); else set.add(id);
    }
    this.syncSelection();
    return this.getSelection();
  }

  selectFace(objectId: string, faceId: string | number, mode: SelectMode = 'replace'): SelectionState {
    const solid = this.solid(objectId);
    const faceIndex = this.subIndex(faceId, 'f');
    if (!this.faceIndices(solid).includes(faceIndex)) {
      throw new TestBridgeError('not-found', `${objectId} has no face ${faceId}`);
    }
    const entry = { entityId: objectId, faceIndex };
    if (mode === 'replace') {
      this.app.selectedFaces = [entry];
    } else {
      const at = this.app.selectedFaces.findIndex(
        (f) => f.entityId === objectId && f.faceIndex === faceIndex,
      );
      if (mode === 'toggle' && at >= 0) this.app.selectedFaces.splice(at, 1);
      else if (at < 0) this.app.selectedFaces.push(entry);
    }
    this.app.selectedEdge = null;
    this.syncSelection();
    return this.getSelection();
  }

  selectEdge(objectId: string, edgeId: string | number, mode: SelectMode = 'replace'): SelectionState {
    const solid = this.solid(objectId);
    const edgeIndex = this.subIndex(edgeId, 'e');
    if (edgeIndex < 0 || edgeIndex >= (solid.edgeLines ?? []).length) {
      throw new TestBridgeError('not-found', `${objectId} has no edge ${edgeId}`);
    }
    // The app tracks exactly one highlighted edge, so 'add' cannot accumulate here.
    if (mode === 'toggle' && this.app.selectedEdge?.entityId === objectId && this.app.selectedEdge?.edgeIndex === edgeIndex) {
      this.app.selectedEdge = null;
    } else {
      this.app.selectedEdge = { entityId: objectId, edgeIndex };
    }
    if (mode === 'replace') this.app.selectedFaces = [];
    this.syncSelection();
    return this.getSelection();
  }

  /**
   * Not available. The app has no vertex selection state — solids expose face and
   * edge sub-selection only, and 2D entities are edited through grips. Reach a corner
   * via `getVertices()` plus OSNAP instead of pretending a selection happened.
   */
  selectVertex(): never {
    throw new TestBridgeError(
      'unsupported',
      'the app has no vertex selection model (App tracks selectedFaces and selectedEdge only). ' +
        'Use getVertices() + snapping, or grips for 2D entities.',
    );
  }

  clearSelection(): SelectionState {
    this.app.selectedEntityIds.clear();
    this.app.selectedFaces = [];
    this.app.selectedEdge = null;
    this.syncSelection();
    return this.getSelection();
  }

  getSelection(): SelectionState {
    return {
      objects: [...this.app.selectedEntityIds],
      faces: this.app.selectedFaces.map((f) => ({ objectId: f.entityId, faceId: `f${f.faceIndex}` })),
      edges: this.app.selectedEdge
        ? [{ objectId: this.app.selectedEdge.entityId, edgeId: `e${this.app.selectedEdge.edgeIndex}` }]
        : [],
      vertices: [],
    };
  }

  /**
   * What a click at this canvas pixel would hit — the app's own raycaster, run
   * without dispatching an event or mutating any state.
   */
  pickAt(x: number, y: number): PickResult {
    const rect = this.canvasRect();
    const ndc = this.viewer.getNormalizedDeviceCoordinates(rect.left + x, rect.top + y);

    const sub = Selection3DEngine.getSubEntityAtSmart(
      ndc,
      this.viewer.camera,
      this.viewer.selectableMeshes,
      this.viewer.edgeLines,
      this.app.doc,
      this.app.getSolid3DSelectables(),
    );
    if (sub) {
      if (sub.edgeIndex !== undefined) return { type: 'edge', objectId: sub.entity.id, edgeId: `e${sub.edgeIndex}` };
      if (sub.faceIndex !== undefined) return { type: 'face', objectId: sub.entity.id, faceId: `f${sub.faceIndex}` };
      return { type: 'object', objectId: sub.entity.id };
    }

    const world = this.screenToWorld(x, y);
    const flat = SelectionEngine.getEntityAtSpatial(
      world[0],
      world[1],
      5 / this.viewer.camera.zoom,
      this.app.doc,
      this.app.getSelectableEntities(),
    );
    return flat ? { type: 'object', objectId: flat.id } : { type: 'empty' };
  }

  // ---------------------------------------------------------------- Epic 5: commands

  /**
   * Run a command through the same path the visible Command: line uses.
   *
   * The first whitespace-separated token is the command; each remaining token is fed
   * in as one prompt response, so `'BOX 0,0 100,100 50'` walks the same three steps a
   * user types. Use `''` for an Enter-only step: `executeCommand('SHELL', '', '5')`.
   */
  async executeCommand(commandString: string, ...steps: string[]): Promise<CommandResult> {
    const before = this.logLines().length;
    this.inFlight++;
    try {
      const parts = commandString.trim().split(/\s+/).filter((p) => p.length > 0);
      if (parts.length === 0) throw new TestBridgeError('bad-argument', 'empty command');
      for (const line of [...parts, ...steps]) {
        await this.submitLine(line);
      }
    } finally {
      this.inFlight--;
    }
    await this.settle();
    const output = this.logLines().slice(before);
    return {
      success: !output.some((l) => /^(error|failed|unknown)/i.test(l.trim())),
      output,
    };
  }

  /**
   * One Enter press on the command line.
   *
   * Mirrors main.ts's `cmdLine.onCommand` handler exactly — echo, feed the text to
   * the active command first, fall back to starting a new command, print the result.
   * Going through `app.execute()` alone would skip the prompt-response path and never
   * write to the log, so assertions on command output would come up empty.
   */
  private async submitLine(value: string): Promise<void> {
    this.app.printToCommandLine(`Command: ${value}`);
    const trimmedUpper = value.trim().toUpperCase();
    if (trimmedUpper === 'QUIT' || trimmedUpper === 'EXIT') {
      await this.app.execute('NEW');
      return;
    }
    let res = await this.app.inputText(value);
    if (!res || (typeof res === 'string' && res.startsWith('Unknown'))) {
      res = await this.app.execute(trimmedUpper);
    }
    if (typeof res === 'string') this.app.printToCommandLine(res);
  }

  /**
   * A bare Enter press. Meaningful on its own in this app: it accepts a prompt
   * default and ends multi-select steps such as SFILLET's edge picking.
   */
  async pressEnter(): Promise<CommandResult> {
    const before = this.logLines().length;
    this.inFlight++;
    try {
      await this.submitLine('');
    } finally {
      this.inFlight--;
    }
    await this.settle();
    const output = this.logLines().slice(before);
    return { success: !output.some((l) => /^(error|failed|unknown)/i.test(l.trim())), output };
  }

  /** The command log, as text, newest last. */
  getCommandLog(lastN?: number): string[] {
    const lines = this.logLines();
    return lastN === undefined ? lines : lines.slice(Math.max(0, lines.length - lastN));
  }

  // ---------------------------------------------------------------- Epic 6 support: real input

  /**
   * Move the app's cursor as a real pointer move would, in canvas pixels. Drives snap
   * resolution and previews, so `getSnapState()` is meaningful afterwards.
   */
  moveCursor(x: number, y: number): SnapState {
    const rect = this.canvasRect();
    this.app.move(rect.left + x, rect.top + y);
    return this.getSnapState();
  }

  // ---------------------------------------------------------------- Epic 7: drafting aids

  getSnapState(): SnapState {
    const last = this.app.lastSnap;
    if (!last) return { active: false, mode: null, snappedPoint: null, point: null };
    return {
      active: last.snap !== null,
      mode: last.snap ? String(last.snap.type) : null,
      snappedPoint: last.snap ? [last.snap.x, last.snap.y, last.snap.z ?? 0] : null,
      point: [last.x, last.y, this.app.currentZ ?? 0],
    };
  }

  getDraftingSettings(): DraftingSettings {
    const d = this.app.drafting;
    return {
      ortho: d.orthoEnabled,
      osnap: d.osnapEnabled,
      otrack: d.otrackEnabled,
      snap: d.snapEnabled,
      grid: d.gridEnabled,
      snapSpacing: d.snapSpacing,
      gridSpacing: d.gridSpacing,
      mode3d: d.mode3d,
    };
  }

  /** Set a toggle to an absolute value, rather than flipping it blind. */
  setDraftingSetting(key: 'ortho' | 'osnap' | 'otrack' | 'snap' | 'grid', value: boolean): DraftingSettings {
    const d = this.app.drafting;
    const current = this.getDraftingSettings()[key];
    if (current === value) return this.getDraftingSettings();
    const toggles = {
      ortho: () => d.toggleOrtho(),
      osnap: () => d.toggleOsnap(),
      otrack: () => d.toggleOtrack(),
      snap: () => d.toggleSnap(),
      grid: () => d.toggleGrid(),
    };
    const toggle = toggles[key];
    if (!toggle) throw new TestBridgeError('bad-argument', `unknown drafting setting "${key}"`);
    toggle();
    return this.getDraftingSettings();
  }

  // ---------------------------------------------------------------- internals

  private canvasRect(): DOMRect {
    return this.viewer.canvas.getBoundingClientRect();
  }

  private entity(id: string): Entity {
    const e = this.app.doc.getEntity(id);
    if (!e) throw new TestBridgeError('not-found', `no object with id "${id}"`);
    return e;
  }

  private solid(id: string): Solid3D {
    const e = this.entity(id);
    if (!(e instanceof Solid3D)) {
      throw new TestBridgeError('bad-argument', `"${id}" is a ${typeNameOf(e)}, not a solid`);
    }
    return e;
  }

  private subIndex(id: string | number, prefix: 'e' | 'f'): number {
    const n = typeof id === 'number' ? id : Number(String(id).replace(new RegExp(`^${prefix}`), ''));
    if (!Number.isInteger(n)) throw new TestBridgeError('bad-argument', `"${id}" is not a valid ${prefix} id`);
    return n;
  }

  private faceIndices(solid: Solid3D): number[] {
    return [...new Set(solid.faceMapping ?? [])].sort((a, b) => a - b);
  }

  private summarise(e: Entity): ObjectSummary {
    const layer = this.app.doc.layers.getLayer(e.layer);
    return {
      id: e.id,
      type: typeNameOf(e),
      name: e.id,
      visible: layer ? layer.isVisible : true,
      layer: e.layer,
    };
  }

  private boxOf(e: Entity): Box3 | null {
    if (e instanceof Solid3D) {
      const b = e.getBoundingBox3D();
      if (!b) return null;
      return { min: [b.minX, b.minY, b.minZ], max: [b.maxX, b.maxY, b.maxZ] };
    }
    const b = e.getBoundingBox();
    if (!b || !Number.isFinite(b.minX)) return null;
    return { min: [b.minX, b.minY, e.elevation], max: [b.maxX, b.maxY, e.elevation] };
  }

  private dedupe(points: THREE.Vector3[]): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const p of points) {
      if (!out.some((q) => q.distanceToSquared(p) < 1e-8)) out.push(p);
    }
    // Stable order so vertex ids do not shuffle between runs.
    return out.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  }

  private logLines(): string[] {
    const el = document.getElementById('command-log');
    if (!el) return [];
    return [...el.children].map((c) => (c.textContent ?? '').trim());
  }

  /** Push selection into the renderer and the panels, exactly as a real click does. */
  private syncSelection(): void {
    const entities = [...this.app.selectedEntityIds]
      .map((id) => this.app.doc.getEntity(id))
      .filter((e): e is Entity => e !== undefined);

    this.viewer.setHighlight(entities.map((e) => e.id));
    this.viewer.renderGrips(entities);

    const solids = new Set(
      this.app.doc.getAllEntities().filter((e) => e instanceof Solid3D).map((e) => e.id),
    );
    for (const id of solids) {
      this.viewer.highlightFace(id, null);
      this.viewer.highlightEdge(id, null);
    }
    for (const f of this.app.selectedFaces) this.viewer.highlightFace(f.entityId, f.faceIndex);
    if (this.app.selectedEdge) {
      this.viewer.highlightEdge(this.app.selectedEdge.entityId, this.app.selectedEdge.edgeIndex);
    }

    this.app.updateGizmoAttachment();
    this.app.updatePropertiesWindow();
    this.app.triggerObjectsWindowUpdate();
    this.viewer.scheduleRender();
  }

  /**
   * Whether a frame is queued and still plausibly on its way.
   *
   * The Viewer clears its flag inside a requestAnimationFrame callback, and the
   * browser stops firing those in a backgrounded tab. Without the age cap, a hidden
   * page would report "busy" forever and every wait would time out, so a frame that
   * has been queued longer than one slow refresh no longer blocks idle — the document
   * state is already committed at that point; only the pixels are behind.
   */
  private framePending(): boolean {
    if (!this.viewer.isRenderPending) {
      this.framePendingSince = 0;
      return false;
    }
    const now = Date.now();
    if (this.framePendingSince === 0) this.framePendingSince = now;
    return now - this.framePendingSince < 250;
  }

  /** Let a frame render, then wait for everything in flight to drain. */
  private async settle(): Promise<void> {
    // Raced against a timer for the same reason framePending() has an age cap.
    await Promise.race([
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 100)),
    ]);
    await this.whenIdle();
  }

  private async waitFor(predicate: () => boolean, timeoutMs: number, message: string): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > deadline) throw new TestBridgeError('unsupported', `${message} within ${timeoutMs}ms`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /**
   * Emit `webcad:ready` once and `webcad:idle` on each busy→idle edge, so a driver can
   * await an event instead of polling.
   */
  private watch(): void {
    // A timer, not requestAnimationFrame: the watcher has to keep running in a
    // backgrounded tab, which is exactly when rAF stops.
    setInterval(() => {
      if (!this.ready && this.isReady()) {
        this.ready = true;
        document.dispatchEvent(new CustomEvent('webcad:ready'));
      }
      const idleNow = this.isIdle();
      if (idleNow && !this.idle) document.dispatchEvent(new CustomEvent('webcad:idle'));
      this.idle = idleNow;
    }, 30);
  }
}

/** True in dev builds, or in any build loaded with `?testBridge=1`. */
export function isTestBridgeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('testBridge')) return true;
  return !!import.meta.env?.DEV;
}

/**
 * Attach the bridge to `window.__webcadTest`. Call once, after the first document is
 * loaded. Returns null (and touches nothing) when the bridge is disabled.
 */
export function installTestBridge(app: App, viewer: Viewer): TestBridge | null {
  if (!isTestBridgeEnabled()) return null;
  const bridge = new TestBridge(app, viewer);
  (window as unknown as { __webcadTest: TestBridge }).__webcadTest = bridge;
  return bridge;
}
