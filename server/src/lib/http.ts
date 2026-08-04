import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Throwable HTTP error with a status code. */
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Wrap async route handlers so thrown/rejected errors reach the error middleware. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Parse an id/param (string, query value, etc.) to a positive integer or throw 400. */
export function intParam(value: unknown, name = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, `Invalid ${name}`);
  return n;
}
