import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Connect through node-postgres (which uses Node/Electron's own TLS = BoringSSL) instead of
// Prisma's engine TLS (Windows Schannel). Schannel on Windows 7 cannot complete Neon's modern
// TLS handshake ("Error opening a TLS connection", os error -2146893018); Node's TLS can.
// Uses the DIRECT (non-pooled) Neon endpoint so node-postgres' prepared statements work.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000, // let idle connections close so Neon can auto-suspend
});
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});

export default prisma;
