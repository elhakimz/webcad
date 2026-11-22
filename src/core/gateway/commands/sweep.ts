import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const SweepCommand: CommandImplementation = {
  metadata: {
    name: 'create_sweep',
    description: 'Creates a swept solid/shell along a spine',
    version: 1,
    undoable: false,
    parameters: {
      profilePoints: { type: 'array', required: true, description: 'Array of {x, y, z} profile points' },
      spinePoints: { type: 'array', required: true, description: 'Array of {x, y, z} spine points' },
      isSolid: { type: 'boolean', required: true, description: 'Whether to produce a solid' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
      profileCount: { type: 'number', required: false, description: 'Number of profile points' },
      cornerMode: { type: 'string', required: false, description: 'Corner mode' },
      isEllipse: { type: 'boolean', required: false, description: 'Whether profile is an ellipse' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created sweep shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['profilePoints', 'spinePoints', 'isSolid'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createSweep(
      params.profilePoints as { x: number; y: number; z: number }[],
      params.spinePoints as { x: number; y: number; z: number }[],
      params.isSolid as boolean,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
      typeof params.profileCount === 'number' ? params.profileCount : undefined,
      typeof params.cornerMode === 'string' ? params.cornerMode : undefined,
      typeof params.isEllipse === 'boolean' ? params.isEllipse : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
