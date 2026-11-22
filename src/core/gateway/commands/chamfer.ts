import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ChamferCommand: CommandImplementation = {
  metadata: {
    name: 'chamfer_solid',
    description: 'Applies a chamfer to a solid edge',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to chamfer' },
      edgeIndex: { type: 'number', required: true, description: 'Edge index to chamfer' },
      radius: { type: 'number', required: true, description: 'Chamfer distance' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      visualP1: { type: 'array', required: false, description: 'Visual point 1' },
      visualP2: { type: 'array', required: false, description: 'Visual point 2' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the chamfered shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'edgeIndex', 'radius'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.chamferSolid(
      params.entityId as string,
      params.edgeIndex as number,
      params.radius as number,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.visualP1 === 'object' && params.visualP1 !== null ? params.visualP1 : undefined,
      typeof params.visualP2 === 'object' && params.visualP2 !== null ? params.visualP2 : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
