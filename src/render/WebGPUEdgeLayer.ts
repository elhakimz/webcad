import * as THREE from "three"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { LineSegments2 } from "three/examples/jsm/lines/webgpu/LineSegments2.js"
import { Line2NodeMaterial } from "three/webgpu"
import { buildEdgeColors, type EdgeSegments } from "./EdgeGeometry"
import type { EdgeLayerHandle, EdgeLayerOptions } from "./EdgeLayer"

/**
 * WebGPU twin of the WebGL fat-line edge layer (WEBCAD-169, seam from WEBCAD-174).
 *
 * `Line2NodeMaterial` has no `resolution` uniform: the node shader reads the
 * renderer viewport. `setResolution()` therefore only records the drawing-buffer
 * size for `getInfo()`; keeping the API identical is what lets `Viewer.resize()`
 * stay backend-neutral.
 */
export function createWebGPUEdgeLayer(
  segments: EdgeSegments,
  opts: EdgeLayerOptions = {},
): EdgeLayerHandle {
  const linewidth = opts.linewidth ?? 2

  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(segments.positions)
  geometry.setColors(buildEdgeColors(segments, null))

  const material = new Line2NodeMaterial({
    color: 0xffffff, // multiplied by the per-segment vertex colours
    linewidth,
    vertexColors: true,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
  })

  const object = new LineSegments2(geometry, material)
  object.name = "edgeOutline"

  let selected: number | null = null
  let resolution: [number, number] = [1, 1]
  const colorScratch = new Float32Array(segments.segmentCount * 6)

  return {
    object,
    setResolution(width, height) {
      resolution = [Math.max(1, width), Math.max(1, height)]
    },
    setSelected(edgeIndex) {
      if (edgeIndex === selected) return
      selected = edgeIndex
      // Same in-place update as the WebGL provider: this runs on hover.
      const colorStart = geometry.getAttribute("instanceColorStart") as THREE.InterleavedBufferAttribute
      const buffer = colorStart.data as THREE.InterleavedBuffer
      ;(buffer.array as Float32Array).set(buildEdgeColors(segments, edgeIndex, colorScratch))
      buffer.needsUpdate = true
    },
    getInfo() {
      const selectedRange = selected === null
        ? undefined
        : segments.edgeRanges.find((range) => range.edgeIndex === selected)
      return {
        materialType: material.type,
        linewidth: material.linewidth,
        edgeCount: segments.edgeRanges.length,
        segmentCount: segments.segmentCount,
        selectedEdge: selected,
        selectedSegmentCount: selectedRange?.count ?? 0,
        resolution,
      }
    },
  }
}
