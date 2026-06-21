import { describe, it, expect } from 'vitest';
import { CommandAction } from '../types';

describe('CommandAction Types', () => {
  it('should support svg_import actions', () => {
    const action1: CommandAction = { action: 'svg_import', filename: 'test.svg' };
    const action2: CommandAction = { action: 'svg_import_file', svgFile: new File([], 'test.svg') };
    const action3: CommandAction = { action: 'svg_import_done' };

    expect(action1.action).toBe('svg_import');
    expect(action2.action).toBe('svg_import_file');
    expect(action3.action).toBe('svg_import_done');
    expect(action2.svgFile).toBeDefined();
  });
});
