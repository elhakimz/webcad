import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const MultMatrixCommand: CommandImplementation = {
  metadata: {
    name: 'mult_matrix_shape',
    description: 'Applies a 4x4 matrix transformation to a shape',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to transform' },
      m: { type: 'array', required: true, description: '16-element matrix array' },
      targetEntityId: { type: 'string', required: false, description: 'Optional target entity ID' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the transformed shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'm'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.multMatrixShape(
      params.entityId as string,
      params.m as number[],
      typeof params.targetEntityId === 'string' ? params.targetEntityId : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
