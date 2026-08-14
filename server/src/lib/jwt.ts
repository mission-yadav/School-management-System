import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export type Role = 'ADMIN' | 'TEACHER';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_access';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh';
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
export const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);

export interface AccessPayload {
  id: number;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, ACCESS_SECRET) as unknown as AccessPayload;
}

/** A refresh token is an opaque random string; we JWT-wrap it so it self-expires,
 *  and store only its SHA-256 hash in the DB (rotation + revocation). */
export function generateRefreshToken(userId: number): { token: string; hash: string; expiresAt: Date } {
  const jti = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign({ sub: userId, jti }, REFRESH_SECRET, { expiresIn: `${REFRESH_TTL_DAYS}d` } as jwt.SignOptions);
  const hash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  return { token, hash, expiresAt };
}

export function verifyRefreshToken(token: string): { sub: number; jti: string } {
  return jwt.verify(token, REFRESH_SECRET) as unknown as { sub: number; jti: string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
