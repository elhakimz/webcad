import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const DraftFacesCommand: CommandImplementation = {
  metadata: {
    name: 'draft_solid_faces',
    description: 'Applies a draft angle to solid faces',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to draft' },
      faceIndices: { type: 'array', required: true, description: 'Array of face indices' },
      neutralFaceIndex: { type: 'number', required: true, description: 'Neutral face index' },
      angleRad: { type: 'number', required: true, description: 'Draft angle in radians' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the drafted shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'faceIndices', 'neutralFaceIndex', 'angleRad'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.draftSolidFaces(
      params.entityId as string,
      params.faceIndices as number[],
      params.neutralFaceIndex as number,
      params.angleRad as number,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
