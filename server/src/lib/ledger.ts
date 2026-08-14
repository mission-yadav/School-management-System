import prisma from '../prisma.js';
import Pkg from 'nepali-date-converter';

let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

// BS months (Baisakh = 1 … Chaitra = 12)
export const BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export type BSPeriod = { year: number; month: number };

/** Real-world current Bikram Sambat year and month (1-indexed), from today's date. */
export function currentBS(): BSPeriod {
  const bs = new NepaliDate(new Date()).getBS();
  return { year: bs.year, month: bs.month + 1 };
}

const BILLING_KEY = 'billingPeriod';

/** The admin-controlled billing month (BS). Charges accrue up to this month, not the calendar
 *  month — the admin advances it manually. Initialised to the real current month on first use. */
export async function getBillingPeriod(): Promise<BSPeriod> {
  const row = await prisma.setting.findUnique({ where: { key: BILLING_KEY } });
  let v: any = null;
  try { v = row ? JSON.parse(row.value) : null; } catch { v = null; }
  if (v && typeof v.year === 'number' && typeof v.month === 'number' && v.month >= 1 && v.month <= 12) {
    return { year: v.year, month: v.month };
  }
  const now = currentBS();
  return setBillingPeriod(now.year, now.month);
}

export async function setBillingPeriod(year: number, month: number): Promise<BSPeriod> {
  const p = { year, month };
  const value = JSON.stringify(p);
  await prisma.setting.upsert({ where: { key: BILLING_KEY }, update: { value }, create: { key: BILLING_KEY, value } });
  return p;
}

/** The month immediately after the given period (rolls the BS year at Chaitra). */
export function nextPeriod({ year, month }: BSPeriod): BSPeriod {
  return month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** The month immediately before the given period (rolls the BS year at Baisakh). */
export function previousPeriod({ year, month }: BSPeriod): BSPeriod {
  return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Advance the billing month by one and persist. Caller should re-accrue ledgers afterwards. */
export async function advanceBillingPeriod(): Promise<BSPeriod> {
  const next = nextPeriod(await getBillingPeriod());
  return setBillingPeriod(next.year, next.month);
}

/** True when a billed month exists before the current billing month (so a revert is possible). */
export async function canRevertBilling(): Promise<boolean> {
  const cur = await getBillingPeriod();
  const earlier = await prisma.feeItem.findFirst({
    where: {
      bsMonth: { not: null },
      NOT: { description: 'Previous Dues' },
      OR: [{ bsYear: { lt: cur.year } }, { bsYear: cur.year, bsMonth: { lt: cur.month } }],
    },
    select: { id: true },
  });
  return !!earlier;
}

/** Recompute PENDING/PARTIAL/PAID for every ledger (after amounts change). */
async function recomputeAllStatuses(): Promise<void> {
  const invs = await prisma.feeInvoice.findMany({ where: { isLedger: true }, include: { items: true, payments: true } });
  for (const inv of invs) {
    const total = inv.items.reduce((a, i) => a + i.amount, 0) + inv.fine - inv.discount;
    const settled = inv.payments.reduce((a, p) => a + p.amount + (p.less || 0), 0);
    const status = settled <= 0 ? 'PENDING' : settled >= total ? 'PAID' : 'PARTIAL';
    await prisma.feeInvoice.update({ where: { id: inv.id }, data: { status } });
  }
}

/** Step the billing month back by one: removes that month's auto-added tuition lines from
 *  every ledger (keeping consolidated "Previous Dues") and recomputes statuses. Returns the
 *  new (previous) period. Caller should ensure canRevertBilling() first. */
export async function revertBillingPeriod(): Promise<BSPeriod> {
  const cur = await getBillingPeriod();
  await prisma.feeItem.deleteMany({ where: { bsYear: cur.year, bsMonth: cur.month, NOT: { description: 'Previous Dues' } } });
  const prev = previousPeriod(cur);
  await setBillingPeriod(prev.year, prev.month);
  await recomputeAllStatuses();
  return prev;
}

// One-time headings added when the ledger begins. Annual Charge is NOT here — it
// recurs once a year (see the annual-charge block in ensureLedger).
const HEADINGS: { key: string; label: string }[] = [
  { key: 'computerFee', label: 'Computer Fee' },
  { key: 'examFee', label: 'Exam Fee' },
  { key: 'miscCharge', label: 'Miscellaneous Charges' },
];

/**
 * Ensure a student has a running fee ledger (one FeeInvoice, isLedger=true) and that it
 * has a monthly-tuition line for every BS month elapsed this session + the standard headings.
 * Returns the ledger invoice id. Never overwrites amounts that already exist (they stay editable).
 */
export async function ensureLedger(studentId: number, period?: BSPeriod): Promise<number | null> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: { include: { feeStructure: true } } },
  });
  if (!student) return null;

  const { year, month } = period ?? await getBillingPeriod();
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

  // Annual charge: once per BS year, starting the year AFTER the ledger began — so the
  // (mid-year) setup year is skipped, then it's added at Baisakh of every following year.
  // A per-student exemption (annualExempt) disables it and strips any existing annual lines.
  const annualItems = inv.items.filter((i) => i.description === 'Annual Charge');
  const annualAmt = s?.annualCharge ?? 0;
  if (student.annualExempt) {
    if (annualItems.length) await prisma.feeItem.deleteMany({ where: { invoiceId: inv.id, description: 'Annual Charge' } });
  } else if (annualAmt > 0) {
    const existingYears = inv.items.filter((i) => i.bsMonth).map((i) => i.bsYear!);
    const startYear = existingYears.length ? Math.min(...existingYears) : year;
    const haveAnnual = new Set(annualItems.map((i) => i.bsYear));
    for (let y = startYear + 1; y <= year; y++) {
      if (!haveAnnual.has(y)) toCreate.push({ invoiceId: inv.id, description: 'Annual Charge', amount: annualAmt, bsYear: y, bsMonth: null });
    }
  }

  if (toCreate.length) await prisma.feeItem.createMany({ data: toCreate });
  return inv.id;
}

/** Ensure ledgers exist for every active student (used before listing). */
export async function ensureAllLedgers(): Promise<void> {
  const period = await getBillingPeriod();
  const students = await prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  for (const s of students) await ensureLedger(s.id, period);
}

/**
 * Re-apply a class's fee structure to every existing ledger in that class:
 * updates each month's tuition amount and the canonical heading charges — adding,
 * updating, or removing them so the bills match the structure. Consolidated
 * "Previous Dues" lines, per-student Free/Transport flags and any custom
 * (non-canonical) charges are left untouched. Returns the number of ledgers synced.
 */
export async function syncClassLedgers(classId: number): Promise<number> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, include: { feeStructure: true } });
  if (!cls) return 0;
  const s = cls.feeStructure;
  const period = await getBillingPeriod();
  const students = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' } });

  for (const student of students) {
    const invId = await ensureLedger(student.id, period);
    if (!invId) continue;

    // month-wise tuition (leave any consolidated "Previous Dues" line alone)
    const monthly = student.feeFree ? 0 : (s?.monthlyTuition ?? 0);
    await prisma.feeItem.updateMany({
      where: { invoiceId: invId, bsMonth: { not: null }, NOT: { description: 'Previous Dues' } },
      data: { amount: monthly },
    });

    // Annual charge recurs yearly — update every year's line to the new amount (or remove
    // all if set to 0 or the student is exempt). Never create here; ensureLedger adds them.
    const annualAmt = s?.annualCharge ?? 0;
    if (annualAmt > 0 && !student.annualExempt) await prisma.feeItem.updateMany({ where: { invoiceId: invId, description: 'Annual Charge' }, data: { amount: annualAmt } });
    else await prisma.feeItem.deleteMany({ where: { invoiceId: invId, description: 'Annual Charge' } });

    // canonical one-time headings -> desired amount (0 = remove)
    const desired: [string, number][] = [
      ['Computer Fee', s?.computerFee ?? 0],
      ['Exam Fee', s?.examFee ?? 0],
      ['Miscellaneous Charges', s?.miscCharge ?? 0],
      ['Transportation Charge', student.usesTransport ? (student.transportFee ?? s?.transportFee ?? 0) : 0],
    ];
    for (const [desc, amt] of desired) {
      const existing = await prisma.feeItem.findFirst({ where: { invoiceId: invId, bsMonth: null, description: desc } });
      if (amt > 0) {
        if (existing) await prisma.feeItem.update({ where: { id: existing.id }, data: { amount: amt } });
        else await prisma.feeItem.create({ data: { invoiceId: invId, description: desc, amount: amt, bsYear: null, bsMonth: null } });
      } else if (existing) {
        await prisma.feeItem.delete({ where: { id: existing.id } });
      }
    }

    // recompute status
    const inv = await prisma.feeInvoice.findUnique({ where: { id: invId }, include: { items: true, payments: true } });
    if (inv) {
      const total = inv.items.reduce((a, i) => a + i.amount, 0) + inv.fine - inv.discount;
      const settled = inv.payments.reduce((a, p) => a + p.amount + (p.less || 0), 0);
      const status = settled <= 0 ? 'PENDING' : settled >= total ? 'PAID' : 'PARTIAL';
      await prisma.feeInvoice.update({ where: { id: invId }, data: { status } });
    }
  }
  return students.length;
}
