import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';

describe('logger', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logger.setLevel('debug');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits JSON with timestamp, level, and message', () => {
    logger.info('hello world');
    const output = stdoutSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('hello world');
    expect(entry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('includes optional context fields', () => {
    logger.info('op started', {
      sessionId: 'sess-1',
      documentId: 'doc-1',
      opType: 'createBox',
      requestId: 'req-1',
      kernelPid: 1234,
    });
    const output = stdoutSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output);
    expect(entry.sessionId).toBe('sess-1');
    expect(entry.documentId).toBe('doc-1');
    expect(entry.opType).toBe('createBox');
    expect(entry.requestId).toBe('req-1');
    expect(entry.kernelPid).toBe(1234);
  });

  it('serializes errors with message, stack, and name on stderr', () => {
    const err = new Error('boom');
    logger.error('failed', { err });
    const output = stderrSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output);
    expect(entry.level).toBe('error');
    expect(entry.error.message).toBe('boom');
    expect(entry.error.name).toBe('Error');
    expect(entry.error.stack).toContain('logger.test.ts');
  });

  it('warn also goes to stderr', () => {
    logger.warn('careful');
    const output = stderrSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output);
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('careful');
  });

  it('respects log level filtering', () => {
    logger.setLevel('warn');
    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('warn msg');
    logger.error('error msg');
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it('writes warn and error to stderr, info and debug to stdout', () => {
    logger.info('info msg');
    logger.debug('debug msg');
    logger.warn('warn msg');
    logger.error('error msg');
    expect(stdoutSpy).toHaveBeenCalledTimes(2);
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });
});
