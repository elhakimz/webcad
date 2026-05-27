import { describe, it, expect } from 'vitest';
import { ElevCommand } from './ElevCommand';
import { UnitsConfig } from '../model/Document';

describe('ElevCommand', () => {
  const units: UnitsConfig = { type: 'decimal', precision: 4 };

  it('should return information when input is empty', () => {
    const cmd = new ElevCommand();
    const doc: any = { currentElevation: 10.5 };
    const res = cmd.onInput('', 'TMP', units, undefined, doc);
    expect(res).toBe('Current elevation is 10.5.');
  });

  it('should return elevationSet action when numeric input provided', () => {
    const cmd = new ElevCommand();
    const res = cmd.onInput('25.5', 'TMP', units);
    expect(res).toEqual({ action: 'elevationSet', value: 25.5 });
  });

  it('should return error for invalid input', () => {
    const cmd = new ElevCommand();
    const res = cmd.onInput('abc', 'TMP', units);
    expect(res).toBe('Invalid elevation value. Command aborted.');
  });
});
