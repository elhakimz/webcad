import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionOrderer, OrdererRegistryImpl, type OrderedCommand } from './ordering.js';

describe('SessionOrderer', () => {
  let orderer: SessionOrderer;

  beforeEach(() => {
    orderer = new SessionOrderer('sess-1', { bufferSize: 64, timeoutMs: 5_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
    orderer.cleanup();
  });

  function makeCommand(clientSeq: number, requestId?: string): OrderedCommand {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {
      clientSeq,
      requestId: requestId ?? `req-${clientSeq}`,
      sessionId: 'sess-1',
      opName: 'execute',
      payload: {},
      resolve,
      reject,
      receivedAt: Date.now(),
    };
  }

  describe('sequential submission', () => {
    it('executes commands in order when submitted sequentially', async () => {
      const results: number[] = [];
      const cmd1 = makeCommand(1);
      const cmd2 = makeCommand(2);
      const cmd3 = makeCommand(3);

      const p1 = orderer.submit(cmd1).then(() => results.push(1));
      const p2 = orderer.submit(cmd2).then(() => results.push(2));
      const p3 = orderer.submit(cmd3).then(() => results.push(3));

      await Promise.all([p1, p2, p3]);
      expect(results).toEqual([1, 2, 3]);
    });

    it('increments expected sequence after each command', async () => {
      expect(orderer.expectedSequence).toBe(1);
      await orderer.submit(makeCommand(1));
      expect(orderer.expectedSequence).toBe(2);
      await orderer.submit(makeCommand(2));
      expect(orderer.expectedSequence).toBe(3);
    });
  });

  describe('out-of-order submission', () => {
    it('buffers out-of-order commands and releases them in sequence', async () => {
      const results: number[] = [];
      const cmd1 = makeCommand(1);
      const cmd3 = makeCommand(3);
      const cmd2 = makeCommand(2);

      // Submit 1, then 3 (buffers), then 2 (releases 2 and 3)
      await orderer.submit(cmd1).then(() => results.push(1));
      const p3 = orderer.submit(cmd3); // buffered, won't resolve yet
      await orderer.submit(cmd2).then(() => results.push(2));
      await p3.then(() => results.push(3));

      expect(results).toEqual([1, 2, 3]);
    });

    it('pendingCount reflects buffered commands', async () => {
      expect(orderer.pendingCount).toBe(0);
      const cmd3 = makeCommand(3);
      const p3 = orderer.submit(cmd3); // buffered since expected is 1
      expect(orderer.pendingCount).toBe(1);
      orderer.advance(); // release seq 1 → expected becomes 2, nothing buffered
      orderer.advance(); // release seq 2 → expected becomes 3, releases buffered cmd3
      await p3;
      expect(orderer.pendingCount).toBe(0);
    });

    it('stale/duplicate client_seq is rejected', async () => {
      await orderer.submit(makeCommand(1));
      const cmd1dup = makeCommand(1, 'req-dup');
      await expect(orderer.submit(cmd1dup)).rejects.toThrow(
        /Duplicate or stale client_seq/
      );
    });
  });

  describe('advance', () => {
    it('releases buffered commands when advance is called', async () => {
      const results: number[] = [];
      const cmd1 = makeCommand(1);
      const cmd2 = makeCommand(2); // buffered since expected is 1

      await orderer.submit(cmd1).then(() => results.push(1));
      const p2 = orderer.submit(cmd2); // buffered

      orderer.advance(); // releases cmd2

      await p2.then(() => results.push(2));
      expect(results).toEqual([1, 2]);
    });

    it('increments expected sequence', () => {
      expect(orderer.expectedSequence).toBe(1);
      orderer.advance();
      expect(orderer.expectedSequence).toBe(2);
    });
  });

  describe('buffer overflow', () => {
    it('rejects when buffer size exceeded', async () => {
      const smallOrderer = new SessionOrderer('sess-overflow', {
        bufferSize: 3,
        timeoutMs: 5_000,
      });

      // Submit 1 (executes immediately, expected becomes 2)
      await smallOrderer.submit(makeCommand(1));

      // Submit 4, 5, 6 (buffered: 3 entries fill the buffer)
      // Don't await these - they're out of order and won't resolve until released
      smallOrderer.submit(makeCommand(4)).catch(() => {});
      smallOrderer.submit(makeCommand(5)).catch(() => {});
      smallOrderer.submit(makeCommand(6)).catch(() => {});
      expect(smallOrderer.pendingCount).toBe(3);

      // 7th should overflow
      const cmd7 = makeCommand(7);
      await expect(smallOrderer.submit(cmd7)).rejects.toThrow(
        /Reorder buffer overflow/
      );

      smallOrderer.cleanup();
    });
  });

  describe('timeout', () => {
    it('rejects buffered commands on timeout', async () => {
      vi.useFakeTimers();
      orderer = new SessionOrderer('sess-timeout', { bufferSize: 64, timeoutMs: 100 });

      const cmd2 = makeCommand(2); // buffered since expected is 1
      const p2 = orderer.submit(cmd2); // don't await - hangs until timeout

      vi.advanceTimersByTime(150); // past 100ms timeout

      await expect(p2).rejects.toThrow(/Reorder buffer timeout/);
      expect(orderer.pendingCount).toBe(0);
    });

    it('clears timer when buffer drains', async () => {
      vi.useFakeTimers();
      orderer = new SessionOrderer('sess-drain', { bufferSize: 64, timeoutMs: 100 });

      const cmd2 = makeCommand(2);
      const p2 = orderer.submit(cmd2); // buffered, timer started

      orderer.advance(); // releases cmd2 via processBuffered
      await p2;

      vi.advanceTimersByTime(200); // no timeout should fire
      expect(orderer.pendingCount).toBe(0);
    });
  });

  describe('cancelQueued', () => {
    it('rejects all buffered commands with cancel error', async () => {
      vi.useFakeTimers();
      const cmd2 = makeCommand(2); // buffered
      const cmd3 = makeCommand(3); // buffered
      const p2 = orderer.submit(cmd2);
      const p3 = orderer.submit(cmd3);

      orderer.cancelQueued();

      await expect(p2).rejects.toThrow('Command cancelled');
      await expect(p3).rejects.toThrow('Command cancelled');
      expect(orderer.pendingCount).toBe(0);
    });

    it('does not affect already-executing command', async () => {
      const cmd1 = makeCommand(1);
      const p1 = orderer.submit(cmd1); // executes immediately

      orderer.cancelQueued(); // no buffered commands

      await p1; // should still resolve
      expect(orderer.pendingCount).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('stops timer and clears buffer', () => {
      vi.useFakeTimers();
      const cmd2 = makeCommand(2);
      orderer.submit(cmd2); // buffered, timer started
      expect(orderer.pendingCount).toBe(1);

      orderer.cleanup();
      expect(orderer.pendingCount).toBe(0);
    });
  });

  describe('OrdererRegistryImpl', () => {
    it('creates and retrieves orderers per session', () => {
      const registry = new OrdererRegistryImpl();
      const o1 = registry.getOrCreate('sess-a');
      const o2 = registry.getOrCreate('sess-b');
      const o1again = registry.getOrCreate('sess-a');

      expect(o1).toBe(o1again); // same instance for same session
      expect(o1).not.toBe(o2); // different instances for different sessions
    });

    it('remove deletes the orderer', () => {
      const registry = new OrdererRegistryImpl();
      registry.getOrCreate('sess-a');
      registry.remove('sess-a');
      // getOrCreate should create a new one
      const newOrderer = registry.getOrCreate('sess-a');
      expect(newOrderer).not.toBeUndefined();
    });
  });
});
