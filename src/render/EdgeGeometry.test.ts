import { describe, expect, it } from 'vitest';
import { buildEdgeColors, buildEdgeSegments, SELECTED_EDGE_COLOR } from './EdgeGeometry';

const square = [
  [0, 0, 0, 10, 0, 0],      // edge 0: one segment
  [10, 0, 0, 10, 10, 0],    // edge 1: one segment
];

describe('buildEdgeSegments', () => {
  it('expands a polyline into contiguous segments and records its range', () => {
    const result = buildEdgeSegments([[0, 0, 0, 5, 0, 0, 10, 0, 0]]);

    expect(result.segmentCount).toBe(2);
    expect(result.positions).toEqual([0, 0, 0, 5, 0, 0, 5, 0, 0, 10, 0, 0]);
    expect(result.edgeRanges).toEqual([{ edgeIndex: 0, start: 0, count: 2 }]);
  });

  it('skips a degenerate edge and keeps the original index for the next one', () => {
    const result = buildEdgeSegments([
      [0, 0, 0],                       // edge 0: one point, skipped
      [1, 0, 0, 2, 0, 0],              // edge 1
    ]);

    expect(result.segmentCount).toBe(1);
    expect(result.edgeRanges).toEqual([{ edgeIndex: 1, start: 0, count: 1 }]);
  });

  it('subtracts the solid centre so the layer can live in a centred group', () => {
    const result = buildEdgeSegments([[0, 0, 0, 20, 0, 0]], { x: 10, y: 0, z: 0 });

    expect(result.positions).toEqual([-10, 0, 0, 10, 0, 0]);
  });

  it('returns an empty result for undefined or empty edge lists', () => {
    expect(buildEdgeSegments([])).toEqual({ positions: [], edgeRanges: [], segmentCount: 0 });
  });
});

describe('buildEdgeColors', () => {
  it('paints every segment black when nothing is selected', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, null);

    expect(colors).toHaveLength(segments.segmentCount * 6);
    expect(Array.from(colors).every((v) => v === 0)).toBe(true);
  });

  it('paints exactly the selected edge orange, endpoints included', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, 1);

    // Segment 0 (edge 0) black.
    expect(Array.from(colors.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
    // Segment 1 (edge 1) orange at both ends.
    const [r, g, b] = SELECTED_EDGE_COLOR;
    expect(colors[6]).toBeCloseTo(r, 6);
    expect(colors[7]).toBeCloseTo(g, 6);
    expect(colors[8]).toBeCloseTo(b, 6);
    expect(colors[9]).toBeCloseTo(r, 6);
    expect(colors[10]).toBeCloseTo(g, 6);
    expect(colors[11]).toBeCloseTo(b, 6);
  });

  it('paints every segment of a curved edge, not just the first', () => {
    const segments = buildEdgeSegments([
      [0, 0, 0, 5, 0, 0, 5, 5, 0],   // edge 0: two segments
      [9, 9, 0, 10, 10, 0],          // edge 1: one segment
    ]);
    const colors = buildEdgeColors(segments, 0);

    for (const segment of [0, 1]) {
      expect(colors[segment * 6]).toBeCloseTo(1, 6);
      expect(colors[segment * 6 + 1]).toBeCloseTo(165 / 255, 6);
      expect(colors[segment * 6 + 2]).toBeCloseTo(0, 6);
    }
    // Edge 1 stays black.
    expect(Array.from(colors.slice(12, 18))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('ignores an edge index that does not exist', () => {
    const segments = buildEdgeSegments(square);
    const colors = buildEdgeColors(segments, 99);

    expect(Array.from(colors).every((v) => v === 0)).toBe(true);
  });

  it('reuses the caller buffer instead of allocating on every hover', () => {
    const segments = buildEdgeSegments(square);
    const out = new Float32Array(segments.segmentCount * 6);

    const colors = buildEdgeColors(segments, 0, out);

    expect(colors).toBe(out);
  });
});
