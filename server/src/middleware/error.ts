import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/http.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') || 'field';
      return res.status(409).json({ error: `Duplicate value for ${target}` });
    }
    if (err.code === 'P2025') return res.status(404).json({ error: 'Record not found' });
    return res.status(400).json({ error: 'Database request error' });
  }
  if (err instanceof Error && err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation failed', details: JSON.parse(err.message) });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
