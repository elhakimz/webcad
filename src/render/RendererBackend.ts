import * as THREE from "three"

/**
 * The renderer seam (WEBCAD-161).
 *
 * `Viewer` used to declare its renderer as the concrete `THREE.WebGLRenderer`, so
 * swapping the backend meant touching every consumer. This is the surface the
 * application actually uses — small, deliberately no more. Both
 * `WebGLRenderer` and `WebGPURenderer` satisfy it structurally, so no adapter class
 * is needed; the point is to stop the concrete type leaking, not to wrap it.
 *
 * Anything a caller needs beyond this belongs behind a `Viewer` method rather than a
 * reach through `viewer.renderer` (see `Viewer.captureImage`).
 */
export interface RendererBackend {
  /** The canvas being drawn into. Prefer `viewer.canvas` — this exists because three owns it. */
  readonly domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: THREE.ShadowMapType };
  /** Draw statistics for the last frame. Both backends populate this. */
  readonly info: {
    render: { calls: number; triangles: number };
  };
  setSize(width: number, height: number, updateStyle?: boolean): void;
  /**
   * Retina/zoom support (WEBCAD-169). Both backends implement this; the viewer
   * caps the value so a 4x display cannot quadruple the fill cost.
   */
  setPixelRatio(value: number): void;
  getPixelRatio(): number;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  dispose(): void;
}

/** The subset of three's `DeviceLostInfo` the app acts on. */
export interface DeviceLostInfo {
  api: string;
  message: string;
  reason: string | null;
}

export type RendererKind = 'webgl' | 'webgpu';

/** Fired by the WebGPU factory when the device is lost; `detail` is `DeviceLostInfo`. */
export const DEVICE_LOST_EVENT = 'webcad:device-lost';

/** What `createRenderer` settled on, and why. Surfaced to the test bridge by WEBCAD-170. */
export interface RendererSelection {
  renderer: RendererBackend;
  /** The backend actually drawing frames. */
  kind: RendererKind;
  /** What was asked for, before any fallback. */
  requested: RendererKind;
  /** True when `kind !== requested` — i.e. the request could not be honoured. */
  fellBack: boolean;
  /** Human-readable reason, always populated. Logged once at boot. */
  reason: string;
}

/**
 * `?renderer=webgpu` / `?renderer=webgl`. Overridable in both directions on purpose:
 * forcing WebGL on a machine that does support WebGPU is the only way to exercise the
 * fallback path deliberately.
 */
export function requestedRendererKind(search?: string): RendererKind {
  if (typeof window === 'undefined' && search === undefined) return 'webgl';
  const raw = new URLSearchParams(search ?? window.location.search).get('renderer');
  return raw === 'webgpu' ? 'webgpu' : 'webgl';
}

/** Necessary, not sufficient — an adapter can still fail to materialise. See `createRenderer`. */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/** The WebGL path, and the destination of every fallback. */
export function createWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  // antialias is off by default and was never enabled here (WEBCAD-159); it is the
  // single largest edge-quality win available and costs nothing to ask for.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  // Explicit rather than inherited: the default moved once already across three
  // releases, and the r160 -> current upgrade (WEBCAD-164) moves it again.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/**
 * Decide which backend to use, without building anything (WEBCAD-162).
 *
 * Async because WebGPU adapter acquisition is: `navigator.gpu` being present says
 * nothing about whether a device can actually be obtained — a blocklisted driver, a
 * headless container, or a lost device all fail later, which is why the failure path
 * here catches a rejected promise rather than only a missing API.
 *
 * Split from `createRenderer` so the decision is testable: constructing a real
 * `WebGLRenderer` needs a GPU context, which node does not have.
 *
 * WEBCAD-169 wires the WebGPU branch. Adapter success is still only a decision;
 * `createRenderer()` is what actually constructs and initialises the backend, and
 * it reports a real fallback if that fails.
 */
export async function chooseRenderer(
  requested: RendererKind = requestedRendererKind(),
): Promise<Omit<RendererSelection, 'renderer'>> {
  const webgl = (reason: string) => ({
    kind: 'webgl' as const,
    requested,
    fellBack: requested !== 'webgl',
    reason,
  });

  if (requested === 'webgl') return webgl('WebGL requested');

  if (!isWebGPUAvailable()) {
    return webgl('WebGPU requested but navigator.gpu is not present in this browser');
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return webgl('WebGPU requested but no adapter is available (driver blocklisted, or no GPU)');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return webgl(`WebGPU requested but adapter acquisition failed: ${message}`);
  }

  return {
    kind: 'webgpu',
    requested,
    fellBack: false,
    reason: 'WebGPU adapter is available',
  };
}

/**
 * Substitution seam for unit tests. Production uses the real builders below; a
 * fake lets node exercise the fallback decision without a GPU context.
 */
export interface RendererBuilders {
  webgl?: (canvas: HTMLCanvasElement) => RendererBackend;
  webgpu?: (canvas: HTMLCanvasElement) => Promise<RendererBackend>;
}

const defaultBuilders: Required<RendererBuilders> = {
  webgl: createWebGLRenderer,
  async webgpu(canvas) {
    const { createWebGPURenderer } = await import("./WebGPURendererFactory");
    return createWebGPURenderer(canvas);
  },
};

/** Decide, then build. The result is handed to the `Viewer` constructor ready to draw. */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  requested: RendererKind = requestedRendererKind(),
  builders: RendererBuilders = {},
): Promise<RendererSelection> {
  const buildWebGL = builders.webgl ?? defaultBuilders.webgl;
  const choice = await chooseRenderer(requested);

  if (choice.kind === 'webgl') {
    return { ...choice, renderer: buildWebGL(canvas) };
  }

  const buildWebGPU = builders.webgpu ?? defaultBuilders.webgpu;
  try {
    return { ...choice, renderer: await buildWebGPU(canvas) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[renderer] WebGPU initialisation failed; falling back to WebGL', err);

    try {
      return {
        renderer: buildWebGL(canvas),
        kind: 'webgl',
        requested,
        fellBack: true,
        reason: `WebGPU requested but initialisation failed: ${message}; using WebGL`,
      };
    } catch (fallbackErr) {
      const fallbackMessage =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      throw new Error(
        `WebGPU initialisation failed: ${message}; WebGL fallback also failed: ${fallbackMessage}`,
      );
    }
  }
}
