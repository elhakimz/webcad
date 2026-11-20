import * as THREE from "three"
import { WebGPURenderer } from "three/webgpu"
import { DEVICE_LOST_EVENT, type DeviceLostInfo } from "./RendererBackend"
import { createWebGPUEdgeLayer } from "./WebGPUEdgeLayer"
import { registerWebGPUEdgeLayerFactory } from "./EdgeLayer"

/**
 * Build the real WebGPU backend and wait until it can draw (WEBCAD-169).
 *
 * `WebGPURenderer` silently swaps in its internal `WebGLBackend` when WebGPU
 * cannot be initialised. Reporting that as WebGPU would make a broken run look
 * successful, so the factory checks the backend three actually selected and
 * throws instead; `createRenderer()` then performs a real WebGL fallback and
 * records why.
 */
export async function createWebGPURenderer(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({ canvas, antialias: true })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  try {
    await renderer.init()
  } catch (error) {
    renderer.dispose()
    throw error
  }

  const backend = renderer.backend as { isWebGLBackend?: boolean }
  if (backend.isWebGLBackend) {
    renderer.dispose()
    throw new Error(
      'WebGPU requested, but three fell back to its internal WebGL2 backend',
    )
  }

  registerWebGPUEdgeLayerFactory(createWebGPUEdgeLayer)

  const emitDeviceLost = (detail: DeviceLostInfo) => {
    window.dispatchEvent(new CustomEvent<DeviceLostInfo>(DEVICE_LOST_EVENT, { detail }))
  }

  // Keep three's default logging and add the app-level signal. The viewer owns
  // the visible degraded state; this module only reports the fact.
  const originalOnDeviceLost = renderer.onDeviceLost
  renderer.onDeviceLost = (info) => {
    originalOnDeviceLost.call(renderer, info)
    emitDeviceLost({
      api: info.api,
      message: info.message,
      reason: info.reason ?? null,
    })
  }

  // three deliberately ignores `reason === 'destroyed'`, because that is the
  // normal `dispose()` path. The test bridge destroys the device directly to
  // exercise the degradation policy, so observe that reason too — but only
  // while the renderer is still live.
  let disposed = false
  const originalDispose = renderer.dispose.bind(renderer)
  renderer.dispose = () => {
    disposed = true
    originalDispose()
  }

  const device = (renderer.backend as { device?: GPUDevice | null }).device
  device?.lost.then((info) => {
    if (disposed || info.reason !== 'destroyed') return
    emitDeviceLost({
      api: 'WebGPU',
      message: info.message || 'Device was destroyed',
      reason: info.reason,
    })
  })

  return renderer
}
