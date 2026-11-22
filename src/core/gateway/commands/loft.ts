import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const LoftCommand: CommandImplementation = {
  metadata: {
    name: 'create_loft',
    description: 'Creates a lofted solid from cross-section profiles',
    version: 1,
    undoable: false,
    parameters: {
      profiles: { type: 'array', required: true, description: 'Array of profile definitions' },
      isSolid: { type: 'boolean', required: true, description: 'Whether to produce a solid' },
      isRuled: { type: 'boolean', required: true, description: 'Whether to use ruled surfaces' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created loft shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['profiles', 'isSolid', 'isRuled'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createLoft(
      params.profiles as { id: string; points: { x: number; y: number; z: number }[]; closed: boolean }[],
      params.isSolid as boolean,
      params.isRuled as boolean,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
