/**
 * Segment buffers for the fat edge layer (WEBCAD-174).
 *
 * Pure on purpose: the mapping from `Solid3D.edgeLines` (flat xyz triples, one
 * array per topological edge) to `LineSegmentsGeometry` pairs is the only real
 * logic in the outline replacement, so it is testable without a GPU context.
 */

export interface EdgeRange {
  /** Index into `Solid3D.edgeLines`, including edges skipped as degenerate. */
  edgeIndex: number;
  /** First segment in the interleaved position buffer. */
  start: number;
  /** Number of segments this edge contributed. */
  count: number;
}

export interface EdgeSegments {
  /** Six floats per segment: start xyz, end xyz. */
  positions: number[];
  edgeRanges: EdgeRange[];
  segmentCount: number;
}

export interface Vec3Like { x: number; y: number; z: number }

/** sRGB → linear, matching `THREE.ColorManagement` for an 8-bit UI colour. */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * `#ffa500`, the same cue `Viewer.highlightEdge()` uses today.
 *
 * Stored linear: `LineMaterial` multiplies raw `instanceColor` values into the
 * shader without an sRGB decode, so the naive `[1, 165/255, 0]` would render as
 * a washed-out #ffd300.
 */
export const SELECTED_EDGE_COLOR: [number, number, number] = [
  1,
  srgbToLinear(165 / 255),
  0,
];

const BLACK: [number, number, number] = [0, 0, 0];

export function buildEdgeSegments(
  edgeLines: number[][],
  center: Vec3Like = { x: 0, y: 0, z: 0 },
): EdgeSegments {
  const positions: number[] = [];
  const edgeRanges: EdgeRange[] = [];
  let segmentCount = 0;

  edgeLines.forEach((pts, edgeIndex) => {
    if (!pts || pts.length < 6) return;

    const start = segmentCount;
    for (let i = 0; i + 5 < pts.length; i += 3) {
      positions.push(
        pts[i] - center.x,
        pts[i + 1] - center.y,
        pts[i + 2] - center.z,
        pts[i + 3] - center.x,
        pts[i + 4] - center.y,
        pts[i + 5] - center.z,
      );
      segmentCount += 1;
    }
    if (segmentCount > start) {
      edgeRanges.push({ edgeIndex, start, count: segmentCount - start });
    }
  });

  return { positions, edgeRanges, segmentCount };
}

/**
 * Segments from a flat list of line pairs — the `EdgesGeometry` fallback used
 * when the kernel returns no BRep edges.
 *
 * `edgeRanges` stays empty on purpose: these lines carry no `edgeIndex`, so
 * nothing can be selected on them and they only need to be drawn.
 */
export function segmentsFromPositions(
  positions: ArrayLike<number>,
  center: Vec3Like = { x: 0, y: 0, z: 0 },
): EdgeSegments {
  const out: number[] = [];
  let segmentCount = 0;

  for (let i = 0; i + 5 < positions.length; i += 6) {
    out.push(
      positions[i] - center.x,
      positions[i + 1] - center.y,
      positions[i + 2] - center.z,
      positions[i + 3] - center.x,
      positions[i + 4] - center.y,
      positions[i + 5] - center.z,
    );
    segmentCount += 1;
  }

  return { positions: out, edgeRanges: [], segmentCount };
}

export function buildEdgeColors(
  segments: Pick<EdgeSegments, 'edgeRanges' | 'segmentCount'>,
  selectedEdgeIndex: number | null,
  out?: Float32Array,
): Float32Array {
  const length = segments.segmentCount * 6;
  const colors = out && out.length === length ? out : new Float32Array(length);

  for (let s = 0; s < segments.segmentCount; s += 1) {
    colors[s * 6] = BLACK[0];
    colors[s * 6 + 1] = BLACK[1];
    colors[s * 6 + 2] = BLACK[2];
    colors[s * 6 + 3] = BLACK[0];
    colors[s * 6 + 4] = BLACK[1];
    colors[s * 6 + 5] = BLACK[2];
  }

  if (selectedEdgeIndex !== null) {
    const range = segments.edgeRanges.find((r) => r.edgeIndex === selectedEdgeIndex);
    if (range) {
      const [r, g, b] = SELECTED_EDGE_COLOR;
      for (let s = range.start; s < range.start + range.count; s += 1) {
        colors[s * 6] = r;
        colors[s * 6 + 1] = g;
        colors[s * 6 + 2] = b;
        colors[s * 6 + 3] = r;
        colors[s * 6 + 4] = g;
        colors[s * 6 + 5] = b;
      }
    }
  }

  return colors;
}
