import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const RevolveCommand: CommandImplementation = {
  metadata: {
    name: 'create_revolve',
    description: 'Creates a revolved solid from a profile around an axis',
    version: 1,
    undoable: false,
    parameters: {
      points: { type: 'array', required: true, description: 'Array of {x, y, z} profile points' },
      axisPoint: { type: 'array', required: true, description: 'Axis origin point [x, y, z]' },
      axisDir: { type: 'array', required: true, description: 'Axis direction vector [x, y, z]' },
      angle: { type: 'number', required: true, description: 'Revolution angle in radians' },
      thickness: { type: 'number', required: false, description: 'Shell thickness' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      isClosed: { type: 'boolean', required: false, description: 'Whether profile is closed' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created revolve shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['points', 'axisPoint', 'axisDir', 'angle'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createRevolve(
      params.points as { x: number; y: number; z: number }[],
      params.axisPoint as { x: number; y: number; z: number },
      params.axisDir as { x: number; y: number; z: number },
      params.angle as number,
      typeof params.thickness === 'number' ? params.thickness : undefined,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.isClosed === 'boolean' ? params.isClosed : undefined,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
