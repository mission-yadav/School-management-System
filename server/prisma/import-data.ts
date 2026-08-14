/**
 * Load prisma/seed-data/export.json (exported from the old PostgreSQL DB) into the
 * current (SQLite) database. Inserts in dependency order and adapts the columns that
 * changed type on SQLite (Setting.value + Certificate.dataJson are now JSON text).
 * Safe to run on an empty DB. Skips ephemeral refresh tokens.
 */
import prisma from '../src/prisma.js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dump = JSON.parse(readFileSync(path.join(__dirname, 'seed-data', 'export.json'), 'utf8')) as Record<string, any[]>;

// (prisma delegate, transform) in FK-safe insertion order. refreshToken is intentionally omitted.
const ORDER: [string, ((r: any) => any)?][] = [
  ['user'], ['parent'], ['class'], ['section'], ['staff'], ['subject'], ['student'],
  ['feeStructure'], ['timetableSlot'], ['admissionRequest'], ['studentAttendance'],
  ['teacherAttendance'], ['holiday'], ['leaveRequest'], ['feeCategory'], ['feeInvoice'],
  ['feeItem'], ['payment'], ['scholarship'], ['exam'], ['examClass'], ['examSubject'],
  ['result'], ['gradeScale'], ['expenseCategory'], ['vendor'], ['expense'], ['payslip'],
  ['certificate', (r) => ({ ...r, dataJson: r.dataJson == null ? null : JSON.stringify(r.dataJson) })],
  ['notice'], ['event'],
  ['setting', (r) => ({ ...r, value: JSON.stringify(r.value) })],
  ['book'], ['vehicle'],
];

let total = 0;
for (const [model, transform] of ORDER) {
  const rows = (dump[model] || []).map((r) => (transform ? transform(r) : r));
  if (!rows.length) continue;
  for (const row of rows) {
    await (prisma as any)[model].create({ data: row });
  }
  total += rows.length;
  console.log(`  ${model}: ${rows.length}`);
}
console.log('imported rows:', total);
await prisma.$disconnect();
