import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import type { DescMessage } from '@bufbuild/protobuf';
import {
  CommandHeaderSchema,
  MeshDataSchema,
  ExecuteFailureSchema,
  ExecutionFailureCode,
} from '../../../generated/proto/webcad/engine/v1/common_pb';
import {
  OpenSessionRequestSchema,
  OpenSessionResponseSchema,
  ServerLimitsSchema,
  HealthRequestSchema,
  HealthResponseSchema,
  InitOpSchema,
  ClearCacheOpSchema,
  ReleaseShapesOpSchema,
  CheckValidityOpSchema,
  ExportBRepOpSchema,
  CreateBoxOpSchema,
  CreateCylinderOpSchema,
  CreateSphereOpSchema,
  CreateConeOpSchema,
  CreateBooleanOpSchema,
  CreateExtrudeOpSchema,
  CreateRevolveOpSchema,
  MultMatrixShapeOpSchema,
  TransformShapeOpSchema,
} from '../../../generated/proto/webcad/engine/v1/engine_pb';
import golden from '../../../../tests/golden/messages.json';

// Helper: serialize then deserialize a message, assert deep equality
function roundTrip(schema: DescMessage, input: Record<string, unknown>): Record<string, unknown> {
  const msg = create(schema, input);
  const binary = toBinary(schema, msg);
  const decoded = fromBinary(schema, binary);
  return decoded as Record<string, unknown>;
}

describe('codec round-trip (TS)', () => {
  beforeEach(() => { });
  afterEach(() => { });

  it('CommandHeader round-trips with all fields', () => {
    const input = {
      sessionId: 'c9bf9a6e-6bbd-4c7a-bd1e-0f5a6c1b2d3e',
      requestId: 'd1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f6a',
      clientSeq: 7n,
      documentId: 'doc-42',
    };
    const decoded = roundTrip(CommandHeaderSchema, input) as { sessionId: string; requestId: string; clientSeq: bigint; documentId: string };
    expect(decoded.sessionId).toBe(input.sessionId);
    expect(decoded.requestId).toBe(input.requestId);
    expect(decoded.clientSeq).toBe(input.clientSeq);
    expect(decoded.documentId).toBe(input.documentId);
  });

  it('CommandHeader round-trips with empty fields', () => {
    const decoded = roundTrip(CommandHeaderSchema, {}) as { sessionId: string; requestId: string; clientSeq: bigint; documentId: string };
    expect(decoded.sessionId).toBe('');
    expect(decoded.requestId).toBe('');
    expect(decoded.clientSeq).toBe(0n);
    expect(decoded.documentId).toBe('');
  });

  it('CommandHeader preserves large clientSeq values', () => {
    const input = { clientSeq: 18446744073709551615n };
    const decoded = roundTrip(CommandHeaderSchema, input) as { clientSeq: bigint };
    expect(decoded.clientSeq).toBe(input.clientSeq);
  });

  it('OpenSessionRequest round-trips with all fields', () => {
    const input = {
      header: {
        sessionId: 'c9bf9a6e-6bbd-4c7a-bd1e-0f5a6c1b2d3e',
        requestId: 'd1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f6a',
        clientSeq: 1n,
        documentId: '',
      },
      clientVersion: '1.0.0',
      includeBrep: true,
    };
    const decoded = roundTrip(OpenSessionRequestSchema, input) as { header: { sessionId: string; requestId: string; clientSeq: bigint; documentId: string } | undefined; clientVersion: string; includeBrep: boolean };
    expect(decoded.header!.sessionId).toBe(input.header.sessionId);
    expect(decoded.header!.requestId).toBe(input.header.requestId);
    expect(decoded.header!.clientSeq).toBe(input.header.clientSeq);
    expect(decoded.clientVersion).toBe(input.clientVersion);
    expect(decoded.includeBrep).toBe(input.includeBrep);
  });

  it('OpenSessionRequest round-trips with empty fields', () => {
    const decoded = roundTrip(OpenSessionRequestSchema, {}) as { clientVersion: string; includeBrep: boolean; header?: { sessionId: string; requestId: string; clientSeq: bigint; documentId: string } };
    expect(decoded.clientVersion).toBe('');
    expect(decoded.includeBrep).toBe(false);
    expect(decoded.header).toBeUndefined();
  });

  it('OpenSessionResponse round-trips with all fields', () => {
    const input = {
      protocolVersion: '1.0',
      minimumClientVersion: '0.9.0',
      heartbeatInterval: 15,
      kernelVersion: 'kernel-v1',
      occtVersion: '7.9.3',
    };
    const decoded = roundTrip(OpenSessionResponseSchema, input) as { protocolVersion: string; minimumClientVersion: string; heartbeatInterval: number; kernelVersion: string; occtVersion: string; serverLimits?: unknown };
    expect(decoded.protocolVersion).toBe(input.protocolVersion);
    expect(decoded.minimumClientVersion).toBe(input.minimumClientVersion);
    expect(decoded.heartbeatInterval).toBe(input.heartbeatInterval);
    expect(decoded.kernelVersion).toBe(input.kernelVersion);
    expect(decoded.occtVersion).toBe(input.occtVersion);
  });

  it('OpenSessionResponse round-trips with empty fields', () => {
    const decoded = roundTrip(OpenSessionResponseSchema, {}) as { protocolVersion: string; minimumClientVersion: string; heartbeatInterval: number; kernelVersion: string; occtVersion: string; serverLimits?: unknown };
    expect(decoded.protocolVersion).toBe('');
    expect(decoded.minimumClientVersion).toBe('');
    expect(decoded.serverLimits).toBeUndefined();
    expect(decoded.heartbeatInterval).toBe(0);
    expect(decoded.kernelVersion).toBe('');
    expect(decoded.occtVersion).toBe('');
  });

  describe('MeshData', () => {
    it('round-trips positions, indices, faceMapping, edgeOffsets, edgeLines', () => {
      const positions = new Uint8Array([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0]);
      const indices = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0, 2]);
      const faceMapping = new Uint8Array([0, 0, 0, 0]);
      const edgeOffsets = new Uint8Array([0, 0, 0, 0]);
      const edgeLines = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0]);

      const input = {
        positions,
        indices,
        faceMapping,
        edgeOffsets,
        edgeLines,
      };
      const output = roundTrip(MeshDataSchema, input);
      expect(new Uint8Array(output.positions as Uint8Array)).toEqual(positions);
      expect(new Uint8Array(output.indices as Uint8Array)).toEqual(indices);
      expect(new Uint8Array(output.faceMapping as Uint8Array)).toEqual(faceMapping);
      expect(new Uint8Array(output.edgeOffsets as Uint8Array)).toEqual(edgeOffsets);
      expect(new Uint8Array(output.edgeLines as Uint8Array)).toEqual(edgeLines);
    });

    it('round-trips empty mesh data', () => {
      const input = {
        positions: new Uint8Array(),
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const output = roundTrip(MeshDataSchema, input);
      expect(output.positions).toEqual(new Uint8Array());
      expect(output.indices).toEqual(new Uint8Array());
    });
  });

  describe('misaligned bytes (DataView copy)', () => {
    it('copies misaligned Float32Array into fresh aligned buffer', () => {
      // Create buffer: 1 byte padding + 3 little-endian float32 values at offsets 1, 5, 9
      const buffer = new ArrayBuffer(13);
      const view = new DataView(buffer);
      view.setFloat32(1, 1.5, true);   // bytes 1-4
      view.setFloat32(5, 2.5, true);   // bytes 5-8
      view.setFloat32(9, 3.5, true);   // bytes 9-12

      // positionsBytes starts at offset 1 (misaligned for Float32Array)
      const positionsBytes = new Uint8Array(buffer, 1, 12);

      const input = {
        positions: positionsBytes,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const output = roundTrip(MeshDataSchema, input);

      const copied = new Uint8Array(output.positions as Uint8Array);
      const alignedBuffer = new ArrayBuffer(copied.length);
      const alignedView = new DataView(alignedBuffer);
      for (let i = 0; i < copied.length; i += 4) {
        alignedView.setFloat32(i, new DataView(copied.buffer, copied.byteOffset + i, 4).getFloat32(0, true), true);
      }
      const floatArray = new Float32Array(alignedBuffer);
      expect(floatArray[0]).toBeCloseTo(1.5);
      expect(floatArray[1]).toBeCloseTo(2.5);
      expect(floatArray[2]).toBeCloseTo(3.5);
    });

    it('does not crash on zero-byte misaligned field', () => {
      const input = {
        positions: new Uint8Array(),
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      expect(() => roundTrip(MeshDataSchema, input)).not.toThrow();
    });
  });

  describe('256 KiB payload boundary', () => {
    const INLINE_LIMIT = 256 * 1024;

    it('serializes payload just under 256 KiB inline', () => {
      const payload = new Uint8Array(INLINE_LIMIT - 1);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const msg = create(MeshDataSchema, input);
      const binary = toBinary(MeshDataSchema, msg);
      expect(binary.length).toBeLessThanOrEqual(INLINE_LIMIT + 100);
      const decoded = fromBinary(MeshDataSchema, binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
    });

    it('serializes payload just over 256 KiB (BlobRef path)', () => {
      const payload = new Uint8Array(INLINE_LIMIT + 1);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const msg = create(MeshDataSchema, input);
      const binary = toBinary(MeshDataSchema, msg);
      const decoded = fromBinary(MeshDataSchema, binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
      expect(decoded.positions).toHaveLength(INLINE_LIMIT + 1);
    });

    it('serializes payload exactly at 256 KiB boundary', () => {
      const payload = new Uint8Array(INLINE_LIMIT);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = i % 256;
      }
      const input = {
        positions: payload,
        indices: new Uint8Array(),
        faceMapping: new Uint8Array(),
        edgeOffsets: new Uint8Array(),
        edgeLines: new Uint8Array(),
      };
      const msg = create(MeshDataSchema, input);
      const binary = toBinary(MeshDataSchema, msg);
      const decoded = fromBinary(MeshDataSchema, binary);
      expect(new Uint8Array(decoded.positions as Uint8Array)).toEqual(payload);
      expect(decoded.positions).toHaveLength(INLINE_LIMIT);
    });
  });

  describe('ExecuteFailure', () => {
    it('round-trips all failure codes', () => {
      const codes = [
        ExecutionFailureCode.UNSPECIFIED,
        ExecutionFailureCode.MISSING_ENTITY,
        ExecutionFailureCode.INVALID_PARAMETER,
        ExecutionFailureCode.INVALID_PROFILE,
        ExecutionFailureCode.UNSUPPORTED,
        ExecutionFailureCode.OPERATION_FAILED,
        ExecutionFailureCode.GEOMETRY_EMPTY,
        ExecutionFailureCode.IMPORT_FAILED,
        ExecutionFailureCode.EXPORT_FAILED,
      ];
      for (const code of codes) {
        const input = {
          operation: 'create_box',
          code,
          message: 'test error',
          details: 'test details',
        };
        const output = roundTrip(ExecuteFailureSchema, input);
        expect(output.code).toBe(code);
        expect(output.operation).toBe('create_box');
        expect(output.message).toBe('test error');
        expect(output.details).toBe('test details');
      }
    });

    it('round-trips failure with empty details', () => {
      const input = {
        operation: 'boolean',
        code: ExecutionFailureCode.OPERATION_FAILED,
        message: 'boolean failed',
        details: '',
      };
      const output = roundTrip(ExecuteFailureSchema, input);
      expect(output.code).toBe(ExecutionFailureCode.OPERATION_FAILED);
      expect(output.details).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Golden file round-trip (shared with C++ via tests/golden/messages.json)
  // ---------------------------------------------------------------------------

  const SCHEMA_BY_TYPE: Record<string, DescMessage> = {
    CommandHeader: CommandHeaderSchema,
    MeshData: MeshDataSchema,
    ExecuteFailure: ExecuteFailureSchema,
    OpenSessionRequest: OpenSessionRequestSchema,
    OpenSessionResponse: OpenSessionResponseSchema,
    ServerLimits: ServerLimitsSchema,
    HealthRequest: HealthRequestSchema,
    HealthResponse: HealthResponseSchema,
    InitOp: InitOpSchema,
    ClearCacheOp: ClearCacheOpSchema,
    ReleaseShapesOp: ReleaseShapesOpSchema,
    CheckValidityOp: CheckValidityOpSchema,
    ExportBRepOp: ExportBRepOpSchema,
    CreateBoxOp: CreateBoxOpSchema,
    CreateCylinderOp: CreateCylinderOpSchema,
    CreateSphereOp: CreateSphereOpSchema,
    CreateConeOp: CreateConeOpSchema,
    CreateBooleanOp: CreateBooleanOpSchema,
    CreateExtrudeOp: CreateExtrudeOpSchema,
    CreateRevolveOp: CreateRevolveOpSchema,
    MultMatrixShapeOp: MultMatrixShapeOpSchema,
    TransformShapeOp: TransformShapeOpSchema,
  };

  // Fields that are protobuf `bytes` — in golden JSON they are base64 strings;
  // TS needs them as Uint8Array before passing to create().
  const BYTES_FIELDS: Record<string, Set<string>> = {
    MeshData: new Set(['positions', 'indices', 'faceMapping', 'edgeOffsets', 'edgeLines']),
  };

  // Convert bigint (uint64) values to numbers so deep equality works against
  // the JSON input (which stores them as plain numbers).
  function toComparable(value: unknown): unknown {
    if (typeof value === 'bigint') return Number(value);
    if (Array.isArray(value)) return value.map(toComparable);
    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === '$typeName') continue; // bufbuild adds this to decoded messages
        result[k] = toComparable(v);
      }
      return result;
    }
    return value;
  }

  // Preprocess golden input: convert base64 string bytes fields to Uint8Array.
  function prepareInput(messageType: string, input: Record<string, unknown>): Record<string, unknown> {
    const bytesFields = BYTES_FIELDS[messageType];
    if (!bytesFields) return input;
    const out: Record<string, unknown> = { ...input };
    for (const field of bytesFields) {
      const v = out[field];
      if (typeof v === 'string') {
        out[field] = Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
      }
    }
    return out;
  }

  type GoldenCase = { message_type: string; description: string; input: Record<string, unknown> };

  describe('golden round-trip (shared JSON)', () => {
    const cases = golden as GoldenCase[];
    for (const { message_type, description, input } of cases) {
      it(`${message_type}: ${description}`, () => {
        const schema = SCHEMA_BY_TYPE[message_type];
        expect(schema, `no schema for message_type ${message_type}`).toBeDefined();
        const prepared = prepareInput(message_type, input);
        const expected = toComparable(prepared);
        const decoded = roundTrip(schema, prepared);
        const actual = toComparable(decoded) as Record<string, unknown>;
        // Only assert on fields that were set in the input; protobuf fills
        // defaults for unset fields, so we can't compare whole objects.
        for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
          expect(actual[key], `field ${key} did not round-trip`).toEqual(value);
        }
      });
    }
  });
});
