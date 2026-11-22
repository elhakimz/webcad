import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const CompoundCommand: CommandImplementation = {
  metadata: {
    name: 'create_compound',
    description: 'Creates a compound from child shape IDs',
    version: 1,
    undoable: false,
    parameters: {
      childrenIds: { type: 'array', required: true, description: 'Array of child shape IDs' },
      entityId: { type: 'string', required: true, description: 'Entity ID for the compound' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created compound shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['childrenIds', 'entityId'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createCompound(
      params.childrenIds as string[],
      params.entityId as string,
      typeof params.deflection === 'number' ? params.deflection : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
