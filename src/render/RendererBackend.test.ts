import { describe, it, expect, afterEach } from 'vitest';
import {
  chooseRenderer,
  createRenderer,
  requestedRendererKind,
  isWebGPUAvailable,
  type RendererBackend,
} from './RendererBackend';

/**
 * Backend selection (WEBCAD-162).
 *
 * These cover the decision logic only. Constructing a real WebGLRenderer needs a GPU
 * context that node does not have, so the WebGL branch is exercised in the browser by
 * the e2e suite (`camera.spec.ts` asserts the active backend through the bridge).
 */

const withGpu = (gpu: unknown) => {
  Object.defineProperty(globalThis, 'navigator', {
    value: gpu === undefined ? {} : { gpu },
    configurable: true,
    writable: true,
  });
};

describe('requestedRendererKind', () => {
  it('defaults to webgl when no flag is present', () => {
    expect(requestedRendererKind('')).toBe('webgl');
    expect(requestedRendererKind('?foo=bar')).toBe('webgl');
  });

  it('honours ?renderer=webgpu', () => {
    expect(requestedRendererKind('?renderer=webgpu')).toBe('webgpu');
  });

  it('honours ?renderer=webgl, so the fallback path can be forced on a capable machine', () => {
    expect(requestedRendererKind('?renderer=webgl')).toBe('webgl');
  });

  it('treats an unrecognised value as webgl rather than throwing', () => {
    expect(requestedRendererKind('?renderer=vulkan')).toBe('webgl');
  });
});

describe('chooseRenderer fallback', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('reports a missing navigator.gpu as the reason, not a crash', async () => {
    withGpu(undefined);
    expect(isWebGPUAvailable()).toBe(false);

    const sel = await chooseRenderer('webgpu');
    expect(sel.kind).toBe('webgl');
    expect(sel.requested).toBe('webgpu');
    expect(sel.fellBack).toBe(true);
    expect(sel.reason).toMatch(/navigator\.gpu/);
  });

  it('falls back when an adapter cannot be obtained despite navigator.gpu existing', async () => {
    // The case feature detection cannot see: the API is there, the adapter is not.
    withGpu({ requestAdapter: async () => null });

    const sel = await chooseRenderer('webgpu');
    expect(sel.kind).toBe('webgl');
    expect(sel.fellBack).toBe(true);
    expect(sel.reason).toMatch(/no adapter/i);
  });

  it('falls back when requestAdapter rejects', async () => {
    withGpu({
      requestAdapter: async () => {
        throw new Error('device lost');
      },
    });

    const sel = await chooseRenderer('webgpu');
    expect(sel.kind).toBe('webgl');
    expect(sel.fellBack).toBe(true);
    expect(sel.reason).toContain('device lost');
  });

  it('selects WebGPU when an adapter is available', async () => {
    withGpu({ requestAdapter: async () => ({}) });

    const sel = await chooseRenderer('webgpu');
    expect(sel.kind).toBe('webgpu');
    expect(sel.requested).toBe('webgpu');
    expect(sel.fellBack).toBe(false);
    expect(sel.reason).toMatch(/adapter is available/i);
  });

  it('never reports fellBack for a plain WebGL request', async () => {
    withGpu(undefined);
    const sel = await chooseRenderer('webgl');
    expect(sel.fellBack).toBe(false);
    expect(sel.reason).toBe('WebGL requested');
  });
});

describe('createRenderer', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  const fakeBackend = (): RendererBackend => ({
    domElement: {} as HTMLCanvasElement,
    shadowMap: { enabled: false, type: 0 },
    info: { render: { calls: 0, triangles: 0 } },
    setPixelRatio() {},
    getPixelRatio() { return 1; },
    setSize() {},
    render() {},
    dispose() {},
  });

  const canvas = {} as HTMLCanvasElement;

  it('keeps a successfully initialised WebGPU backend', async () => {
    withGpu({ requestAdapter: async () => ({}) });
    const backend = fakeBackend();

    const sel = await createRenderer(canvas, 'webgpu', {
      webgpu: async () => backend,
      webgl: () => { throw new Error('WebGL must not be built'); },
    });

    expect(sel.renderer).toBe(backend);
    expect(sel.kind).toBe('webgpu');
    expect(sel.fellBack).toBe(false);
  });

  it('falls back to WebGL and carries the init error in the reason', async () => {
    withGpu({ requestAdapter: async () => ({}) });
    const backend = fakeBackend();

    const sel = await createRenderer(canvas, 'webgpu', {
      webgpu: async () => { throw new Error('no device'); },
      webgl: () => backend,
    });

    expect(sel.renderer).toBe(backend);
    expect(sel.kind).toBe('webgl');
    expect(sel.requested).toBe('webgpu');
    expect(sel.fellBack).toBe(true);
    expect(sel.reason).toContain('no device');
  });

  it('names both failures when even the WebGL fallback cannot start', async () => {
    withGpu({ requestAdapter: async () => ({}) });

    await expect(createRenderer(canvas, 'webgpu', {
      webgpu: async () => { throw new Error('no device'); },
      webgl: () => { throw new Error('no context'); },
    })).rejects.toThrow(/no device[\s\S]*no context/);
  });
});
