import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ExtrudeCommand: CommandImplementation = {
  metadata: {
    name: 'create_extrude',
    description: 'Creates an extruded solid from a profile',
    version: 1,
    undoable: false,
    parameters: {
      points: { type: 'array', required: true, description: 'Array of {x, y, z} profile points' },
      height: { type: 'number', required: true, description: 'Extrusion height' },
      thickness: { type: 'number', required: false, description: 'Shell thickness' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      isClosed: { type: 'boolean', required: false, description: 'Whether profile is closed' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
      vector: { type: 'array', required: false, description: 'Extrusion direction vector [x, y, z]' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created extrude shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['points', 'height'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createExtrude(
      params.points as { x: number; y: number; z: number }[],
      params.height as number,
      typeof params.thickness === 'number' ? params.thickness : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.isClosed === 'boolean' ? params.isClosed : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
      typeof params.vector === 'object' && params.vector !== null ? params.vector as number[] : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
