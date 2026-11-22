import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const PyramidCommand: CommandImplementation = {
  metadata: {
    name: 'create_pyramid',
    description: 'Creates a pyramid solid',
    version: 1,
    undoable: false,
    parameters: {
      x: { type: 'number', required: true, description: 'Center X' },
      y: { type: 'number', required: true, description: 'Center Y' },
      z: { type: 'number', required: true, description: 'Center Z' },
      sides: { type: 'number', required: true, description: 'Number of sides' },
      radius: { type: 'number', required: true, description: 'Base radius' },
      h: { type: 'number', required: true, description: 'Height' },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created pyramid shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x', 'y', 'z', 'sides', 'radius', 'h', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createPyramid(
      params.x as number, params.y as number, params.z as number,
      params.sides as number, params.radius as number, params.h as number,
      params.deflection as number,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
