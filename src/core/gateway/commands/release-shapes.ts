import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ReleaseShapesCommand: CommandImplementation = {
  metadata: {
    name: 'release_shapes',
    description: 'Releases shape memory in the kernel for given entity IDs',
    version: 1,
    undoable: false,
    parameters: {
      entityIds: { type: 'array', required: true, description: 'Array of entity IDs to release' },
    },
    result: {
      success: { type: 'boolean', description: 'True when shapes were released' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityIds' in params) || !Array.isArray(params.entityIds)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityIds' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    await transport.releaseShapes(params.entityIds as string[]);
    return { success: true, entityIds: [], data: { success: true } };
  },
};
