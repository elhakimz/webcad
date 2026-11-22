export type DedupeStatus = 'pending' | 'completed' | 'failed';

export interface DedupeEntry {
  requestId: string;
  sessionId: string;
  principal: string;
  status: DedupeStatus;
  resultRef?: string; // result_id for large results stored by reference
  errorCode?: number;
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

export interface DedupeConfig {
  ttlMs?: number;        // proposed default: 600000 (10 min)
  sizeCap?: number;      // proposed default: 10000
  resultInlineLimit?: number; // proposed default: 262144 (256 KiB)
  resultIdTtlMs?: number;     // proposed default: 300000 (5 min)
}

export class DedupeCache {
  private entries = new Map<string, DedupeEntry>();
  private readonly config: Required<DedupeConfig>;

  constructor(config: DedupeConfig = {}) {
    this.config = {
      ttlMs: config.ttlMs ?? 600_000,
      sizeCap: config.sizeCap ?? 10_000,
      resultInlineLimit: config.resultInlineLimit ?? 256 * 1024,
      resultIdTtlMs: config.resultIdTtlMs ?? 300_000,
    };
  }

  private key(principal: string, sessionId: string, requestId: string): string {
    return `${principal}:${sessionId}:${requestId}`;
  }

  /** Check if a request_id is already in flight or completed. Returns existing entry or undefined. */
  lookup(principal: string, sessionId: string, requestId: string): DedupeEntry | undefined {
    this.evictExpired();
    return this.entries.get(this.key(principal, sessionId, requestId));
  }

  /** Mark a request as in-flight. Returns false if already exists (duplicate joins in-flight). */
  markPending(principal: string, sessionId: string, requestId: string): boolean {
    this.evictExpired();
    const k = this.key(principal, sessionId, requestId);
    if (this.entries.has(k)) {
      return false; // duplicate - caller joins the in-flight call
    }
    this.enforceSizeCap();
    this.entries.set(k, {
      requestId,
      sessionId,
      principal,
      status: 'pending',
      createdAt: Date.now(),
    });
    return true;
  }

  complete(principal: string, sessionId: string, requestId: string, resultRef?: string): void {
    const entry = this.entries.get(this.key(principal, sessionId, requestId));
    if (!entry) return;
    entry.status = 'completed';
    entry.resultRef = resultRef;
    entry.completedAt = Date.now();
  }

  fail(principal: string, sessionId: string, requestId: string, errorCode: number, errorMessage: string): void {
    const entry = this.entries.get(this.key(principal, sessionId, requestId));
    if (!entry) return;
    entry.status = 'failed';
    entry.errorCode = errorCode;
    entry.errorMessage = errorMessage;
    entry.completedAt = Date.now();
  }

  /** Get a result reference by request_id (for dedupe replay). Returns undefined if not found or not completed. */
  getResultRef(principal: string, sessionId: string, requestId: string): string | undefined {
    const entry = this.entries.get(this.key(principal, sessionId, requestId));
    if (!entry || entry.status !== 'completed') return undefined;
    return entry.resultRef;
  }

  /** Release a result_id reference (explicit release or TTL). */
  releaseResult(resultId: string): void {
    // Find entries referencing this result_id and clear the ref
    for (const entry of this.entries.values()) {
      if (entry.resultRef === resultId) {
        entry.resultRef = undefined;
      }
    }
  }

  private evictExpired(): void {
    const now = Date.now();
    const cutoff = now - this.config.ttlMs;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.createdAt < cutoff) {
        this.entries.delete(key);
      }
    }
  }

  private enforceSizeCap(): void {
    if (this.entries.size < this.config.sizeCap) return;
    // Evict oldest entries first
    const sorted = Array.from(this.entries.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toEvict = sorted.slice(0, Math.ceil(this.config.sizeCap * 0.1));
    for (const [key] of toEvict) {
      this.entries.delete(key);
    }
  }

  get size(): number {
    this.evictExpired();
    return this.entries.size;
  }
}

export const dedupeCache = new DedupeCache();
