import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const ScaleCommand: CommandImplementation = {
  metadata: {
    name: 'scale_shape',
    description: 'Scales a shape by factor around a center point',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to scale' },
      factor: { type: 'number', required: false, description: 'Uniform scale factor', min: 0 },
      cx: { type: 'number', required: true, description: 'Center X' },
      cy: { type: 'number', required: true, description: 'Center Y' },
      cz: { type: 'number', required: true, description: 'Center Z' },
      targetEntityId: { type: 'string', required: false, description: 'Optional target entity ID' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection', min: 0 },
      factorX: { type: 'number', required: false, description: 'X scale factor', min: 0 },
      factorY: { type: 'number', required: false, description: 'Y scale factor', min: 0 },
      factorZ: { type: 'number', required: false, description: 'Z scale factor', min: 0 },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the scaled shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    if (!('entityId' in params)) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: 'Missing required parameter: entityId' };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.scaleShape(
      params.entityId as string,
      typeof params.factor === 'number' ? params.factor : undefined,
      params.cx as number, params.cy as number, params.cz as number,
      typeof params.targetEntityId === 'string' ? params.targetEntityId : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.factorX === 'number' ? params.factorX : undefined,
      typeof params.factorY === 'number' ? params.factorY : undefined,
      typeof params.factorZ === 'number' ? params.factorZ : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
