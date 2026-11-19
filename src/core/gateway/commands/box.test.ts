import { describe, it, expect } from 'vitest';
import { BoxCommand } from './box';

describe('BoxCommand', () => {
  const ctx = (requestId = 'req-1') => ({ sessionId: 'sess-1', requestId });

  it('creates a box with valid parameters', async () => {
    const result = await BoxCommand.execute(
      { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 },
      ctx('req-1')
    );
    expect(result.success).toBe(true);
    expect(result.entityIds).toEqual(['box_req-1']);
    expect(result.data).toEqual({ shape_id: 'box_req-1' });
    expect(result.errorMessage).toBeUndefined();
  });

  it('fails when required parameters are missing', async () => {
    const result = await BoxCommand.execute(
      { x: 0, y: 0, z: 0, dx: 10 },
      ctx('req-2')
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(3);
    expect(result.errorMessage).toContain('Missing required parameters');
    expect(result.errorMessage).toContain('dy');
    expect(result.errorMessage).toContain('dz');
    expect(result.errorMessage).toContain('deflection');
  });

  it('fails when a parameter is not a number', async () => {
    const result = await BoxCommand.execute(
      { x: '0', y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 },
      ctx('req-3')
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(3);
    expect(result.errorMessage).toContain('Parameter "x" must be a valid number');
  });

  it('fails when a parameter is NaN', async () => {
    const result = await BoxCommand.execute(
      { x: NaN, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 },
      ctx('req-4')
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(3);
    expect(result.errorMessage).toContain('Parameter "x" must be a valid number');
  });

  it('returns metadata with the correct name and parameter list', () => {
    expect(BoxCommand.metadata.name).toBe('create_box');
    expect(BoxCommand.metadata.version).toBe(1);
    const names = Object.keys(BoxCommand.metadata.parameters).sort();
    expect(names).toEqual(['deflection', 'dx', 'dy', 'dz', 'x', 'y', 'z']);
  });
});
