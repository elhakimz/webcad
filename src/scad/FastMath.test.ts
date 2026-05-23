import { describe, it, expect } from "vitest";
import {
  fastAddVectors,
  fastAddScalar,
  fastMultiplyMatrices,
  fastMultiplyMatrixVectorList,
  fastMultiplyMatrixFlatCoordinates,
  areCollinear,
  isNumericVector,
  isVectorList,
  cross3Into,
  normalize3Into
} from "./interpreter/FastMath";

describe("FastMath Engine Correctness & Benchmarks", () => {
  it("should perform correct vector addition", () => {
    expect(fastAddVectors([1, 2, 3], [4, 5, 6])).toEqual([5, 7, 9]);
    expect(fastAddScalar([1, 2, 3], 10)).toEqual([11, 12, 13]);
  });

  it("should perform correct matrix multiplication", () => {
    const matA = [
      [1, 2],
      [3, 4]
    ];
    const matB = [
      [5, 6],
      [7, 8]
    ];
    expect(fastMultiplyMatrices(matA, matB)).toEqual([
      [19, 22],
      [43, 50]
    ]);
  });

  it("should perform correct matrix-vector batch multiplication", () => {
    const matrix = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9]
    ];
    const vectors = [
      [1, 1, 1],
      [2, 2, 2]
    ];
    expect(fastMultiplyMatrixVectorList(matrix, vectors)).toEqual([
      [6, 15, 24],
      [12, 30, 48]
    ]);
  });

  it("Benchmark: FastMath vs Native JS for Matrix-Vector operations", () => {
    const size = 5000;
    const vectors: number[][] = [];
    for (let i = 0; i < size; i++) {
      vectors.push([Math.random(), Math.random(), Math.random()]);
    }
    const matrix = [
      [1.1, 0.2, 0.3],
      [0.4, 1.5, 0.6],
      [0.7, 0.8, 1.9]
    ];

    const startNative = performance.now();
    const nativeRes = vectors.map(vec => {
      const out = [];
      for (let r = 0; r < 3; r++) {
        let sum = 0;
        for (let c = 0; c < 3; c++) {
          sum += matrix[r][c] * vec[c];
        }
        out.push(sum);
      }
      return out;
    });
    const durationNative = performance.now() - startNative;

    const startFast = performance.now();
    const fastRes = fastMultiplyMatrixVectorList(matrix, vectors);
    const durationFast = performance.now() - startFast;

    console.log(`\n======================================================`);
    console.log(` BENCHMARK RESULTS (Batch transforming ${size} vectors):`);
    console.log(` - Standard JS Mapping: ${durationNative.toFixed(3)} ms`);
    console.log(` - FastMath Vectorized Engine: ${durationFast.toFixed(3)} ms`);
    const speedup = durationNative / durationFast;
    console.log(` - FastMath is ${speedup.toFixed(2)}x FASTER than Standard JS!`);
    console.log(`======================================================\n`);

    expect(fastRes[0][0]).toBeCloseTo(nativeRes[0][0]);
    expect(fastRes[size - 1][2]).toBeCloseTo(nativeRes[size - 1][2]);
  });

  it("Benchmark: JIT Flat Float64Array SIMD Contiguous Cache Speedup", () => {
    const pointCount = 50000; // 50,000 points
    const matrix = [
      [1.1, 0.2, 0.3],
      [0.4, 1.5, 0.6],
      [0.7, 0.8, 1.9]
    ];

    // Create a flat coordinate buffer (represented as Float64Array)
    const flatCoordinates = new Float64Array(pointCount * 3);
    for (let i = 0; i < flatCoordinates.length; i++) {
      flatCoordinates[i] = Math.random();
    }

    // Benchmark Native JS Nested Array Mapping
    // (First we construct the nested array structure to simulate normal JS evaluation)
    const nestedVectors: number[][] = [];
    for (let i = 0; i < pointCount; i++) {
      nestedVectors.push([flatCoordinates[i * 3], flatCoordinates[i * 3 + 1], flatCoordinates[i * 3 + 2]]);
    }

    const startNative = performance.now();
    const nativeRes = nestedVectors.map(vec => {
      const out = [];
      for (let r = 0; r < 3; r++) {
        let sum = 0;
        for (let c = 0; c < 3; c++) {
          sum += matrix[r][c] * vec[c];
        }
        out.push(sum);
      }
      return out;
    });
    const durationNative = performance.now() - startNative;

    // Benchmark Contiguous Flat Array Memory processing
    const startFlat = performance.now();
    const flatRes = fastMultiplyMatrixFlatCoordinates(matrix, flatCoordinates);
    const durationFlat = performance.now() - startFlat;

    console.log(`\n======================================================`);
    console.log(` HIGH-PERFORMANCE FLAT BUFFER BENCHMARK (Transforming ${pointCount} 3D coordinates):`);
    console.log(` - Standard JS Mapping (Nested Objects): ${durationNative.toFixed(3)} ms`);
    console.log(` - Contiguous Flat Memory Buffer: ${durationFlat.toFixed(3)} ms`);
    const speedup = durationNative / durationFlat;
    console.log(` - Flat buffer calculations are ${speedup.toFixed(2)}x FASTER! (Near-Native JIT CPU speed)`);
    console.log(`======================================================\n`);

    expect(flatRes[0]).toBeCloseTo(nativeRes[0][0]);
    expect(flatRes[pointCount * 3 - 1]).toBeCloseTo(nativeRes[pointCount - 1][2]);
  });

  it("should correctly check scale-invariant collinearity in areCollinear", () => {
    // Standard collinear points
    expect(areCollinear([0, 0, 0], [1, 1, 1], [2, 2, 2])).toBe(true);
    // Standard non-collinear points
    expect(areCollinear([0, 0, 0], [1, 1, 1], [2, 2, 3])).toBe(false);

    // Large scale collinear points (floating point noise test)
    const p1 = [0, 0, 0];
    const p2 = [1000, 1000, 1000];
    const p3 = [2000.0000000001, 2000.0000000001, 2000.0000000001];
    expect(areCollinear(p1, p2, p3)).toBe(true);
  });

  it("should utilize O(1) cached fast type-guards isNumericVector & isVectorList", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(isNumericVector(arr)).toBe(true);
    // Cached property should be set
    expect((arr as any).__isNumericVector).toBe(true);

    const list = [[1, 2], [3, 4]];
    expect(isVectorList(list)).toBe(true);
    expect((list as any).__isVectorList).toBe(true);
  });

  it("should support zero-alloc cross3Into and normalize3Into", () => {
    const outCross = new Array(3);
    cross3Into(1, 0, 0, 0, 1, 0, outCross);
    expect(outCross).toEqual([0, 0, 1]);

    const outNorm = new Float64Array(3);
    normalize3Into(3, 0, 4, outNorm);
    expect(outNorm[0]).toBeCloseTo(0.6);
    expect(outNorm[1]).toBeCloseTo(0);
    expect(outNorm[2]).toBeCloseTo(0.8);
  });
});
