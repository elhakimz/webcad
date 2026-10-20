import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createClosedLine } from './ClosedLine'

describe('createClosedLine', () => {
  it('returns a Line with the first point repeated at the end', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]
    const line = createClosedLine(points, new THREE.LineBasicMaterial())

    expect(line).toBeInstanceOf(THREE.Line)
    expect(line.type).toBe('Line')

    const position = line.geometry.getAttribute('position')
    expect(position.count).toBe(4)
    expect(position.getX(3)).toBe(0)
    expect(position.getY(3)).toBe(0)
    expect(position.getZ(3)).toBe(0)
  })

  it('does not mutate the source array', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 10, 0),
    ]
    createClosedLine(points, new THREE.LineBasicMaterial())
    expect(points).toHaveLength(3)
  })

  it('handles an empty point list without throwing', () => {
    const line = createClosedLine([], new THREE.LineBasicMaterial())
    expect(line.geometry.getAttribute('position').count).toBe(0)
  })
})
