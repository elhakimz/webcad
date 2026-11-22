import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DedupeCache, type DedupeEntry, type DedupeStatus } from './dedupe.js';

const PRINCIPAL = 'user-1';
const SESSION = 'sess-1';

describe('DedupeCache', () => {
  let cache: DedupeCache;

  beforeEach(() => {
    cache = new DedupeCache({
      ttlMs: 5_000,
      sizeCap: 100,
      resultInlineLimit: 256 * 1024,
      resultIdTtlMs: 300_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('lookup / markPending', () => {
    it('returns undefined for unknown request_id', () => {
      expect(cache.lookup(PRINCIPAL, SESSION, 'req-1')).toBeUndefined();
    });

    it('marks a new request as pending and returns true', () => {
      const result = cache.markPending(PRINCIPAL, SESSION, 'req-1');
      expect(result).toBe(true);
      const entry = cache.lookup(PRINCIPAL, SESSION, 'req-1');
      expect(entry).toBeDefined();
      expect(entry?.requestId).toBe('req-1');
      expect(entry?.sessionId).toBe(SESSION);
      expect(entry?.principal).toBe(PRINCIPAL);
      expect(entry?.status).toBe('pending');
    });

    it('returns false for duplicate request_id (joins in-flight)', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      const result = cache.markPending(PRINCIPAL, SESSION, 'req-1');
      expect(result).toBe(false);
    });

    it('does not allow re-marking after completion', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.complete(PRINCIPAL, SESSION, 'req-1', 'result-ref-1');
      // lookup still returns the completed entry
      const entry = cache.lookup(PRINCIPAL, SESSION, 'req-1');
      expect(entry?.status).toBe('completed');
    });

    it('request_ids are scoped by principal: no cross-tenant collision', () => {
      cache.markPending('user-1', SESSION, 'req-1');
      const result = cache.markPending('user-2', SESSION, 'req-1');
      expect(result).toBe(true); // different principal, same request_id is allowed
    });

    it('request_ids are scoped by session: no cross-session collision', () => {
      cache.markPending(PRINCIPAL, 'sess-1', 'req-1');
      const result = cache.markPending(PRINCIPAL, 'sess-2', 'req-1');
      expect(result).toBe(true); // different session, same request_id is allowed
    });
  });

  describe('complete / fail', () => {
    it('marks a pending request as completed with result ref', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.complete(PRINCIPAL, SESSION, 'req-1', 'result-ref-1');
      const entry = cache.lookup(PRINCIPAL, SESSION, 'req-1');
      expect(entry?.status).toBe('completed');
      expect(entry?.resultRef).toBe('result-ref-1');
      expect(entry?.completedAt).toBeDefined();
    });

    it('marks a pending request as failed with error', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.fail(PRINCIPAL, SESSION, 'req-1', 3, 'INVALID_ARGUMENT: bad shape');
      const entry = cache.lookup(PRINCIPAL, SESSION, 'req-1');
      expect(entry?.status).toBe('failed');
      expect(entry?.errorCode).toBe(3);
      expect(entry?.errorMessage).toBe('INVALID_ARGUMENT: bad shape');
    });

    it('complete/fail on unknown request_id is a no-op', () => {
      expect(() => cache.complete(PRINCIPAL, SESSION, 'unknown', 'ref')).not.toThrow();
      expect(() => cache.fail(PRINCIPAL, SESSION, 'unknown', 1, 'err')).not.toThrow();
    });
  });

  describe('getResultRef', () => {
    it('returns result ref for completed entry', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.complete(PRINCIPAL, SESSION, 'req-1', 'result-ref-1');
      expect(cache.getResultRef(PRINCIPAL, SESSION, 'req-1')).toBe('result-ref-1');
    });

    it('returns undefined for pending entry', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      expect(cache.getResultRef(PRINCIPAL, SESSION, 'req-1')).toBeUndefined();
    });

    it('returns undefined for failed entry', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.fail(PRINCIPAL, SESSION, 'req-1', 1, 'err');
      expect(cache.getResultRef(PRINCIPAL, SESSION, 'req-1')).toBeUndefined();
    });

    it('returns undefined for unknown request_id', () => {
      expect(cache.getResultRef(PRINCIPAL, SESSION, 'unknown')).toBeUndefined();
    });
  });

  describe('releaseResult', () => {
    it('clears result ref from entries referencing it', () => {
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.complete(PRINCIPAL, SESSION, 'req-1', 'result-ref-1');
      cache.markPending(PRINCIPAL, 'sess-2', 'req-2');
      cache.complete(PRINCIPAL, 'sess-2', 'req-2', 'result-ref-1'); // same result ref

      cache.releaseResult('result-ref-1');

      expect(cache.lookup(PRINCIPAL, SESSION, 'req-1')?.resultRef).toBeUndefined();
      expect(cache.lookup(PRINCIPAL, 'sess-2', 'req-2')?.resultRef).toBeUndefined();
    });

    it('is a no-op for unknown result id', () => {
      expect(() => cache.releaseResult('unknown')).not.toThrow();
    });
  });

  describe('TTL eviction', () => {
    it('evicts entries older than ttlMs', () => {
      vi.useFakeTimers();
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      vi.advanceTimersByTime(5_001); // past ttlMs of 5000
      expect(cache.lookup(PRINCIPAL, SESSION, 'req-1')).toBeUndefined();
      vi.useRealTimers();
    });

    it('keeps entries within ttlMs', () => {
      vi.useFakeTimers();
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      vi.advanceTimersByTime(4_999);
      expect(cache.lookup(PRINCIPAL, SESSION, 'req-1')).toBeDefined();
      vi.useRealTimers();
    });
  });

  describe('size cap eviction', () => {
    it('evicts oldest 10% when size cap exceeded', () => {
      const smallCache = new DedupeCache({
        ttlMs: 60_000,
        sizeCap: 10,
        resultInlineLimit: 256 * 1024,
        resultIdTtlMs: 300_000,
      });

      // Fill to cap
      for (let i = 1; i <= 10; i++) {
        smallCache.markPending(PRINCIPAL, SESSION, `req-${i}`);
      }
      expect(smallCache.size).toBe(10);

      // Adding an 11th triggers eviction of oldest 1 (10% of 10 = 1)
      smallCache.markPending(PRINCIPAL, SESSION, 'req-11');
      expect(smallCache.size).toBe(10);
      expect(smallCache.lookup(PRINCIPAL, SESSION, 'req-1')).toBeUndefined(); // oldest evicted
      expect(smallCache.lookup(PRINCIPAL, SESSION, 'req-11')).toBeDefined();
    });
  });

  describe('size getter', () => {
    it('returns count after evicting expired', () => {
      vi.useFakeTimers();
      cache.markPending(PRINCIPAL, SESSION, 'req-1');
      cache.markPending(PRINCIPAL, SESSION, 'req-2');
      expect(cache.size).toBe(2);

      vi.advanceTimersByTime(5_001);
      expect(cache.size).toBe(0);
      vi.useRealTimers();
    });
  });

  describe('DedupeEntry type', () => {
    it('has all required fields', () => {
      const entry: DedupeEntry = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        principal: PRINCIPAL,
        status: 'completed' as DedupeStatus,
        createdAt: Date.now(),
      };
      expect(entry.requestId).toBe('req-1');
      expect(entry.sessionId).toBe('sess-1');
      expect(entry.status).toBe('completed');
      expect(entry.createdAt).toBeDefined();
    });
  });
});
