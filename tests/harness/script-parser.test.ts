import { describe, it, expect } from 'vitest';
import { parseScript } from '../../src/core/harness/script-parser';
import { DEFAULT_TOLERANCES } from '../../src/core/harness/kernel-adapter';

describe('ScriptParser', () => {
  it('parses a valid script with defaults', () => {
    const script = parseScript({
      name: 'test_group',
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    });
    expect(script.name).toBe('test_group');
    expect(script.tolerances).toEqual(DEFAULT_TOLERANCES);
    expect(script.steps).toHaveLength(1);
    expect(script.steps[0].name).toBe('create_box');
  });

  it('uses provided tolerances', () => {
    const script = parseScript({
      name: 'test_group',
      tolerances: { volume: 1e-3, surface: 1e-3, bbox: 1e-2, counts: 0 },
      steps: [{ name: 'create_box', parameters: { x: 0, y: 0, z: 0, dx: 10, dy: 10, dz: 10, deflection: 0.1 } }],
    });
    expect(script.tolerances.volume).toBe(1e-3);
  });

  it('throws when name is missing', () => {
    expect(() => parseScript({ steps: [] } as any)).toThrow(/missing.*name/i);
  });

  it('throws when steps is missing', () => {
    expect(() => parseScript({ name: 'x' } as any)).toThrow(/steps/i);
  });

  it('throws when a step has no name', () => {
    expect(() => parseScript({ name: 'x', steps: [{ parameters: {} }] as any })).toThrow(/step.*name/i);
  });
});
