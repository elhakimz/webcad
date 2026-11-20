import * as THREE from "three"
import { PointsNodeMaterial } from "three/webgpu"

export interface ScreenSpacePointOptions {
  color: number
  size: number
  map?: THREE.Texture
  transparent?: boolean
  alphaTest?: number
}

/**
 * A fixed-screen-size point marker that works on both backends (WEBCAD-169).
 *
 * WebGPU cannot size point primitives larger than one pixel, so `PointsMaterial`
 * silently stops drawing markers on that backend. `PointsNodeMaterial` honours
 * `size` when it is attached to a `Sprite`, but the sprite quad itself still has
 * the object's world scale. Setting that scale to zero leaves only the material's
 * screen-space size, which is exactly what the old points did.
 *
 * Display-only: markers are not picking targets, so raycasting is a no-op and
 * frustum culling is disabled (the degenerate-scale bounding sphere is not useful).
 */
export function createScreenSpacePoint(options: ScreenSpacePointOptions): THREE.Sprite {
  const parameters: ConstructorParameters<typeof PointsNodeMaterial>[0] = {
    color: options.color,
    size: options.size,
    sizeAttenuation: false,
    transparent: options.transparent ?? false,
    alphaTest: options.alphaTest ?? 0,
  }
  if (options.map) parameters.map = options.map

  const material = new PointsNodeMaterial(parameters)

  // Sprite's default geometry is a module-level singleton shared by every
  // sprite in every renderer. That is fine for one backend, but two live
  // renderers (the material audit runs WebGL and WebGPU side by side) both
  // upload and track the same interleaved buffer, and one can dispose it while
  // the other still has a submit in flight. A tiny per-marker quad removes the
  // cross-renderer ownership problem.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
     0.5, -0.5, 0,
     0.5,  0.5, 0,
    -0.5,  0.5, 0,
  ], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
  ], 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3])

  const marker = new THREE.Sprite(material)
  marker.geometry = geometry
  marker.scale.set(0, 0, 1)
  marker.frustumCulled = false
  marker.raycast = () => {}
  return marker
}
