import * as THREE from "three"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { RendererKind } from "./RendererBackend"
import { buildEdgeColors, type EdgeSegments } from "./EdgeGeometry"

export interface EdgeLayerOptions {
  linewidth?: number
}

export interface EdgeLayerInfo {
  materialType: string
  linewidth: number
  segmentCount: number
  selectedEdge: number | null
  /** Segments the selected edge covers; proves a curved edge is not a chord. */
  selectedSegmentCount: number
  resolution: [number, number]
}

export interface EdgeOutlineInfo extends EdgeLayerInfo {
  present: boolean
  visible: boolean
}

export interface EdgeLayerHandle {
  /** `LineSegments2` on WebGL, its `lines/webgpu` twin on WebGPU. */
  object: THREE.Mesh
  setResolution(width: number, height: number): void
  setSelected(selectedEdgeIndex: number | null): void
  getInfo(): EdgeLayerInfo
}

export type WebGPUEdgeLayerFactory = (
  segments: EdgeSegments,
  opts: EdgeLayerOptions,
) => EdgeLayerHandle

let webgpuFactory: WebGPUEdgeLayerFactory | null = null

/**
 * Registered by the WebGPU backend module in WEBCAD-169.
 *
 * The indirection keeps `three/webgpu` out of the main bundle: a static import
 * would ship the node renderer to every WebGL user, and the WebGL path is the
 * only one that ships today.
 */
export function registerWebGPUEdgeLayerFactory(
  factory: WebGPUEdgeLayerFactory | null,
): void {
  webgpuFactory = factory
}

export function createEdgeLayer(
  kind: RendererKind,
  segments: EdgeSegments,
  opts: EdgeLayerOptions = {},
): EdgeLayerHandle {
  if (kind === 'webgl') return createWebGLEdgeLayer(segments, opts)
  if (!webgpuFactory) {
    throw new Error(
      'WebGPU edge layer requested before its provider was registered (WEBCAD-169)',
    )
  }
  return webgpuFactory(segments, opts)
}

function createWebGLEdgeLayer(
  segments: EdgeSegments,
  opts: EdgeLayerOptions,
): EdgeLayerHandle {
  const linewidth = opts.linewidth ?? 2

  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(segments.positions)
  geometry.setColors(buildEdgeColors(segments, null))

  const material = new LineMaterial({
    color: 0xffffff,     // multiplied by the per-segment vertex colours
    linewidth,
    vertexColors: true,
    worldUnits: false,
    depthTest: true,
    depthWrite: false,
  })

  const object = new LineSegments2(geometry, material)
  object.name = 'edgeOutline'

  let selected: number | null = null
  let resolution: [number, number] = [0, 0]
  const colorScratch = new Float32Array(segments.segmentCount * 6)

  return {
    object,
    setResolution(width, height) {
      resolution = [width, height]
      material.resolution.set(width, height)
    },
    setSelected(edgeIndex) {
      selected = edgeIndex
      // setColors() allocates a fresh interleaved buffer every call, and this
      // runs on hover, so write into the existing one instead.
      const colorStart = geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute
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
        linewidth,
        segmentCount: segments.segmentCount,
        selectedEdge: selected,
        selectedSegmentCount: selectedRange?.count ?? 0,
        resolution,
      }
    },
  }
}
