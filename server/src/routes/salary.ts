import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { bsToAd } from '../lib/nepaliDate.js';

const router = Router();
router.use(authRequired);

/** Number of days in a given Bikram Sambat month (varies 28–32). Computed from the
 *  calendar itself: AD gap between the 1st of this BS month and the 1st of the next. */
function bsMonthDays(year: number, month: number): number {
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = bsToAd(`${year}-${pad(month)}-01`);
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  const next = bsToAd(`${ny}-${pad(nm)}-01`);
  if (!start || !next) return 30; // safe fallback
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

/** Shared, authoritative salary math (same formula the client previews with).
 *  The first absent day is excused; deduction applies to (absentDays − 1) days. */
function computePay(total: number, days: number, absentDays: number) {
  const tds = Math.round(total * 0.01);                       // 1% of salary
  const perDay = days > 0 ? total / days : 0;
  const deductibleDays = Math.max(0, absentDays - 1);         // 1 day excused (no deduction)
  const absentDeduction = Math.round(perDay * deductibleDays);
  const net = Math.round(total - tds - absentDeduction);
  return { tds, perDay, absentDeduction, net };
}

/** GET /api/salary — the salary roster (ordered to match the physical sheet). */
router.get('/', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const rows = await prisma.salaryEmployee.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
  res.json(rows);
}));

/** POST /api/salary (ADMIN) — add a staff row to the roster. */
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, post, idNo, total, order } = req.body || {};
  if (!name || !String(name).trim()) throw new AppError(400, 'name required');
  const max = await prisma.salaryEmployee.aggregate({ _max: { order: true } });
  const row = await prisma.salaryEmployee.create({
    data: {
      name: String(name).trim(),
      post: post ? String(post).trim() : null,
      idNo: idNo ? String(idNo).trim() : null,
      total: Number(total || 0),
      order: Number.isFinite(Number(order)) ? Number(order) : (max._max.order ?? 0) + 1,
    },
  });
  res.status(201).json(row);
}));

/** PUT /api/salary/:id (ADMIN) — edit a roster row. */
router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { name, post, idNo, total, order } = req.body || {};
  const data: any = {};
  if (name !== undefined) data.name = String(name).trim();
  if (post !== undefined) data.post = post ? String(post).trim() : null;
  if (idNo !== undefined) data.idNo = idNo ? String(idNo).trim() : null;
  if (total !== undefined) data.total = Number(total || 0);
  if (order !== undefined) data.order = Number(order || 0);
  const row = await prisma.salaryEmployee.update({ where: { id }, data });
  res.json(row);
}));

/** DELETE /api/salary/:id (ADMIN) — remove a roster row. */
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.salaryEmployee.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

/* ---------- monthly salary payments ---------- */

/** GET /api/salary/month-days?year=&month= — days in that BS month (for live preview). */
router.get('/month-days', asyncHandler(async (req, res) => {
  const year = Number(req.query.year), month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) throw new AppError(400, 'year and month (1-12) required');
  res.json({ year, month, days: bsMonthDays(year, month) });
}));

/** GET /api/salary/payments?year=&month= — all payments made for a BS month. */
router.get('/payments', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const year = Number(req.query.year), month = Number(req.query.month);
  if (!year || !month) throw new AppError(400, 'year and month required');
  const rows = await prisma.salaryPayment.findMany({ where: { bsYear: year, bsMonth: month } });
  res.json(rows);
}));

/** POST /api/salary/:id/pay (ADMIN) — record a monthly salary payment.
 *  TDS = 1% of salary; absent deduction = (salary / days-in-BS-month) × absentDays. */
router.post('/:id/pay', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const employeeId = intParam(req.params.id);
  const { year, month, absentDays, paid } = req.body || {};
  const y = Number(year), m = Number(month);
  if (!y || !m || m < 1 || m > 12) throw new AppError(400, 'year and month (1-12) required');
  const emp = await prisma.salaryEmployee.findUnique({ where: { id: employeeId } });
  if (!emp) throw new AppError(404, 'Staff not found');

  const absent = Math.max(0, Math.floor(Number(absentDays || 0)));
  const days = bsMonthDays(y, m);
  const { tds, absentDeduction, net } = computePay(emp.total, days, absent);
  const paidAmount = paid === '' || paid === null || paid === undefined ? net : Number(paid);

  const row = await prisma.salaryPayment.upsert({
    where: { employeeId_bsYear_bsMonth: { employeeId, bsYear: y, bsMonth: m } },
    update: { total: emp.total, absentDays: absent, tds, absentDeduction, paid: paidAmount, paidAt: new Date() },
    create: { employeeId, bsYear: y, bsMonth: m, total: emp.total, absentDays: absent, tds, absentDeduction, paid: paidAmount },
  });
  res.status(201).json({ ...row, days });
}));

/** DELETE /api/salary/payment/:id (ADMIN) — undo a monthly payment. */
router.delete('/payment/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.salaryPayment.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

export default router;
