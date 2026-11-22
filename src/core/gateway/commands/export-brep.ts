import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ExportBRepCommand: CommandImplementation = {
  metadata: {
    name: 'export_brep',
    description: 'Exports a shape as B-rep binary data',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to export' },
    },
    result: {
      brepBytes: { type: 'string', description: 'Base64-encoded B-rep bytes' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityId' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const bytes = await transport.exportBRep(params.entityId as string);

    const b64 = Buffer.from(bytes as Uint8Array).toString('base64');
    return { success: true, entityIds: [params.entityId as string], data: { brepBytes: b64 } };
  },
};
