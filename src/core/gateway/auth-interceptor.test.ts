import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Code } from '@connectrpc/connect';
import { authInterceptor } from './auth-interceptor.js';
import { authenticator, createTestToken } from './auth.js';
import { sessionManager } from './session-manager.js';

vi.mock('./auth.js', () => ({
  authenticator: {
    authenticate: vi.fn(),
  },
  createTestToken: vi.fn(() => 'fake.header.payload'),
  AuthError: class extends Error {
    constructor(public message: string, public code: Code = Code.Unauthenticated) {
      super(message);
    }
  },
}));

vi.mock('./session-manager.js', () => ({
  sessionManager: {
    getSession: vi.fn(),
  },
}));

const makeReq = (overrides: {
  methodName?: string;
  authHeader?: string | null;
  xSessionId?: string | null;
  messageHeaderSessionId?: string | null;
} = {}): any => {
  const {
    methodName = 'execute',
    authHeader = null,
    xSessionId = null,
    messageHeaderSessionId = null,
  } = overrides;
  return {
    method: { name: methodName },
    header: {
      get: vi.fn((key: string) => {
        if (key === 'authorization') return authHeader;
        if (key === 'x-session-id') return xSessionId;
        return null;
      }),
    },
    message: {
      header: {
        sessionId: messageHeaderSessionId,
      },
    },
  };
};

const makeNext = vi.fn(async (req: any) => req);

describe('authInterceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeNext.mockReset();
    makeNext.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('openSession bypass', () => {
    it('skips auth for openSession without JWT', async () => {
      const req = makeReq({ methodName: 'openSession' });
      await authInterceptor(makeNext)(req);
      expect(authenticator.authenticate).not.toHaveBeenCalled();
      expect(makeNext).toHaveBeenCalledWith(req);
    });
  });

  describe('JWT validation', () => {
    it('throws Unauthenticated when no Authorization header', async () => {
      vi.mocked(authenticator.authenticate).mockImplementation(() => {
        throw Object.assign(new Error('Authentication required'), { code: Code.Unauthenticated });
      });
      const req = makeReq({ authHeader: null });
      await expect(authInterceptor(makeNext)(req)).rejects.toThrow('Authentication required');
    });

    it('throws Unauthenticated for malformed header', async () => {
      vi.mocked(authenticator.authenticate).mockImplementation(() => {
        throw Object.assign(new Error('Authentication required'), { code: Code.Unauthenticated });
      });
      const req = makeReq({ authHeader: 'InvalidFormat' });
      await expect(authInterceptor(makeNext)(req)).rejects.toThrow('Authentication required');
    });

    it('validates JWT and passes through on success', async () => {
      const payload = { sub: 'user-1' };
      vi.mocked(authenticator.authenticate).mockReturnValue(payload as any);
      const req = makeReq({ authHeader: 'Bearer valid-token' });
      await authInterceptor(makeNext)(req);
      expect(authenticator.authenticate).toHaveBeenCalledWith('Bearer valid-token');
      expect(makeNext).toHaveBeenCalled();
    });
  });

  describe('session ownership', () => {
    const validPayload = { sub: 'user-1' };

    beforeEach(() => {
      vi.mocked(authenticator.authenticate).mockReturnValue(validPayload as any);
    });

    it('allows owner to access own session', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue({
        id: 'sess-1',
        ownerId: 'user-1',
      } as any);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: 'sess-1',
      });
      await authInterceptor(makeNext)(req);
      expect(sessionManager.getSession).toHaveBeenCalledWith('sess-1');
      expect(makeNext).toHaveBeenCalled();
    });

    it('returns NOT_FOUND for unknown session', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(undefined);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: 'sess-1',
      });
      await expect(authInterceptor(makeNext)(req)).rejects.toMatchObject({
        code: Code.NotFound,
      });
      expect(makeNext).not.toHaveBeenCalled();
    });

    it('returns PERMISSION_DENIED for cross-tenant session', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue({
        id: 'sess-1',
        ownerId: 'user-2',
      } as any);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: 'sess-1',
      });
      await expect(authInterceptor(makeNext)(req)).rejects.toMatchObject({
        code: Code.PermissionDenied,
      });
      expect(makeNext).not.toHaveBeenCalled();
    });

    it('skips session check when no session id present', async () => {
      vi.mocked(sessionManager.getSession).mockReturnValue(undefined);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: null,
        messageHeaderSessionId: null,
      });
      await authInterceptor(makeNext)(req);
      expect(sessionManager.getSession).not.toHaveBeenCalled();
      expect(makeNext).toHaveBeenCalled();
    });
  });

  describe('session id extraction', () => {
    it('reads session id from x-session-id header', async () => {
      vi.mocked(authenticator.authenticate).mockReturnValue({ sub: 'user-1' } as any);
      vi.mocked(sessionManager.getSession).mockReturnValue({ id: 'sess-1', ownerId: 'user-1' } as any);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: 'from-header',
        messageHeaderSessionId: 'from-message',
      });
      await authInterceptor(makeNext)(req);
      expect(sessionManager.getSession).toHaveBeenCalledWith('from-header');
    });

    it('falls back to message header session id', async () => {
      vi.mocked(authenticator.authenticate).mockReturnValue({ sub: 'user-1' } as any);
      vi.mocked(sessionManager.getSession).mockReturnValue({ id: 'sess-1', ownerId: 'user-1' } as any);
      const req = makeReq({
        authHeader: 'Bearer token',
        xSessionId: null,
        messageHeaderSessionId: 'from-message',
      });
      await authInterceptor(makeNext)(req);
      expect(sessionManager.getSession).toHaveBeenCalledWith('from-message');
    });
  });

  describe('createTestToken helper', () => {
    it('creates a valid dev token', () => {
      const token = createTestToken({ sub: 'test-user', projectId: 'proj-1' });
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });
});
