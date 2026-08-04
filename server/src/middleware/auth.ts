import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { verifyAccessToken, type AccessPayload } from '../lib/jwt.js';
import { AppError } from '../lib/http.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Missing token'));
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, 'Forbidden: insufficient role'));
    }
    next();
  };
}
