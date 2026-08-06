import prisma from '../prisma.js';
import Pkg from 'nepali-date-converter';

let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

// BS months (Baisakh = 1 … Chaitra = 12)
export const BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

/** Current Bikram Sambat year and month (1-indexed). */
export function currentBS(): { year: number; month: number } {
  const bs = new NepaliDate(new Date()).getBS();
  return { year: bs.year, month: bs.month + 1 };
}

const HEADINGS: { key: string; label: string }[] = [
  { key: 'annualCharge', label: 'Annual Charge' },
  { key: 'computerFee', label: 'Computer Fee' },
  { key: 'examFee', label: 'Exam Fee' },
  { key: 'miscCharge', label: 'Miscellaneous Charges' },
];

/**
 * Ensure a student has a running fee ledger (one FeeInvoice, isLedger=true) and that it
 * has a monthly-tuition line for every BS month elapsed this session + the standard headings.
 * Returns the ledger invoice id. Never overwrites amounts that already exist (they stay editable).
 */
export async function ensureLedger(studentId: number): Promise<number | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: { include: { feeStructure: true } } },
  });
  if (!student) return null;

  const { year, month } = currentBS();
  let inv = await prisma.feeInvoice.findFirst({ where: { studentId, isLedger: true }, include: { items: true } });
  if (!inv) {
    inv = await prisma.feeInvoice.create({
      data: { studentId, title: `Fee Ledger ${year}`, sessionLabel: `${year}`, isLedger: true },
      include: { items: true },
    });
  }

  const s = student.class?.feeStructure;
  const monthly = student.feeFree ? 0 : (s?.monthlyTuition ?? 0);
  const toCreate: any[] = [];

  const haveMonths = new Set(inv.items.filter((i) => i.bsMonth).map((i) => `${i.bsYear}-${i.bsMonth}`));
  for (let m = 1; m <= month; m++) {
    if (!haveMonths.has(`${year}-${m}`))
      toCreate.push({ invoiceId: inv.id, description: `${BS_MONTHS[m - 1]} ${year} – Tuition Fee`, amount: monthly, bsYear: year, bsMonth: m });
  }

  const haveDesc = new Set(inv.items.filter((i) => !i.bsMonth).map((i) => i.description));
  const headings = HEADINGS.map((h) => [h.label, (s as any)?.[h.key] ?? 0] as [string, number]);
  if (student.usesTransport) headings.push(['Transportation Charge', student.transportFee ?? s?.transportFee ?? 0]);
  for (const [desc, amt] of headings) {
    if (amt > 0 && !haveDesc.has(desc)) toCreate.push({ invoiceId: inv.id, description: desc, amount: amt, bsYear: null, bsMonth: null });
  }

  if (toCreate.length) await prisma.feeItem.createMany({ data: toCreate });
  return inv.id;
}

/** Ensure ledgers exist for every active student (used before listing). */
export async function ensureAllLedgers(): Promise<void> {
  const students = await prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  for (const s of students) await ensureLedger(s.id);
}
