import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SessionManager, type SessionInfo } from './session-manager.js';
describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager({
      replayBufferSize: 10,
      replayBufferTtlMs: 5_000,
      heartbeatIntervalMs: 1_000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSession', () => {
    it('creates a session with auto-generated id', () => {
      const session = manager.createSession('1.0.0');
      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.clientVersion).toBe('1.0.0');
      expect(session.state).toBe('connected');
      expect(session.lastEventId).toBe(0);
      expect(session.includeBrep).toBe(true);
    });

    it('uses provided session id when given', () => {
      const session = manager.createSession('1.0.0', 'custom-id-123');
      expect(session.id).toBe('custom-id-123');
    });

    it('retrieves created session', () => {
      const created = manager.createSession('1.0.0', 's1');
      const found = manager.getSession('s1');
      expect(found).toEqual(created);
      expect(found?.id).toBe('s1');
    });

    it('returns undefined for missing session', () => {
      expect(manager.getSession('nonexistent')).toBeUndefined();
    });
  });

  describe('closeSession', () => {
    it('removes session and clears its event buffer', () => {
      manager.createSession('1.0.0', 's1');
      manager.appendEvent('s1', { type: 'progress', message: 'test' } as any);
      expect(manager.hasSession('s1')).toBe(true);

      const result = manager.closeSession('s1');
      expect(result).toBe(true);
      expect(manager.hasSession('s1')).toBe(false);
      expect(manager.getSession('s1')).toBeUndefined();
    });

    it('returns false for already-closed session', () => {
      expect(manager.closeSession('nonexistent')).toBe(false);
    });
  });

  describe('hasSession', () => {
    it('returns true for existing session', () => {
      manager.createSession('1.0.0', 's1');
      expect(manager.hasSession('s1')).toBe(true);
    });

    it('returns false for missing session', () => {
      expect(manager.hasSession('nonexistent')).toBe(false);
    });
  });

  describe('updateActivity', () => {
    it('updates lastActivity timestamp', () => {
      vi.useFakeTimers();
      const session = manager.createSession('1.0.0', 's1');
      const before = session.lastActivity;
      vi.advanceTimersByTime(100);
      manager.updateActivity('s1');
      const updated = manager.getSession('s1')!;
      expect(updated.lastActivity).toBeGreaterThan(before);
      vi.useRealTimers();
    });

    it('is a no-op for missing session', () => {
      expect(() => manager.updateActivity('nonexistent')).not.toThrow();
    });
  });

  describe('setState', () => {
    it('transitions session state', () => {
      manager.createSession('1.0.0', 's1');
      manager.setState('s1', 'restarting');
      expect(manager.getSession('s1')?.state).toBe('restarting');

      manager.setState('s1', 'rehydrating');
      expect(manager.getSession('s1')?.state).toBe('rehydrating');

      manager.setState('s1', 'connected');
      expect(manager.getSession('s1')?.state).toBe('connected');
    });

    it('is a no-op for missing session', () => {
      expect(() => manager.setState('nonexistent', 'restarting')).not.toThrow();
    });
  });

  describe('setKernelPid', () => {
    it('sets kernel pid on session', () => {
      manager.createSession('1.0.0', 's1');
      manager.setKernelPid('s1', 12345);
      expect(manager.getSession('s1')?.kernelPid).toBe(12345);
    });

    it('is a no-op for missing session', () => {
      expect(() => manager.setKernelPid('nonexistent', 1)).not.toThrow();
    });
  });

  describe('appendEvent / getEventsAfter / getLastEventId', () => {
    it('appends events with monotonically increasing ids', () => {
      manager.createSession('1.0.0', 's1');
      const id1 = manager.appendEvent('s1', { type: 'progress', message: 'first' } as any);
      const id2 = manager.appendEvent('s1', { type: 'progress', message: 'second' } as any);
      const id3 = manager.appendEvent('s1', { type: 'heartbeat' } as any);
      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(3);
      expect(manager.getLastEventId('s1')).toBe(3);
    });

    it('returns -1 for unknown session', () => {
      expect(manager.appendEvent('nonexistent', { type: 'progress' } as any)).toBe(-1);
      expect(manager.getLastEventId('nonexistent')).toBe(0);
    });

    it('returns events after a given lastEventId', () => {
      manager.createSession('1.0.0', 's1');
      manager.appendEvent('s1', { type: 'progress', message: 'a' } as any); // id 1
      manager.appendEvent('s1', { type: 'progress', message: 'b' } as any); // id 2
      manager.appendEvent('s1', { type: 'heartbeat' } as any);               // id 3

      const after1 = manager.getEventsAfter('s1', 1);
      expect(after1).toHaveLength(2);
      expect(after1[0].id).toBe(2);
      expect(after1[1].id).toBe(3);

      const after3 = manager.getEventsAfter('s1', 3);
      expect(after3).toHaveLength(0);
    });

    it('returns empty for unknown session', () => {
      expect(manager.getEventsAfter('nonexistent', 0)).toHaveLength(0);
    });
  });

  describe('event buffer eviction', () => {
    it('evicts oldest entries when size cap exceeded', () => {
      manager = new SessionManager({ replayBufferSize: 3, replayBufferTtlMs: 60_000 });
      manager.createSession('1.0.0', 's1');
      manager.appendEvent('s1', { type: 'progress', message: 'a' } as any); // id 1
      manager.appendEvent('s1', { type: 'progress', message: 'b' } as any); // id 2
      manager.appendEvent('s1', { type: 'progress', message: 'c' } as any); // id 3
      manager.appendEvent('s1', { type: 'progress', message: 'd' } as any); // id 4, evicts id 1

      const after0 = manager.getEventsAfter('s1', 0);
      expect(after0).toHaveLength(3);
      expect(after0.map((e) => e.id)).toEqual([2, 3, 4]);
    });

    it('evicts entries older than TTL', () => {
      vi.useFakeTimers();
      manager = new SessionManager({ replayBufferSize: 100, replayBufferTtlMs: 100 });
      manager.createSession('1.0.0', 's1');
      manager.appendEvent('s1', { type: 'progress', message: 'old' } as any); // id 1
      vi.advanceTimersByTime(150);
      manager.appendEvent('s1', { type: 'progress', message: 'new' } as any); // id 2

      const all = manager.getEventsAfter('s1', 0);
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(2);
      vi.useRealTimers();
    });
  });

  describe('includeBrep', () => {
    it('defaults to true', () => {
      manager.createSession('1.0.0', 's1');
      expect(manager.getIncludeBrep('s1')).toBe(true);
    });

    it('can be set and retrieved', () => {
      manager.createSession('1.0.0', 's1');
      manager.setIncludeBrep('s1', false);
      expect(manager.getIncludeBrep('s1')).toBe(false);
      manager.setIncludeBrep('s1', true);
      expect(manager.getIncludeBrep('s1')).toBe(true);
    });

    it('defaults to true for unknown session', () => {
      expect(manager.getIncludeBrep('nonexistent')).toBe(true);
    });
  });

  describe('ownerId', () => {
    it('stores ownerId when provided at creation', () => {
      const session = manager.createSession('1.0.0', 's1', 'user-1');
      expect(session.ownerId).toBe('user-1');
      expect(manager.getSession('s1')?.ownerId).toBe('user-1');
    });

    it('defaults ownerId to undefined when not provided', () => {
      const session = manager.createSession('1.0.0', 's1');
      expect(session.ownerId).toBeUndefined();
    });

    it('getAllSessions includes ownerId', () => {
      manager.createSession('1.0.0', 's1', 'user-a');
      manager.createSession('2.0.0', 's2', 'user-b');
      const all = manager.getAllSessions();
      expect(all.find((s) => s.id === 's1')?.ownerId).toBe('user-a');
      expect(all.find((s) => s.id === 's2')?.ownerId).toBe('user-b');
    });
  });

  describe('getAllSessions', () => {
    it('returns all sessions', () => {
      manager.createSession('1.0.0', 's1');
      manager.createSession('2.0.0', 's2');
      const all = manager.getAllSessions();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.id).sort()).toEqual(['s1', 's2']);
    });
  });
});
