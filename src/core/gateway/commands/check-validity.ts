import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const CheckValidityCommand: CommandImplementation = {
  metadata: {
    name: 'check_validity',
    description: 'Checks validity of a shape in the kernel',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to validate' },
    },
    result: {
      isValid: { type: 'boolean', description: 'True if shape is valid' },
      faceCount: { type: 'number', description: 'Number of faces' },
      errorMsg: { type: 'string', description: 'Error message if invalid' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityId' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.checkValidity(params.entityId as string);

    return {
      success: result.isValid,
      entityIds: [params.entityId as string],
      data: {
        isValid: result.isValid,
        faceCount: result.faceCount ?? 0,
        errorMsg: result.errorMsg ?? '',
      },
    };
  },
};
