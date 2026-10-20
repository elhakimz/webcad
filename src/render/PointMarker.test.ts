import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { createScreenSpacePoint } from "./PointMarker"

describe("createScreenSpacePoint", () => {
  it("uses a zero-scale Sprite so the material size is the whole marker", () => {
    const marker = createScreenSpacePoint({ color: 0x00ffff, size: 12 })

    expect(marker).toBeInstanceOf(THREE.Sprite)
    expect(marker.material.type).toBe("PointsNodeMaterial")
    expect((marker.material as unknown as THREE.PointsMaterial).size).toBe(12)
    expect((marker.material as unknown as THREE.PointsMaterial).sizeAttenuation).toBe(false)
    expect(marker.scale.toArray()).toEqual([0, 0, 1])
    expect(marker.frustumCulled).toBe(false)
  })

  it("carries the map and alpha settings used by the X marker", () => {
    const map = new THREE.Texture()
    const marker = createScreenSpacePoint({
      color: 0x00ffff,
      size: 12,
      map,
      transparent: true,
      alphaTest: 0.5,
    })
    const material = marker.material as unknown as THREE.PointsMaterial

    expect(material.map).toBe(map)
    expect(material.transparent).toBe(true)
    expect(material.alphaTest).toBe(0.5)
  })

  it("does not participate in picking", () => {
    const marker = createScreenSpacePoint({ color: 0x888888, size: 6 })

    expect(marker.raycast(new THREE.Raycaster(), [])).toBeUndefined()
  })

  it("owns its quad instead of sharing three's module-level Sprite geometry", () => {
    const a = createScreenSpacePoint({ color: 0x888888, size: 6 })
    const b = createScreenSpacePoint({ color: 0x888888, size: 6 })

    expect(a.geometry).not.toBe(b.geometry)
    expect(a.geometry.getAttribute("position").count).toBe(4)
    expect(a.geometry.getIndex()?.count).toBe(6)
  })
})
