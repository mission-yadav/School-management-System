import prisma from '../prisma.js';
import Pkg from 'nepali-date-converter';

let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

// BS months (Baisakh = 1 … Chaitra = 12)
export const BS_MONTHS = ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'];

export type BSPeriod = { year: number; month: number };

/** Map studentId -> serial number (S.N.), assigned 1..N by class order DESCENDING
 *  (highest class first, e.g. 9 -> P.G.) then name A-Z. One query; reused for a whole request. */
export async function buildSerialMap(): Promise<Map<number, number>> {
  const all = await prisma.student.findMany({ select: { id: true, name: true, class: { select: { order: true } } } });
  all.sort((a, b) => (b.class?.order ?? -1) - (a.class?.order ?? -1) || a.name.localeCompare(b.name));
  const m = new Map<number, number>();
  all.forEach((s, i) => m.set(s.id, i + 1));
  return m;
}
/** Format a bill/receipt number as "JSS-<SN>/<billing year>", e.g. JSS-01/2083 (SN min 2 digits). */
export function serialNo(sn: number | undefined, year: number): string {
  return `JSS-${String(sn || 0).padStart(2, '0')}/${year}`;
}

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

// One-time headings added when the ledger begins. Annual Charge (yearly) and Computer Fee
// (monthly) are NOT here — they recur; see ensureLedger.
const HEADINGS: { key: string; label: string }[] = [
  { key: 'examFee', label: 'Exam Fee' },
  { key: 'miscCharge', label: 'Miscellaneous Charges' },
];

// A dated monthly line reads "Bhadra 2083 – Tuition Fee". Tuition and Computer Fee both recur
// per month; classify dated (bsMonth) lines by their trailing label so they never mix.
const monthDesc = (m: number, y: number, suffix: string) => `${BS_MONTHS[m - 1]} ${y} – ${suffix}`;
export const isTuitionLine = (i: { description: string; bsMonth?: number | null }) => i.bsMonth != null && i.description.endsWith('Tuition Fee');
export const isComputerLine = (i: { description: string; bsMonth?: number | null }) => i.bsMonth != null && i.description.endsWith('Computer Fee');

/**
 * The student's current per-month tuition rate = the amount of their most recent tuition line.
 * New months inherit this, so an individually-set amount carries forward every month until it's
 * changed again — the month advance no longer snaps it back to the class's common fee.
 * Returns undefined when there are no tuition lines yet (brand-new ledger -> use class default).
 */
function latestTuitionAmount(items: { description: string; bsYear?: number | null; bsMonth?: number | null; amount: number }[]): number | undefined {
  const tuition = items.filter(isTuitionLine);
  if (!tuition.length) return undefined;
  const latest = tuition.reduce((a, b) =>
    (b.bsYear! > a.bsYear!) || (b.bsYear! === a.bsYear! && b.bsMonth! > a.bsMonth!) ? b : a
  );
  return latest.amount;
}

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
  // Carry the student's current individual monthly tuition forward (their latest tuition line),
  // falling back to the class default only for a brand-new ledger.
  const monthly = student.feeFree ? 0 : (latestTuitionAmount(inv.items) ?? s?.monthlyTuition ?? 0);
  const toCreate: any[] = [];

  // A carried-forward "Previous Dues" opening balance already includes that month's charges, so we
  // never add a separate tuition or computer line for a month it covers (that would double-count).
  const prevDuesMonths = new Set(inv.items.filter((i) => i.description === 'Previous Dues' && i.bsMonth != null).map((i) => `${i.bsYear}-${i.bsMonth}`));

  const tuitionMonths = new Set(inv.items.filter(isTuitionLine).map((i) => `${i.bsYear}-${i.bsMonth}`));
  for (let m = 1; m <= month; m++) {
    const key = `${year}-${m}`;
    if (!tuitionMonths.has(key) && !prevDuesMonths.has(key))
      toCreate.push({ invoiceId: inv.id, description: monthDesc(m, year, 'Tuition Fee'), amount: monthly, bsYear: year, bsMonth: m });
  }

  // Computer Fee recurs monthly, exactly like tuition — charged only when the class has one, one
  // line per elapsed month, and never for a month already inside Previous Dues. Drop any legacy
  // one-time "Computer Fee" heading so it isn't double-counted alongside the monthly lines.
  if (inv.items.some((i) => i.bsMonth == null && i.description === 'Computer Fee'))
    await prisma.feeItem.deleteMany({ where: { invoiceId: inv.id, bsMonth: null, description: 'Computer Fee' } });
  const computer = s?.computerFee ?? 0;
  if (computer > 0) {
    const computerMonths = new Set(inv.items.filter(isComputerLine).map((i) => `${i.bsYear}-${i.bsMonth}`));
    for (let m = 1; m <= month; m++) {
      const key = `${year}-${m}`;
      if (!computerMonths.has(key) && !prevDuesMonths.has(key))
        toCreate.push({ invoiceId: inv.id, description: monthDesc(m, year, 'Computer Fee'), amount: computer, bsYear: year, bsMonth: m });
    }
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

  if (toCreate.length) await prisma.$transaction(toCreate.map((d) => prisma.feeItem.create({ data: d })));
  return inv.id;
}

/**
 * Ensure ledgers exist and are accrued for every active student — BULK.
 * Mirrors ensureLedger's logic exactly but in a handful of queries (bulk load +
 * createMany/deleteMany) instead of N+1 per-student round-trips, so listing fees
 * over a remote (Neon) database stays fast. Idempotent: a second run is a no-op.
 */
export async function ensureAllLedgers(): Promise<void> {
  const { year, month } = await getBillingPeriod();
  const students = await prisma.student.findMany({
    where: { status: 'ACTIVE' },
    include: { class: { include: { feeStructure: true } } },
  });
  if (!students.length) return;
  const ids = students.map((s) => s.id);

  // Create any missing ledger invoices in one batch, then (re)load all ledgers with items.
  const existing = await prisma.feeInvoice.findMany({ where: { isLedger: true, studentId: { in: ids } }, select: { studentId: true } });
  const have = new Set(existing.map((l) => l.studentId));
  const missing = students.filter((s) => !have.has(s.id));
  if (missing.length) {
    await prisma.feeInvoice.createMany({
      data: missing.map((s) => ({ studentId: s.id, title: `Fee Ledger ${year}`, sessionLabel: `${year}`, isLedger: true })),
    });
  }
  const ledgers = await prisma.feeInvoice.findMany({ where: { isLedger: true, studentId: { in: ids } }, include: { items: true } });
  const byStudent = new Map(ledgers.map((l) => [l.studentId, l]));

  const itemsToCreate: any[] = [];
  const legacyComputerInvIds: number[] = [];
  const annualExemptInvIds: number[] = [];

  for (const student of students) {
    const inv = byStudent.get(student.id);
    if (!inv) continue;
    const s = student.class?.feeStructure;
    const items = inv.items;
    // Carry the student's current individual monthly tuition forward (see latestTuitionAmount).
    const monthly = student.feeFree ? 0 : (latestTuitionAmount(items) ?? s?.monthlyTuition ?? 0);

    const prevDuesMonths = new Set(items.filter((i) => i.description === 'Previous Dues' && i.bsMonth != null).map((i) => `${i.bsYear}-${i.bsMonth}`));
    const tuitionMonths = new Set(items.filter(isTuitionLine).map((i) => `${i.bsYear}-${i.bsMonth}`));
    for (let m = 1; m <= month; m++) {
      const key = `${year}-${m}`;
      if (!tuitionMonths.has(key) && !prevDuesMonths.has(key))
        itemsToCreate.push({ invoiceId: inv.id, description: monthDesc(m, year, 'Tuition Fee'), amount: monthly, bsYear: year, bsMonth: m });
    }

    if (items.some((i) => i.bsMonth == null && i.description === 'Computer Fee')) legacyComputerInvIds.push(inv.id);
    const computer = s?.computerFee ?? 0;
    if (computer > 0) {
      const computerMonths = new Set(items.filter(isComputerLine).map((i) => `${i.bsYear}-${i.bsMonth}`));
      for (let m = 1; m <= month; m++) {
        const key = `${year}-${m}`;
        if (!computerMonths.has(key) && !prevDuesMonths.has(key))
          itemsToCreate.push({ invoiceId: inv.id, description: monthDesc(m, year, 'Computer Fee'), amount: computer, bsYear: year, bsMonth: m });
      }
    }

    const haveDesc = new Set(items.filter((i) => !i.bsMonth).map((i) => i.description));
    const headings = HEADINGS.map((h) => [h.label, (s as any)?.[h.key] ?? 0] as [string, number]);
    if (student.usesTransport) headings.push(['Transportation Charge', student.transportFee ?? s?.transportFee ?? 0]);
    for (const [desc, amt] of headings) {
      if (amt > 0 && !haveDesc.has(desc)) itemsToCreate.push({ invoiceId: inv.id, description: desc, amount: amt, bsYear: null, bsMonth: null });
    }

    const annualItems = items.filter((i) => i.description === 'Annual Charge');
    const annualAmt = s?.annualCharge ?? 0;
    if (student.annualExempt) {
      if (annualItems.length) annualExemptInvIds.push(inv.id);
    } else if (annualAmt > 0) {
      const existingYears = items.filter((i) => i.bsMonth).map((i) => i.bsYear!);
      const startYear = existingYears.length ? Math.min(...existingYears) : year;
      const haveAnnual = new Set(annualItems.map((i) => i.bsYear));
      for (let y = startYear + 1; y <= year; y++) {
        if (!haveAnnual.has(y)) itemsToCreate.push({ invoiceId: inv.id, description: 'Annual Charge', amount: annualAmt, bsYear: y, bsMonth: null });
      }
    }
  }

  if (legacyComputerInvIds.length)
    await prisma.feeItem.deleteMany({ where: { invoiceId: { in: legacyComputerInvIds }, bsMonth: null, description: 'Computer Fee' } });
  if (annualExemptInvIds.length)
    await prisma.feeItem.deleteMany({ where: { invoiceId: { in: annualExemptInvIds }, description: 'Annual Charge' } });
  if (itemsToCreate.length)
    await prisma.feeItem.createMany({ data: itemsToCreate });
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
  const period = await getBillingPeriod();
  const students = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' } });
  for (const student of students) await syncOneLedger(student, cls.feeStructure, period);
  return students.length;
}

/** Re-apply a single student's current class fee structure to their ledger (used on promotion). */
export async function syncStudentLedger(studentId: number): Promise<void> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: { include: { feeStructure: true } } } });
  if (!student) return;
  await syncOneLedger(student, student.class?.feeStructure ?? null, await getBillingPeriod());
}

async function syncOneLedger(student: any, s: any, period: BSPeriod): Promise<void> {
  const invId = await ensureLedger(student.id, period);
  if (!invId) return;

  // month-wise tuition (target only tuition lines — never "Previous Dues" or monthly Computer Fee)
  const monthly = student.feeFree ? 0 : (s?.monthlyTuition ?? 0);
  await prisma.feeItem.updateMany({
    where: { invoiceId: invId, bsMonth: { not: null }, description: { endsWith: 'Tuition Fee' } },
    data: { amount: monthly },
  });

  // month-wise computer fee — re-price every month's line, or strip them all if set to 0
  const computer = s?.computerFee ?? 0;
  if (computer > 0) await prisma.feeItem.updateMany({ where: { invoiceId: invId, bsMonth: { not: null }, description: { endsWith: 'Computer Fee' } }, data: { amount: computer } });
  else await prisma.feeItem.deleteMany({ where: { invoiceId: invId, bsMonth: { not: null }, description: { endsWith: 'Computer Fee' } } });

  // Annual charge recurs yearly — update every year's line to the new amount (or remove
  // all if set to 0 or the student is exempt). Never create here; ensureLedger adds them.
  const annualAmt = s?.annualCharge ?? 0;
  if (annualAmt > 0 && !student.annualExempt) await prisma.feeItem.updateMany({ where: { invoiceId: invId, description: 'Annual Charge' }, data: { amount: annualAmt } });
  else await prisma.feeItem.deleteMany({ where: { invoiceId: invId, description: 'Annual Charge' } });

  // canonical one-time headings -> desired amount (0 = remove). Computer Fee is monthly now (above).
  const desired: [string, number][] = [
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
