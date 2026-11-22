import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ConvexHullCommand: CommandImplementation = {
  metadata: {
    name: 'create_convex_hull',
    description: 'Creates a convex hull from points or shapes',
    version: 1,
    undoable: false,
    parameters: {
      points: { type: 'array', required: false, description: 'Array of {x, y, z} points' },
      shapeIds: { type: 'array', required: false, description: 'Array of shape IDs' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created convex hull shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createConvexHull(
      params.points as any[] | undefined,
      params.shapeIds as string[] | undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
