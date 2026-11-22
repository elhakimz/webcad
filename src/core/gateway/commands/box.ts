import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const BoxCommand: CommandImplementation = {
  metadata: {
    name: 'create_box',
    description: 'Creates a rectangular box solid from min corner and dimensions',
    version: 1,
    undoable: false,
    parameters: {
      x: { type: 'number', required: true, description: 'Min X coordinate' },
      y: { type: 'number', required: true, description: 'Min Y coordinate' },
      z: { type: 'number', required: true, description: 'Min Z coordinate' },
      dx: { type: 'number', required: true, description: 'Size X' },
      dy: { type: 'number', required: true, description: 'Size Y' },
      dz: { type: 'number', required: true, description: 'Size Z' },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created box shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x', 'y', 'z', 'dx', 'dy', 'dz', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return {
        success: false,
        entityIds: [],
        errorCode: 3,
        errorMessage: `Missing required parameters: ${missing.join(', ')}`,
      };
    }

    for (const k of required) {
      if (typeof params[k] !== 'number' || isNaN(params[k] as number)) {
        return {
          success: false,
          entityIds: [],
          errorCode: 3,
          errorMessage: `Parameter "${k}" must be a valid number`,
        };
      }
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    try {
      await transport.init();
      const result = await transport.createBox(
        params.x as number,
        params.y as number,
        params.z as number,
        params.dx as number,
        params.dy as number,
        params.dz as number,
        params.deflection as number,
        typeof params.entityId === 'string' ? params.entityId : undefined,
      );

      const shapeId = (result as { shapeId?: string })?.shapeId;
      return {
        success: true,
        entityIds: shapeId ? [shapeId] : [],
        data: { shape_id: shapeId ?? '' },
      };
    } catch (err) {
      return {
        success: false,
        entityIds: [],
        errorCode: 1,
        errorMessage: err instanceof Error ? err.message : 'kernel error',
      };
    }
  },
};
