import { ConnectError, Code } from '@connectrpc/connect';
import * as crypto from 'node:crypto';

const DEFAULT_SECRET = 'dev-secret-change-in-production';
const CLOCK_SKEW_TOLERANCE_SECONDS = 30;
const ALLOWED_ALG = 'HS256';

export class AuthError extends ConnectError {
  constructor(message: string, public readonly code: Code = Code.Unauthenticated) {
    super(message, code);
  }
}

export interface JWTPayload {
  sub: string;           // principal (user id)
  sessionId?: string;    // NOT used for session id — sub is the principal
  projectId?: string;
  exp: number;
  iat: number;
  iss?: string;
  aud?: string;
}

export interface AuthConfig {
  secret: string;
  issuer?: string;
  audience?: string;
}

function base64urlDecode(input: string): Buffer {
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

function base64urlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export class JwtAuthenticator {
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    // Fail closed: refuse to start with default secret in production.
    if (config.secret === DEFAULT_SECRET && process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to start: default JWT secret in production');
    }
    this.config = config;
  }

  /** Validate JWT from Authorization: Bearer header. Returns payload or throws AuthError. */
  authenticate(authorization?: string): JWTPayload {
    if (!authorization) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    return this.verifyToken(match[1]);
  }

  private verifyToken(token: string): JWTPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode header to check algorithm (pin HS256, reject alg:none and confusion)
    let header: { alg?: string };
    try {
      header = JSON.parse(base64urlDecode(headerB64).toString('utf8'));
    } catch {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }
    if (header.alg !== ALLOWED_ALG) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    // Decode payload
    let payload: JWTPayload;
    try {
      payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as JWTPayload;
    } catch {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    // Require exp claim
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    // Clock-skew tolerance
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now - CLOCK_SKEW_TOLERANCE_SECONDS) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    // Verify issuer/audience if configured
    if (this.config.issuer && payload.iss !== this.config.issuer) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }
    if (this.config.audience && payload.aud !== this.config.audience) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    // Verify HMAC-SHA256 signature (constant-time comparison)
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', this.config.secret)
      .update(signingInput)
      .digest('base64url');
    if (!timingSafeEqual(signatureB64, expectedSig)) {
      throw new AuthError('Authentication required', Code.Unauthenticated);
    }

    return payload;
  }
}

export const authenticator = new JwtAuthenticator({
  secret: process.env.WEBCAD_JWT_SECRET ?? DEFAULT_SECRET,
  issuer: process.env.WEBCAD_JWT_ISSUER,
  audience: process.env.WEBCAD_JWT_AUDIENCE,
});

/** Dev-mode helper: signs a JWT with the default dev secret for tests. */
export function createTestToken(payload: Partial<JWTPayload>): string {
  const actualSecret = process.env.WEBCAD_JWT_SECRET ?? DEFAULT_SECRET;
  if (actualSecret !== DEFAULT_SECRET) {
    throw new Error('createTestToken only available with default dev secret');
  }

  const header = base64urlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    sub: 'test-user',
    exp: now + 3600,
    iat: now,
    ...payload,
  };
  const payloadB64 = base64urlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signingInput = `${header}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', DEFAULT_SECRET)
    .update(signingInput)
    .digest('base64url');
  return `${signingInput}.${signature}`;
}
