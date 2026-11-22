// Structured JSON logger for the gateway (WC-EC-38).
// Emits one JSON object per log line to stdout/stderr.
// Optional fields: sessionId, documentId, opType, requestId, kernelPid, err.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  sessionId?: string;
  documentId?: string;
  opType?: string;
  requestId?: string;
  kernelPid?: number;
  err?: Error;
  [key: string]: unknown;
}

class Logger {
  private readonly levelOrder: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private level: LogLevel = (process.env.GATEWAY_LOG_LEVEL ?? 'info') as LogLevel;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.level];
  }

  private write(level: LogLevel, message: string, ctx: LogContext = {}): void {
    if (!this.shouldLog(level)) return;

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...ctx,
    };

    // Serialize error if present
    if (ctx.err instanceof Error) {
      entry.error = {
        message: ctx.err.message,
        stack: ctx.err.stack,
        name: ctx.err.name,
      };
    }

    // Remove undefined values
    for (const [key, value] of Object.entries(entry)) {
      if (value === undefined) delete entry[key];
    }

    const line = JSON.stringify(entry);
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }

  debug(message: string, ctx: LogContext = {}): void {
    this.write('debug', message, ctx);
  }

  info(message: string, ctx: LogContext = {}): void {
    this.write('info', message, ctx);
  }

  warn(message: string, ctx: LogContext = {}): void {
    this.write('warn', message, ctx);
  }

  error(message: string, ctx: LogContext = {}): void {
    this.write('error', message, ctx);
  }
}

export const logger = new Logger();
