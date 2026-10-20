import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { buildEdgeSegments, SELECTED_EDGE_COLOR } from "./EdgeGeometry"
import { createWebGPUEdgeLayer } from "./WebGPUEdgeLayer"

const twoEdges = [
  [0, 0, 0, 10, 0, 0],
  [10, 0, 0, 10, 10, 0],
]

function colourBuffer(geometry: THREE.BufferGeometry): Float32Array {
  const attr = geometry.getAttribute("instanceColorStart") as THREE.InterleavedBufferAttribute
  return attr.data.array as Float32Array
}

describe("createWebGPUEdgeLayer", () => {
  it("builds a node-material LineSegments2 carrying the expected edge count", () => {
    const layer = createWebGPUEdgeLayer(buildEdgeSegments(twoEdges), { linewidth: 2 })

    expect(layer.object.type).toBe("LineSegments2")
    expect(layer.getInfo()).toMatchObject({
      materialType: "Line2NodeMaterial",
      linewidth: 2,
      edgeCount: 2,
      segmentCount: 2,
      selectedEdge: null,
    })
  })

  it("writes the selected edge into the shared colour buffer without rebuilding geometry", () => {
    const layer = createWebGPUEdgeLayer(buildEdgeSegments(twoEdges))
    const geometry = (layer.object as THREE.Mesh).geometry as THREE.BufferGeometry
    const before = colourBuffer(geometry)

    layer.setSelected(1)

    expect(colourBuffer(geometry)).toBe(before)
    expect(before[0]).toBe(0)
    expect(before[6]).toBeCloseTo(1, 6)
    expect(before[7]).toBeCloseTo(SELECTED_EDGE_COLOR[1], 6)
    expect(layer.getInfo().selectedEdge).toBe(1)
  })

  it("clears the selection back to black", () => {
    const layer = createWebGPUEdgeLayer(buildEdgeSegments(twoEdges))
    layer.setSelected(1)
    layer.setSelected(null)

    const geometry = (layer.object as THREE.Mesh).geometry as THREE.BufferGeometry
    expect(Array.from(colourBuffer(geometry)).every((v) => v === 0)).toBe(true)
    expect(layer.getInfo().selectedEdge).toBeNull()
  })

  it("tracks the drawing-buffer resolution for diagnostics", () => {
    const layer = createWebGPUEdgeLayer(buildEdgeSegments(twoEdges))

    layer.setResolution(800, 600)

    expect(layer.getInfo().resolution).toEqual([800, 600])
  })

  it("never stores a zero resolution", () => {
    const layer = createWebGPUEdgeLayer(buildEdgeSegments(twoEdges))

    layer.setResolution(0, 0)

    expect(layer.getInfo().resolution).toEqual([1, 1])
  })
})
