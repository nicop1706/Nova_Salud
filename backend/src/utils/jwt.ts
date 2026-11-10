import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types/express';

interface AccessPayload {
  sub: string;
  email: string;
  name: string;
  role: AuthUser['role'];
}

export function signAccessToken(user: AuthUser): string {
  const payload: AccessPayload = { sub: String(user.id), email: user.email, name: user.name, role: user.role };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    issuer: 'nova-salud',
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AuthUser {
  const p = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'nova-salud', algorithms: ['HS256'] }) as AccessPayload;
  return { id: Number(p.sub), email: p.email, name: p.name, role: p.role };
}

export function signRefreshToken(userId: number): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const token = jwt.sign({ sub: String(userId), jti: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
    issuer: 'nova-salud',
    algorithm: 'HS256',
  });
  return { token, expiresAt };
}

export function verifyRefreshToken(token: string): { userId: number } {
  const p = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'nova-salud', algorithms: ['HS256'] }) as {
    sub: string;
  };
  return { userId: Number(p.sub) };
}

/** Los refresh tokens se guardan hasheados: si se filtra la BD no sirven. */
export const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');
