import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ExtractFaceProfileCommand: CommandImplementation = {
  metadata: {
    name: 'extract_face_profile',
    description: 'Extracts 2D face profile loops with bulge data',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID' },
      faceIndex: { type: 'number', required: true, description: 'Face index' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      loops: { type: 'object', description: 'Array of loops, each loop is array of { x, y, bulge }' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params) || !('faceIndex' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameters: entityId, faceIndex' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.extractFaceProfile(
      params.entityId as string,
      params.faceIndex as number,
      typeof params.deflection === 'number' ? params.deflection : undefined,
    );

    return { success: true, entityIds: [params.entityId as string], data: { loops: result.loops ?? [] } };
  },
};
