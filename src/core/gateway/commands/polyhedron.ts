import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const PolyhedronCommand: CommandImplementation = {
  metadata: {
    name: 'create_polyhedron',
    description: 'Creates a polyhedron from points and faces',
    version: 1,
    undoable: false,
    parameters: {
      points: { type: 'array', required: true, description: 'Array of {x, y, z} points' },
      faces: { type: 'array', required: true, description: 'Array of face vertex index arrays' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created polyhedron shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['points', 'faces'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createPolyhedron(
      params.points as any[], params.faces as number[][],
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
