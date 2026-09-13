import { Router } from 'express';
import Pkg from 'nepali-date-converter';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';
import { BS_MONTHS } from '../lib/ledger.js';

// unwrap the double-wrapped default export to the constructor (same pattern as lib/nepaliDate)
let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

const OPENING_REF = 'OPENING'; // carried-forward "Previous Paid" — not a real cash collection

const router = Router();
router.use(authRequired);

/** GET /api/collections — every real cash collection, with Bikram Sambat date parts for
 *  year → month → day grouping on the client. Columns: date, student, class, amount, receipt. */
router.get('/', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const payments = await prisma.payment.findMany({
    // every real cash collection: amount > 0, excluding only the carried-forward
    // "Previous Paid" opening entries (reference = OPENING). Most real payments have a
    // NULL reference, so we must include NULLs explicitly — `NOT reference='OPENING'`
    // alone drops them (NULL <> 'OPENING' is NULL, i.e. not true) in SQL.
    where: { amount: { gt: 0 }, OR: [{ reference: null }, { reference: { not: OPENING_REF } }] },
    orderBy: { paidAt: 'desc' },
    include: { invoice: { include: { student: { include: { class: { select: { name: true } } } } } } },
  });

  res.json(payments.map((p) => {
    let bsYear = 0, bsMonth = 0, bsDay = 0, bsMonthName = '', dateLabel = '';
    try {
      const n = new NepaliDate(new Date(p.paidAt));
      const bs = n.getBS(); // { year, month (0-indexed), date }
      bsYear = bs.year; bsMonth = bs.month + 1; bsDay = bs.date;
      bsMonthName = BS_MONTHS[bs.month] || '';
      dateLabel = n.format('DD MMMM YYYY');
    } catch { /* leave defaults */ }
    const stu = p.invoice.student;
    return {
      id: p.id,
      paidAt: p.paidAt,
      amount: p.amount,
      method: p.method,
      studentId: stu.id,
      studentName: stu.name,
      className: stu.class?.name || null,
      bsYear, bsMonth, bsMonthName, bsDay, dateLabel,
    };
  }));
}));

export default router;
