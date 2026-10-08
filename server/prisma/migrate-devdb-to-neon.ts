/**
 * One-time migration: copy ALL data from the local SQLite dev.db into the shared
 * PostgreSQL (Neon) database. Uses a Prisma client on BOTH sides so SQLite's stored
 * types (DateTime as ms-epoch ints, Boolean as 0/1, JSON-as-text strings) are read
 * back as proper JS Date/boolean/string and written to Postgres with correct types.
 *
 * Prereqs (see run-devdb-migration.sh):
 *   1. A SQLite Prisma client generated at ./.sqlite-client (from sqlite-src.prisma).
 *   2. Neon schema freshly reset (prisma db push --force-reset) so tables are empty.
 * After this, run reset-sequences.sql so Postgres id sequences continue past the copied ids.
 *
 * refreshToken is intentionally skipped (ephemeral session tokens).
 */
import pg from '../src/prisma.js'; // Postgres client (default @prisma/client, provider=postgresql)
// @ts-ignore - generated at build time by run-devdb-migration.sh
import { PrismaClient as SqliteClient } from './.sqlite-client/index.js';

const sqlite = new SqliteClient();

// FK-safe insertion order (parents before children).
const ORDER: string[] = [
  'user', 'parent', 'class', 'section', 'staff', 'subject', 'student',
  'feeStructure', 'timetableSlot', 'admissionRequest', 'studentAttendance',
  'teacherAttendance', 'holiday', 'leaveRequest', 'feeCategory', 'feeInvoice',
  'feeItem', 'payment', 'scholarship', 'exam', 'examClass', 'examSubject',
  'result', 'gradeScale', 'expenseCategory', 'vendor', 'expense', 'payslip',
  'certificate', 'notice', 'event', 'setting', 'book', 'vehicle',
];

let total = 0;
for (const model of ORDER) {
  const rows: any[] = await (sqlite as any)[model].findMany();
  if (!rows.length) { console.log(`  ${model}: 0`); continue; }
  try {
    await (pg as any)[model].createMany({ data: rows });
  } catch (e) {
    // Fall back to per-row so one bad row doesn't abort the whole model.
    let ok = 0;
    for (const row of rows) {
      try { await (pg as any)[model].create({ data: row }); ok++; }
      catch (err) { console.error(`  ! ${model} row failed:`, (err as Error).message.split('\n')[0]); }
    }
    console.log(`  ${model}: ${ok}/${rows.length} (per-row fallback)`);
    total += ok;
    continue;
  }
  console.log(`  ${model}: ${rows.length}`);
  total += rows.length;
}
console.log('migrated rows:', total);
await sqlite.$disconnect();
await pg.$disconnect();
