import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';

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

    const shapeId = `box_${context.requestId}`;
    return {
      success: true,
      entityIds: [shapeId],
      data: { shape_id: shapeId },
    };
  },
};
