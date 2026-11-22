import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ThickSolidCommand: CommandImplementation = {
  metadata: {
    name: 'make_thick_solid',
    description: 'Creates a thickened solid from faces',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to thicken' },
      faceIndices: { type: 'array', required: true, description: 'Array of face indices' },
      thickness: { type: 'number', required: true, description: 'Thickness value' },
      removeFaces: { type: 'boolean', required: false, description: 'Remove faces after thickening' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the thickened shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'faceIndices', 'thickness'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.makeThickSolid(
      params.entityId as string,
      params.faceIndices as number[],
      params.thickness as number,
      typeof params.removeFaces === 'boolean' ? params.removeFaces : false,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
