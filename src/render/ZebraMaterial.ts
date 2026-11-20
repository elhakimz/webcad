import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { WebGLNodesHandler } from 'three/examples/jsm/tsl/WebGLNodesHandler.js'
import { normalView, positionView, reflect, sin, step, vec3 } from 'three/tsl'

const ZEBRA_FREQUENCY = 30

/**
 * The only zebra definition (WEBCAD-166).
 *
 * Translation of the old GLSL:
 *   viewDir    = normalize(-mvPosition.xyz)   -> positionView.normalize()
 *   reflectDir = reflect(-viewDir, normal)    -> reflect(incident, normalView)
 *   stripe     = step(0, sin((r.y + r.x*0.3) * 30))
 *
 * `positionViewDirection` is deliberately not used: the viewport camera is
 * orthographic, where TSL returns a constant (0,0,1) instead of the
 * per-fragment vector the old shader used.
 */
export function createZebraMaterial(): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide })
  material.name = 'ZebraSurface'

  const incident = positionView.normalize()
  const reflected = reflect(incident, normalView)
  const signal = sin(reflected.y.add(reflected.x.mul(0.3)).mul(ZEBRA_FREQUENCY))
  material.colorNode = vec3(step(0, signal))

  return material
}

/**
 * Teach a classic WebGLRenderer to build TSL node materials. A future
 * WebGPURenderer needs no handler and never calls this.
 */
export function enableNodeMaterials(renderer: THREE.WebGLRenderer): void {
  renderer.setNodesHandler(new WebGLNodesHandler())
}
