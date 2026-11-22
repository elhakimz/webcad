import { Interceptor, Code } from '@connectrpc/connect';
import { authenticator, AuthError } from './auth.js';
import { sessionManager } from './session-manager.js';

export const authInterceptor: Interceptor = (next) => async (req) => {
  // OpenSession is the bootstrapping call - no auth required.
  // The handler optionally extracts a JWT to set ownerId.
  if (req.method.name === 'openSession') {
    return next(req);
  }

  // 1. Validate JWT from Authorization header (required for all other RPCs)
  const authHeader = req.header.get('authorization') ?? undefined;
  const payload = authenticator.authenticate(authHeader);
  const principal = payload.sub;

  // 2. Extract session id from x-session-id header or protobuf message header
  let sessionId = req.header.get('x-session-id');
  if (!sessionId) {
    sessionId = (req.message as any)?.header?.sessionId ?? (req.message as any)?.header?.session_id;
  }

  // 3. Session ownership check for RPCs that carry a session id
  if (sessionId) {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      throw new AuthError(`Session not found: ${sessionId}`, Code.NotFound);
    }
    if (session.ownerId !== principal) {
      throw new AuthError('Permission denied for this session', Code.PermissionDenied);
    }
  }

  return next(req);
};
