import { CommandImplementation, CommandContext, CommandResult } from '../command-registry';
import { KernelGrpcTransport } from '../../io/KernelGrpcTransport.js';

export const WedgeCommand: CommandImplementation = {
  metadata: {
    name: 'create_wedge',
    description: 'Creates a wedge solid',
    version: 1,
    undoable: false,
    parameters: {
      x1: { type: 'number', required: true, description: 'Point 1 X' },
      y1: { type: 'number', required: true, description: 'Point 1 Y' },
      z1: { type: 'number', required: true, description: 'Point 1 Z' },
      x2: { type: 'number', required: true, description: 'Point 2 X' },
      y2: { type: 'number', required: true, description: 'Point 2 Y' },
      height: { type: 'number', required: true, description: 'Height' },
      ltx: { type: 'number', required: true, description: 'Ltx parameter' },
      deflection: { type: 'number', required: true, description: 'Tessellation deflection' },
      entityId: { type: 'string', required: false, description: 'Optional entity ID' },
    },
    result: {
      shape_id: { type: 'string', description: 'ID of the created wedge shape' },
    },
  },
  execute: async (params: Record<string, unknown>, context: CommandContext): Promise<CommandResult> => {
    const required: string[] = ['x1', 'y1', 'z1', 'x2', 'y2', 'height', 'ltx', 'deflection'];
    const missing = required.filter((k) => !(k in params));
    if (missing.length > 0) {
      return { success: false, entityIds: [], errorCode: 3, errorMessage: `Missing required parameters: ${missing.join(', ')}` };
    }

    const transport = new KernelGrpcTransport(context.sessionId);
    await transport.init();
    const result = await transport.createWedge(
      params.x1 as number, params.y1 as number, params.z1 as number,
      params.x2 as number, params.y2 as number, params.height as number,
      params.ltx as number, params.deflection as number,
      typeof params.entityId === 'string' ? params.entityId : undefined,
    );

    const shapeId = (result as { shapeId?: string })?.shapeId;
    return { success: true, entityIds: shapeId ? [shapeId] : [], data: { shape_id: shapeId ?? '' } };
  },
};
