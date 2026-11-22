import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const InitCommand: CommandImplementation = {
  metadata: {
    name: 'init',
    description: 'Initializes a kernel session',
    version: 1,
    undoable: false,
    parameters: {},
    result: {
      ok: { type: 'boolean', description: 'True when initialized' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    return { success: true, entityIds: [], data: { ok: true } };
  },
};
