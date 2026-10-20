import * as THREE from 'three'

/**
 * WebGPURenderer does not support THREE.LineLoop (WEBCAD-167).
 *
 * Append a clone of the first point and draw a normal Line. The WebGL output is the
 * same closed shape, and both backends can render it.
 */
export function createClosedLine(
  points: readonly THREE.Vector3[],
  material: THREE.Material,
): THREE.Line {
  const closed = points.length > 0 ? [...points, points[0].clone()] : []
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(closed), material)
}
