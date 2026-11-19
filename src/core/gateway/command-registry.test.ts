import { describe, it, expect } from 'vitest';
import { CommandRegistry } from './command-registry';

function makeCommand(name: string): any {
  return {
    metadata: {
      name,
      description: `Test command ${name}`,
      version: 1,
      undoable: false,
      parameters: {
        value: { type: 'number', required: true },
        label: { type: 'string', required: false },
      },
      result: {
        id: { type: 'string', description: 'Result ID' },
      },
    },
    execute: async () => ({ success: true, entityIds: [], data: { id: 'x' } }),
  };
}

describe('CommandRegistry', () => {
  it('registers and retrieves a command by name', () => {
    const registry = new CommandRegistry();
    const cmd = makeCommand('test_cmd');
    registry.register(cmd);
    expect(registry.get('test_cmd')).toBe(cmd);
  });

  it('returns undefined for unknown command', () => {
    const registry = new CommandRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('throws on duplicate registration', () => {
    const registry = new CommandRegistry();
    const cmd = makeCommand('dup_cmd');
    registry.register(cmd);
    expect(() => registry.register(cmd)).toThrow(/already registered/);
  });

  it('lists all registered commands', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('cmd_a'));
    registry.register(makeCommand('cmd_b'));
    const names = registry.list().map((c) => c.name).sort();
    expect(names).toEqual(['cmd_a', 'cmd_b']);
  });

  it('validates when all required params present with correct types', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('valid_cmd'));
    const result = registry.validate('valid_cmd', { value: 42, label: 'hi' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails validation when required param is missing', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('missing_cmd'));
    const result = registry.validate('missing_cmd', { label: 'hi' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required parameter: value');
  });

  it('fails validation when param has wrong type', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('wrong_cmd'));
    const result = registry.validate('wrong_cmd', { value: 'not a number' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Parameter "value" must be of type number');
  });

  it('fails validation for unknown command', () => {
    const registry = new CommandRegistry();
    const result = registry.validate('no_such_cmd', { value: 1 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown command: no_such_cmd');
  });

  it('does not fail when optional param is missing', () => {
    const registry = new CommandRegistry();
    registry.register(makeCommand('optional_cmd'));
    const result = registry.validate('optional_cmd', { value: 42 });
    expect(result.valid).toBe(true);
  });
});
