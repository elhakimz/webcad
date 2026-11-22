import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ImportBRepCommand: CommandImplementation = {
  metadata: {
    name: 'import_brep',
    description: 'Imports a B-rep binary into the kernel',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Target entity ID' },
      brepBytes: { type: 'string', required: true, description: 'Base64-encoded B-rep bytes' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      success: { type: 'boolean', description: 'True when import succeeded' },
      entityId: { type: 'string', description: 'Imported shape ID' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params) || !('brepBytes' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameters: entityId, brepBytes' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const bytes = Uint8Array.from(atob(params.brepBytes as string), (c) => c.charCodeAt(0));
    await transport.importBRep(params.entityId as string, bytes, typeof params.deflection === 'number' ? params.deflection : undefined);

    return { success: true, entityIds: [params.entityId as string], data: { success: true, entityId: params.entityId } };
  },
};
