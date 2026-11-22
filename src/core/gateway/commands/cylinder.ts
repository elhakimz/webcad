import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const CylinderCommand: CommandImplementation = {
  metadata: {
    name: 'create_cylinder',
    description: 'Creates a cylinder solid',
    version: 1,
    undoable: false,
    parameters: {
      x: { type: 'number', required: true, description: 'Center X' },
      y: { type: 'number', required: true, description: 'Center Y' },
      z: { type: 'number', required: true, description: 'Center Z' },
      r: { type: 'number', required: true, description: 'Radius', min: 0 },
      h: { type: 'number', required: true, description: 'Height', min: 0 },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection', min: 0 },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created cylinder shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x', 'y', 'z', 'r', 'h', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createCylinder(
      params.x as number, params.y as number, params.z as number,
      params.r as number, params.h as number, params.deflection as number,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
