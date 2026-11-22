import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const RotateCommand: CommandImplementation = {
  metadata: {
    name: 'rotate_shape',
    description: 'Rotates a shape around an axis by rx, ry, rz',
    version: 1,
    undoable: false,
    parameters: {
      entityId: { type: 'string', required: true, description: 'Shape ID to rotate' },
      rx: { type: 'number', required: true, description: 'Rotation X angle' },
      ry: { type: 'number', required: true, description: 'Rotation Y angle' },
      rz: { type: 'number', required: true, description: 'Rotation Z angle' },
      cx: { type: 'number', required: true, description: 'Center X' },
      cy: { type: 'number', required: true, description: 'Center Y' },
      cz: { type: 'number', required: true, description: 'Center Z' },
      targetEntityId: { type: 'string', required: false, description: 'Optional target entity ID' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the rotated shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['entityId', 'rx', 'ry', 'rz', 'cx', 'cy', 'cz'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.rotateShape(
      params.entityId as string,
      params.rx as number, params.ry as number, params.rz as number,
      params.cx as number, params.cy as number, params.cz as number,
      typeof params.targetEntityId === 'string' ? params.targetEntityId : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
