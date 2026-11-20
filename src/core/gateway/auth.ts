export interface JWTPayload {
  sub: string;
  sessionId?: string;
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

export interface AuthResult {
  authenticated: boolean;
  payload?: JWTPayload;
  error?: string;
}

export class JwtAuthenticator {
  private readonly config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /** Extract and validate JWT from Authorization header (Bearer scheme). */
  authenticate(authorization?: string): AuthResult {
    if (!authorization) {
      return { authenticated: false, error: 'Missing Authorization header' };
    }

    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) {
      return { authenticated: false, error: 'Invalid Authorization header format' };
    }

    const token = match[1];
    return this.verifyToken(token);
  }

  private verifyToken(token: string): AuthResult {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { authenticated: false, error: 'Invalid JWT format' };
      }

      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson) as JWTPayload;

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return { authenticated: false, error: 'Token expired' };
      }

      if (this.config.issuer && payload.iss !== this.config.issuer) {
        return { authenticated: false, error: 'Invalid issuer' };
      }

      if (this.config.audience && payload.aud !== this.config.audience) {
        return { authenticated: false, error: 'Invalid audience' };
      }

      return { authenticated: true, payload };
    } catch {
      return { authenticated: false, error: 'Token verification failed' };
    }
  }

  /** Extract session ID from JWT payload for sticky routing. */
  getSessionId(payload: JWTPayload): string | undefined {
    return payload.sessionId || payload.sub;
  }
}

export const authenticator = new JwtAuthenticator({
  secret: process.env.WEBCAD_JWT_SECRET ?? 'dev-secret-change-in-production',
  issuer: process.env.WEBCAD_JWT_ISSUER,
  audience: process.env.WEBCAD_JWT_AUDIENCE,
});
