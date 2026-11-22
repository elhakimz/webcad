export interface CommandParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  required?: boolean;
  description?: string;
}

export interface CommandMetadata {
  name: string;
  description: string;
  version: number;
  undoable: boolean;
  parameters: Record<string, CommandParameter>;
  result: Record<string, { type: string; description?: string }>;
}

export interface CommandContext {
  sessionId: string;
  requestId: string;
  userId?: string;
}

export interface CommandResult {
  success: boolean;
  entityIds: string[];
  data?: Record<string, unknown>;
  errorCode?: number;
  errorMessage?: string;
}

export interface CommandImplementation {
  metadata: CommandMetadata;
  execute(params: Record<string, unknown>, context: CommandContext): Promise<CommandResult>;
  undo?(entityId: string, context: CommandContext): Promise<CommandResult>;
}

export class CommandRegistry {
  private commands = new Map<string, CommandImplementation>();

  register(command: CommandImplementation): void {
    if (this.commands.has(command.metadata.name)) {
      throw new Error(`Command already registered: ${command.metadata.name}`);
    }
    this.commands.set(command.metadata.name, command);
  }

  registerAll(commands: CommandImplementation[]): void {
    for (const cmd of commands) {
      this.register(cmd);
    }
  }

  get(name: string): CommandImplementation | undefined {
    return this.commands.get(name);
  }

  list(): CommandMetadata[] {
    return Array.from(this.commands.values()).map((c) => c.metadata);
  }

  validate(name: string, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const command = this.commands.get(name);
    if (!command) {
      return { valid: false, errors: [`Unknown command: ${name}`] };
    }
    const errors: string[] = [];
    const { parameters } = command.metadata;

    for (const [paramName, paramDef] of Object.entries(parameters)) {
      if (paramDef.required !== false && !(paramName in params)) {
        errors.push(`Missing required parameter: ${paramName}`);
        continue;
      }
      if (paramName in params) {
        const value = params[paramName];
        if (!validateType(value, paramDef.type)) {
          errors.push(
            `Parameter "${paramName}" must be of type ${paramDef.type}, got ${typeof value}`,
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

function validateType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}
