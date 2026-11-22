import { v4 as uuidv4 } from 'uuid';
import { KernelStatus, SessionEvent } from '../../generated/proto/webcad/engine/v1/engine_pb.js';

export type SessionState = 'connected' | 'restarting' | 'rehydrating';

export interface SessionInfo {
  id: string;
  clientVersion: string;
  state: SessionState;
  kernelPid?: number;
  createdAt: number;
  lastActivity: number;
  lastEventId: number;
  includeBrep: boolean;
  ownerId?: string;
}

export interface SessionEventEntry {
  id: number;
  event: SessionEvent;
  timestamp: number;
}

export interface SessionManagerConfig {
  replayBufferSize?: number;      // proposed default: 1024
  replayBufferTtlMs?: number;     // proposed default: 120000 (2 minutes)
  heartbeatIntervalMs?: number;   // proposed default: 15000
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private eventBuffers = new Map<string, SessionEventEntry[]>();
  private readonly config: Required<SessionManagerConfig>;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      replayBufferSize: config.replayBufferSize ?? 1024,
      replayBufferTtlMs: config.replayBufferTtlMs ?? 120_000,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 15_000,
    };
  }

  createSession(clientVersion: string, sessionId?: string, ownerId?: string): SessionInfo {
    const id = sessionId ?? uuidv4();
    const session: SessionInfo = {
      id,
      clientVersion,
      state: 'connected',
      ownerId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      lastEventId: 0,
      includeBrep: true, // client is authoritative initially
    };
    this.sessions.set(id, session);
    this.eventBuffers.set(id, []);
    return session;
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id);
  }

  closeSession(id: string): boolean {
    const eventBuffer = this.eventBuffers.get(id);
    if (eventBuffer) {
      eventBuffer.length = 0;
      this.eventBuffers.delete(id);
    }
    return this.sessions.delete(id);
  }

  hasSession(id: string): boolean {
    return this.sessions.has(id);
  }

  updateActivity(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  setState(id: string, state: SessionState): void {
    const session = this.sessions.get(id);
    if (session) {
      session.state = state;
      session.lastActivity = Date.now();
    }
  }

  setKernelPid(id: string, pid: number): void {
    const session = this.sessions.get(id);
    if (session) {
      session.kernelPid = pid;
    }
  }

  appendEvent(sessionId: string, event: SessionEvent): number {
    const buffer = this.eventBuffers.get(sessionId);
    if (!buffer) return -1;

    const session = this.sessions.get(sessionId);
    if (!session) return -1;

    const eventId = ++session.lastEventId;
    const entry: SessionEventEntry = { id: eventId, event, timestamp: Date.now() };
    buffer.push(entry);

    // Enforce size cap (oldest first eviction)
    while (buffer.length > this.config.replayBufferSize) {
      buffer.shift();
    }

    // Enforce TTL eviction
    const cutoff = Date.now() - this.config.replayBufferTtlMs;
    while (buffer.length > 0 && buffer[0].timestamp < cutoff) {
      buffer.shift();
    }

    return eventId;
  }

  getEventsAfter(sessionId: string, lastEventId: number): SessionEventEntry[] {
    const buffer = this.eventBuffers.get(sessionId);
    if (!buffer) return [];
    return buffer.filter((e) => e.id > lastEventId);
  }

  getLastEventId(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session?.lastEventId ?? 0;
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  setIncludeBrep(sessionId: string, includeBrep: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.includeBrep = includeBrep;
    }
  }

  getIncludeBrep(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.includeBrep ?? true;
  }
}

export const sessionManager = new SessionManager();
