import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ChamferFaceCommand: CommandImplementation = {
  metadata: {
    name: 'chamfer_solid_face',
    description: 'Applies a chamfer to a solid face',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to chamfer' },
      faceIndex: { type: 'number', required: true, description: 'Face index to chamfer' },
      radius: { type: 'number', required: true, description: 'Chamfer distance' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the chamfered shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'faceIndex', 'radius'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.chamferSolidFace(
      params.entityId as string,
      params.faceIndex as number,
      params.radius as number,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
