import { Page, expect } from '@playwright/test';
import type {
  Box3,
  CameraState,
  CommandResult,
  DraftingSettings,
  EdgeInfo,
  FaceInfo,
  ObjectDetail,
  ObjectSummary,
  PickResult,
  RendererInfo,
  ScreenPoint,
  SelectMode,
  SelectionState,
  SnapState,
  ValidityReport,
  Vec3,
  VertexInfo,
  ViewPreset,
} from '../../src/testing/TestBridge';

/**
 * Playwright-side driver for the in-app test bridge (WEBCAD-156).
 *
 * Every query and command goes through `window.__webcadTest`, so tests name what
 * they mean — an object id, a face id, a world point — instead of pixel guesses.
 * The only place pixels appear is `input`, and even there they are derived from
 * bridge queries rather than written into the test.
 */

export class BridgeCallError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'BridgeCallError';
  }
}

type CallResult = { ok: true; value: unknown } | { ok: false; code: string; message: string };

export class CadBridge {
  constructor(readonly page: Page) {}

  /** Load the app and wait until the kernel, document and first frame are up. */
  static async boot(page: Page, url = '/'): Promise<CadBridge> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const bridge = new CadBridge(page);
    await page.waitForFunction(() => !!(window as never as { __webcadTest?: unknown }).__webcadTest, null, {
      timeout: 60_000,
    });
    await bridge.whenReady();
    await bridge.whenIdle();
    return bridge;
  }

  // ------------------------------------------------------------------ plumbing

  async call<T>(method: string, ...args: unknown[]): Promise<T> {
    const result = (await this.page.evaluate(
      async ({ method, args }) => {
        const bridge = (window as never as Record<string, Record<string, (...a: unknown[]) => unknown>>)
          .__webcadTest;
        if (!bridge) {
          return { ok: false, code: 'missing', message: 'window.__webcadTest is not installed' };
        }
        if (typeof bridge[method] !== 'function') {
          return { ok: false, code: 'bad-argument', message: `no such bridge method` };
        }
        try {
          return { ok: true, value: await bridge[method](...args) };
        } catch (err) {
          const e = err as { code?: string; message?: string };
          return { ok: false, code: e?.code ?? 'error', message: e?.message ?? String(err) };
        }
      },
      { method, args },
    )) as CallResult;

    if (!result.ok) throw new BridgeCallError(result.code, `${method}(): ${result.message}`);
    return result.value as T;
  }

  /** Assert a call fails, and return the error — for pinning down unsupported paths. */
  async expectRejection(method: string, ...args: unknown[]): Promise<BridgeCallError> {
    try {
      await this.call(method, ...args);
    } catch (err) {
      if (err instanceof BridgeCallError) return err;
      throw err;
    }
    throw new Error(`expected ${method}() to fail, but it succeeded`);
  }

  // ------------------------------------------------------------------ readiness

  whenReady = (timeoutMs?: number) => this.call<void>('whenReady', timeoutMs);
  whenIdle = (timeoutMs?: number) => this.call<void>('whenIdle', timeoutMs);
  isIdle = () => this.call<boolean>('isIdle');

  // ------------------------------------------------------------------ camera

  getCameraState = () => this.call<CameraState>('getCameraState');
  setView = (preset: ViewPreset) => this.call<void>('setView', preset);
  orbit = (azimuthDeg: number, elevationDeg: number) => this.call<void>('orbit', azimuthDeg, elevationDeg);
  zoom = (factor: number) => this.call<void>('zoom', factor);
  zoomToFit = (objectIds?: string[]) => this.call<void>('zoomToFit', objectIds);
  pan = (dxWorld: number, dyWorld: number) => this.call<void>('pan', dxWorld, dyWorld);
  worldToScreen = (point: Vec3) => this.call<ScreenPoint>('worldToScreen', point);
  screenToWorld = (x: number, y: number, planeZ?: number) => this.call<Vec3>('screenToWorld', x, y, planeZ);
  getCanvasRect = () => this.call<{ x: number; y: number; width: number; height: number }>('getCanvasRect');
  isClickable = (x: number, y: number) => this.call<boolean>('isClickable', x, y);

  /** Which backend drew the frame, and whether it is the one that was asked for. */
  getRendererInfo = () =>
    this.call<RendererInfo>('getRendererInfo');

  /**
   * Assert the viewport is on the expected backend.
   *
   * `createRenderer()` falls back to WebGL on any WebGPU failure, so asserting on the
   * backend name alone is not enough — a run that quietly fell back would still be
   * "webgl" and still pass. `fellBack` is what makes the failure loud, and the reason
   * string says why.
   */
  async expectRenderer(kind: 'webgl' | 'webgpu'): Promise<RendererInfo> {
    const info = await this.getRendererInfo();
    expect(info.fellBack, `renderer fell back from ${info.requested}: ${info.reason}`).toBe(false);
    expect(info.kind, `expected the ${kind} backend, got ${info.kind}: ${info.reason}`).toBe(kind);
    return info;
  }

  // ------------------------------------------------------------------ scene graph

  listObjects = () => this.call<ObjectSummary[]>('listObjects');
  getObject = (id: string) => this.call<ObjectDetail>('getObject', id);
  getBoundingBox = (id: string | string[]) => this.call<Box3>('getBoundingBox', id);
  getVertices = (objectId: string) => this.call<VertexInfo[]>('getVertices', objectId);
  getEdges = (objectId: string) => this.call<EdgeInfo[]>('getEdges', objectId);
  getFaces = (objectId: string) => this.call<FaceInfo[]>('getFaces', objectId);

  /** Ask the kernel whether a solid is sound and still matches what is drawn. */
  checkValidity = (objectId: string) => this.call<ValidityReport>('checkValidity', objectId);
  /** Push a solid's stored B-rep into the worker cache. False when it has no snapshot. */
  syncToKernel = (objectId: string) => this.call<boolean>('syncToKernel', objectId);

  /** Fail with the kernel's own reason if the solid is unsound or has drifted from the model. */
  async expectValid(objectId: string): Promise<ValidityReport> {
    const report = await this.checkValidity(objectId);
    expect(report.inKernel, `the kernel has no shape cached for ${objectId}`).toBe(true);
    expect(report.isValid, `kernel rejected ${objectId}: ${report.errorMsg}`).toBe(true);
    expect(
      report.faceCountMatches,
      `kernel and model disagree on face count for ${objectId} ` +
        `(kernel ${report.faceCount}, model ${report.modelFaceCount}) — the viewport is ` +
        `showing geometry the kernel no longer holds`,
    ).toBe(true);
    return report;
  }

  /** The one solid in the document, failing loudly if that assumption is wrong. */
  async onlySolid(): Promise<ObjectDetail> {
    const solids = (await this.listObjects()).filter((o) => o.type === 'Solid3D');
    expect(solids, 'expected exactly one solid in the document').toHaveLength(1);
    return this.getObject(solids[0].id);
  }

  // ------------------------------------------------------------------ selection

  selectObject = (id: string, mode: SelectMode = 'replace') => this.call<SelectionState>('selectObject', id, mode);
  selectFace = (objectId: string, faceId: string, mode: SelectMode = 'replace') =>
    this.call<SelectionState>('selectFace', objectId, faceId, mode);
  selectEdge = (objectId: string, edgeId: string, mode: SelectMode = 'replace') =>
    this.call<SelectionState>('selectEdge', objectId, edgeId, mode);
  clearSelection = () => this.call<SelectionState>('clearSelection');
  getSelection = () => this.call<SelectionState>('getSelection');
  pickAt = (x: number, y: number) => this.call<PickResult>('pickAt', x, y);

  // ------------------------------------------------------------------ commands

  /**
   * `run('BOX', '0,0', '100,100', '50')` — first argument is the command, the rest
   * are prompt responses, one per step. Use `''` for an Enter-only step.
   */
  run = (command: string, ...steps: string[]) => this.call<CommandResult>('executeCommand', command, ...steps);
  pressEnter = () => this.call<CommandResult>('pressEnter');
  getCommandLog = (lastN?: number) => this.call<string[]>('getCommandLog', lastN);

  /** Run a command and fail the test if the app logged an error. */
  async runOk(command: string, ...steps: string[]): Promise<CommandResult> {
    const result = await this.run(command, ...steps);
    expect(result.output.join('\n'), `${command} should not log an error`).not.toMatch(/^(error|failed)/im);
    return result;
  }

  // ------------------------------------------------------------------ drafting aids

  /** Move the app's cursor to a canvas pixel and report what it snapped to. */
  moveCursor = (x: number, y: number) => this.call<SnapState>('moveCursor', x, y);
  getSnapState = () => this.call<SnapState>('getSnapState');

  /** Move the cursor to where a world point lands on screen, then report the snap. */
  async moveCursorToWorld(world: Vec3): Promise<SnapState> {
    const p = await this.worldToScreen(world);
    expect(p.onScreen, `[${world}] is off screen`).toBe(true);
    const rect = await this.getCanvasRect();
    return this.moveCursor(p.clientX - rect.x, p.clientY - rect.y);
  }
  getDraftingSettings = () => this.call<DraftingSettings>('getDraftingSettings');
  setDrafting = (key: 'ortho' | 'osnap' | 'otrack' | 'snap' | 'grid', value: boolean) =>
    this.call<DraftingSettings>('setDraftingSetting', key, value);

  // ------------------------------------------------------------------ Epic 6: real input

  get input(): RealInput {
    return new RealInput(this);
  }
}

/**
 * Genuine DOM mouse events, aimed using bridge queries.
 *
 * Use this only for behaviour that lives in the event handlers themselves — drag
 * thresholds, modifier keys, box-select. Anything else should call the bridge
 * directly, where a failure points at the feature instead of at the aiming.
 */
export class RealInput {
  constructor(private readonly bridge: CadBridge) {}

  private get page(): Page {
    return this.bridge.page;
  }

  /** Viewport pixels for a world point, checked to be both on screen and unobstructed. */
  private async pixel(world: Vec3, what: string): Promise<{ x: number; y: number }> {
    const p = await this.bridge.worldToScreen(world);
    expect(p.onScreen, `${what} at [${world}] is off screen — zoomToFit() or setView() first`).toBe(true);
    const rect = await this.bridge.getCanvasRect();
    const clickable = await this.bridge.isClickable(p.clientX - rect.x, p.clientY - rect.y);
    expect(
      clickable,
      `${what} at [${world}] lands on UI chrome covering the canvas (command log or a docked pane), ` +
        `so a real mouse event would not reach the viewport`,
    ).toBe(true);
    return { x: p.clientX, y: p.clientY };
  }

  async moveToWorld(world: Vec3): Promise<void> {
    const { x, y } = await this.pixel(world, 'point');
    await this.page.mouse.move(x, y);
  }

  async clickWorld(world: Vec3, options?: { modifiers?: ('Shift' | 'Control')[] }): Promise<void> {
    const { x, y } = await this.pixel(world, 'point');
    await this.page.mouse.move(x, y);
    await this.page.mouse.click(x, y, { ...(options?.modifiers ? { modifiers: options.modifiers } : {}) });
    await this.bridge.whenIdle();
  }

  /** Click the centre of an object's bounding box, after confirming that pixel picks it. */
  async clickObject(objectId: string): Promise<void> {
    const box = await this.bridge.getBoundingBox(objectId);
    const centre: Vec3 = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];
    await this.aimAndClick(centre, objectId);
  }

  async clickFace(objectId: string, faceId: string): Promise<void> {
    const face = (await this.bridge.getFaces(objectId)).find((f) => f.id === faceId);
    expect(face, `${objectId} has no face ${faceId}`).toBeTruthy();
    await this.aimAndClick(face!.centroid, objectId);
  }

  async clickEdge(objectId: string, edgeId: string): Promise<void> {
    const edge = (await this.bridge.getEdges(objectId)).find((e) => e.id === edgeId);
    expect(edge, `${objectId} has no edge ${edgeId}`).toBeTruthy();
    await this.aimAndClick(edge!.midpoint, objectId);
  }

  async clickVertex(objectId: string, vertexId: string): Promise<void> {
    const vertex = (await this.bridge.getVertices(objectId)).find((v) => v.id === vertexId);
    expect(vertex, `${objectId} has no vertex ${vertexId}`).toBeTruthy();
    await this.aimAndClick(vertex!.position, objectId);
  }

  /** Press-drag-release between two world points — a real gesture, not two clicks. */
  async dragSelect(fromWorld: Vec3, toWorld: Vec3, steps = 12): Promise<void> {
    const from = await this.pixel(fromWorld, 'drag start');
    const to = await this.pixel(toWorld, 'drag end');
    await this.page.mouse.move(from.x, from.y);
    await this.page.mouse.down();
    await this.page.mouse.move(to.x, to.y, { steps });
    await this.page.mouse.up();
    await this.bridge.whenIdle();
  }

  /**
   * Confirm the raycaster would hit the intended object at this pixel before
   * dispatching, so a miss reports "aimed at the wrong thing" rather than a silent
   * empty click three assertions later.
   */
  private async aimAndClick(world: Vec3, expectedObjectId: string): Promise<void> {
    const p = await this.bridge.worldToScreen(world);
    expect(p.onScreen, `[${world}] is off screen`).toBe(true);
    const rect = await this.bridge.getCanvasRect();
    const hit = await this.bridge.pickAt(p.clientX - rect.x, p.clientY - rect.y);
    expect(
      'objectId' in hit ? hit.objectId : hit.type,
      `pixel (${Math.round(p.x)}, ${Math.round(p.y)}) picks ${JSON.stringify(hit)}, not ${expectedObjectId}`,
    ).toBe(expectedObjectId);

    await this.page.mouse.move(p.clientX, p.clientY);
    await this.page.mouse.click(p.clientX, p.clientY);
    await this.bridge.whenIdle();
  }
}
