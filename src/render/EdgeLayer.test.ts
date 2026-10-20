import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildEdgeSegments } from './EdgeGeometry';
import {
  createEdgeLayer,
  registerWebGPUEdgeLayerFactory,
  type EdgeLayerHandle,
} from './EdgeLayer';

const twoEdges = [
  [0, 0, 0, 10, 0, 0],
  [10, 0, 0, 10, 10, 0],
];

function colourBuffer(layer: EdgeLayerHandle): Float32Array {
  const geometry = (layer.object as THREE.Mesh).geometry as THREE.BufferGeometry;
  const attr = geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute;
  return attr.data.array as Float32Array;
}

beforeEach(() => {
  registerWebGPUEdgeLayerFactory(null);
});

describe('createEdgeLayer (webgl)', () => {
  it('builds a LineSegments2 carrying the expected material and segment count', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges), { linewidth: 2 });

    expect(layer.object.type).toBe('LineSegments2');
    expect(layer.getInfo()).toMatchObject({
      materialType: 'LineMaterial',
      linewidth: 2,
      segmentCount: 2,
      selectedEdge: null,
    });
  });

  it('writes the selected edge into the shared colour buffer without rebuilding geometry', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));
    const before = colourBuffer(layer);

    layer.setSelected(1);

    expect(colourBuffer(layer)).toBe(before);
    expect(before[0]).toBe(0);
    expect(before[6]).toBeCloseTo(1, 6);
    expect(before[7]).toBeCloseTo(165 / 255, 6);
    expect(layer.getInfo().selectedEdge).toBe(1);
  });

  it('clears the selection back to black', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));
    layer.setSelected(1);
    layer.setSelected(null);

    expect(Array.from(colourBuffer(layer)).every((v) => v === 0)).toBe(true);
    expect(layer.getInfo().selectedEdge).toBeNull();
  });

  it('stores the resolution LineMaterial needs after a resize', () => {
    const layer = createEdgeLayer('webgl', buildEdgeSegments(twoEdges));

    layer.setResolution(800, 600);

    expect(layer.getInfo().resolution).toEqual([800, 600]);
  });
});

describe('createEdgeLayer (webgpu provider)', () => {
  it('throws a named error before the WebGPU provider is registered', () => {
    expect(() => createEdgeLayer('webgpu', buildEdgeSegments(twoEdges))).toThrow(/WEBCAD-169/);
  });

  it('delegates to the registered provider and forwards resolution calls', () => {
    let resolution: [number, number] = [0, 0];
    let selected: number | null = null;

    registerWebGPUEdgeLayerFactory(() => ({
      object: new THREE.Mesh(),
      setResolution: (w, h) => { resolution = [w, h]; },
      setSelected: (index) => { selected = index; },
      getInfo: () => ({
        materialType: 'Line2NodeMaterial',
        linewidth: 2,
        edgeCount: 2,
        segmentCount: 2,
        selectedEdge: selected,
        selectedSegmentCount: 1,
        resolution,
      }),
    }));

    const layer = createEdgeLayer('webgpu', buildEdgeSegments(twoEdges));
    layer.setResolution(1024, 768);
    layer.setSelected(0);

    expect(layer.getInfo().materialType).toBe('Line2NodeMaterial');
    expect(resolution).toEqual([1024, 768]);
    expect(selected).toBe(0);
  });
});
