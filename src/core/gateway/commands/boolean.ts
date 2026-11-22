import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const BooleanCommand: CommandImplementation = {
  metadata: {
    name: 'create_boolean',
    description: 'Performs a boolean operation (fuse, cut, common) on two shapes',
    version: 1,
    undoable: false,
    parameters: {
      operation: { type: 'string', required: true, description: 'Boolean operation: fuse, cut, or common' },
      idA: { type: 'string', required: true, description: 'First shape ID' },
      idB: { type: 'string', required: true, description: 'Second shape ID' },
      entityId: { type: 'string', required: true, description: 'Entity ID for result' },
      deflection: { type: 'number', required: false, description: 'Tessellation deflection' },
      rotA: { type: 'array', required: false, description: 'Rotation for shape A [x, y, z]' },
      rotB: { type: 'array', required: false, description: 'Rotation for shape B [x, y, z]' },
      centerA: { type: 'array', required: false, description: 'Center for shape A [x, y, z]' },
      centerB: { type: 'array', required: false, description: 'Center for shape B [x, y, z]' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the resulting boolean shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['operation', 'idA', 'idB', 'entityId'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createBoolean(
      params.operation as 'fuse' | 'cut' | 'common',
      params.idA as string,
      params.idB as string,
      params.entityId as string,
      typeof params.deflection === 'number' ? params.deflection : undefined,
      typeof params.rotA === 'object' && params.rotA !== null ? params.rotA as { x: number; y: number; z: number } : undefined,
      typeof params.rotB === 'object' && params.rotB !== null ? params.rotB as { x: number; y: number; z: number } : undefined,
      typeof params.centerA === 'object' && params.centerA !== null ? params.centerA as { x: number; y: number; z: number } : undefined,
      typeof params.centerB === 'object' && params.centerB !== null ? params.centerB as { x: number; y: number; z: number } : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
