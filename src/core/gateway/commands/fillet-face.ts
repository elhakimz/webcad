import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const FilletFaceCommand: CommandImplementation = {
  metadata: {
    name: 'fillet_solid_face',
    description: 'Applies a fillet to a solid face',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to fillet' },
      faceIndex: { type: 'number', required: true, description: 'Face index to fillet' },
      radius: { type: 'number', required: true, description: 'Fillet radius' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the filleted shape' },
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
    const result = await transport.filletSolidFace(
      params.entityId as string,
      params.faceIndex as number,
      params.radius as number,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
