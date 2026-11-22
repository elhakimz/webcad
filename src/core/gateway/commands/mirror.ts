import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const MirrorCommand: CommandImplementation = {
  metadata: {
    name: 'mirror_shape',
    description: 'Mirrors a shape across a plane defined by two points',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to mirror' },
      p1: { type: 'array', required: false, description: 'Plane point 1 [x, y, z?]' },
      p2: { type: 'array', required: false, description: 'Plane point 2 [x, y, z?]' },
      targetEntityId: { type: 'string', required: false, description: 'Optional target entity ID' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      normal: { type: 'array', required: false, description: 'Mirror normal [x, y, z?]' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the mirrored shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityId' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.mirrorShape(
      params.entityId as string,
      typeof params.p1 === 'object' && params.p1 !== null ? params.p1 as { x: number; y: number; z?: number } : undefined,
      typeof params.p2 === 'object' && params.p2 !== null ? params.p2 as { x: number; y: number; z?: number } : undefined,
      typeof params.targetEntityId === 'string' ? params.targetEntityId : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.normal === 'object' && params.normal !== null ? params.normal as { x: number; y: number; z?: number } : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
