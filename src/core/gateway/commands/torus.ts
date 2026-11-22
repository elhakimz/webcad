import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const TorusCommand: CommandImplementation = {
  metadata: {
    name: 'create_torus',
    description: 'Creates a torus solid',
    version: 1,
    undoable: false,
    parameters: {
      x: { type: 'number', required: true, description: 'Center X' },
      y: { type: 'number', required: true, description: 'Center Y' },
      z: { type: 'number', required: true, description: 'Center Z' },
      r1: { type: 'number', required: true, description: 'Major radius', min: 0 },
      r2: { type: 'number', required: true, description: 'Minor radius', min: 0 },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection', min: 0 },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created torus shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x', 'y', 'z', 'r1', 'r2', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createTorus(
      params.x as number, params.y as number, params.z as number,
      params.r1 as number, params.r2 as number, params.deflection as number,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
