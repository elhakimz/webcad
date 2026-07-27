import * as THREE from "three"

/**
 * The renderer seam (WEBCAD-161).
 *
 * `Viewer` used to declare its renderer as the concrete `THREE.WebGLRenderer`, so
 * swapping the backend meant touching every consumer. This is the surface the
 * application actually uses — five members, deliberately no more. Both
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
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  dispose(): void;
}

export type RendererKind = 'webgl' | 'webgpu';

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
 * The WebGPU branch is not wired up yet and says so instead of pretending: three r160
 * has no first-class `three/webgpu` entry point, and `OutlineEffect` — which draws
 * every shaded frame — is WebGL-only. Both are gated on WEBCAD-164. Until then this
 * chooses WebGL with a stated reason, which is the same shape the real fallback takes.
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

  return webgl(
    'WebGPU adapter is available, but the renderer is not wired up yet — blocked on the ' +
      'three.js upgrade (WEBCAD-164) and the OutlineEffect replacement (WEBCAD-174)',
  );
}

/** Decide, then build. The result is handed to the `Viewer` constructor ready to draw. */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  requested: RendererKind = requestedRendererKind(),
): Promise<RendererSelection> {
  const choice = await chooseRenderer(requested);
  // Only one branch today; `choice.kind` is what selects it once WEBCAD-169 lands.
  return { ...choice, renderer: createWebGLRenderer(canvas) };
}
