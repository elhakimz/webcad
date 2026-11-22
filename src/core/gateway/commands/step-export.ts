import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const StepExportCommand: CommandImplementation = {
  metadata: {
    name: 'step_export',
    description: 'Exports a shape to STEP format',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to export' },
    },
    result: {
      step_id: { type: 'string', description: 'ID of the exported STEP data' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityId' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.stepExport(params.entityId as string);

    const stepId = (result as { stepId?: string })?.stepId;
    return { success: true, entityIds: stepId ? [stepId] : [], data: { step_id: stepId ?? '' } };
  },
};
