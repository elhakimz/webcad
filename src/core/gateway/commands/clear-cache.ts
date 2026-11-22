import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ClearCacheCommand: CommandImplementation = {
  metadata: {
    name: 'clear_cache',
    description: 'Clears the kernel shape cache for the current session',
    version: 1,
    undoable: false,
    parameters: {},
    result: {
      success: { type: 'boolean', description: 'True when cache was cleared' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.clearCache();
    return { success: true, entityIds: [], data: { success: result.success } };
  },
};
