import { Script, ScriptStep, ScriptTolerances, DEFAULT_TOLERANCES } from './kernel-adapter';

export function parseScript(input: unknown): Script {
  if (!input || typeof input !== 'object') {
    throw new Error('Script must be an object');
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error('Script missing required field: name');
  }

  if (!Array.isArray(obj.steps)) {
    throw new Error('Script missing required field: steps (array)');
  }

  const steps: ScriptStep[] = obj.steps.map((step, i) => {
    if (!step || typeof step !== 'object') {
      throw new Error(`Step ${i} must be an object`);
    }
    const s = step as Record<string, unknown>;
    if (typeof s.name !== 'string' || !s.name) {
      throw new Error(`Step ${i} missing required field: name`);
    }
    return {
      name: s.name,
      parameters: (s.parameters && typeof s.parameters === 'object' && !Array.isArray(s.parameters)) ? (s.parameters as Record<string, unknown>) : {},
    };
  });

  const rawTol = obj.tolerances;
  const tolerances: ScriptTolerances = {
    ...DEFAULT_TOLERANCES,
    ...(rawTol && typeof rawTol === 'object' ? rawTol : {}),
  };

  return { name: obj.name, tolerances, steps };
}
