import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

function invoiceTotals(inv: { items: { amount: number }[]; payments: { amount: number }[]; fine: number; discount: number }) {
  const gross = inv.items.reduce((a, i) => a + i.amount, 0);
  const total = gross + inv.fine - inv.discount;
  const paid = inv.payments.reduce((a, p) => a + p.amount, 0);
  return { gross, total, paid, due: total - paid };
}
function statusFor(total: number, paid: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (paid <= 0) return 'PENDING';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/* ---- fee categories ---- */
router.get('/categories', asyncHandler(async (_req, res) => {
  res.json(await prisma.feeCategory.findMany({ orderBy: { name: 'asc' } }));
}));
router.post('/categories', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name) throw new AppError(400, 'name required');
  res.status(201).json(await prisma.feeCategory.create({ data: { name } }));
}));
router.delete('/categories/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.feeCategory.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

/* ---- invoices ---- */
/** GET /api/fees?studentId=&status= */
router.get('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, status } = req.query as Record<string, string>;
  const where: any = {};
  if (studentId) where.studentId = Number(studentId);
  if (status) where.status = status;
  const invoices = await prisma.feeInvoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { items: true, payments: true, student: { include: { class: { select: { name: true } } } } },
  });
  res.json(invoices.map((inv) => {
    const t = invoiceTotals(inv);
    return {
      id: inv.id, title: inv.title, studentId: inv.studentId,
      studentName: inv.student.name, className: inv.student.class?.name || null,
      dueDate: inv.dueDate, discount: inv.discount, fine: inv.fine,
      ...t, status: inv.status,
    };
  }));
}));

/** GET /api/fees/summary — dashboard/reports totals */
router.get('/summary', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const invoices = await prisma.feeInvoice.findMany({ include: { items: true, payments: true } });
  let billed = 0, collected = 0;
  for (const inv of invoices) { const t = invoiceTotals(inv); billed += t.total; collected += t.paid; }
  res.json({ billed, collected, due: billed - collected, invoiceCount: invoices.length });
}));

/** GET /api/fees/:id */
router.get('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const inv = await prisma.feeInvoice.findUnique({
    where: { id: intParam(req.params.id) },
    include: { items: { include: { category: true } }, payments: { orderBy: { paidAt: 'desc' } }, student: true },
  });
  if (!inv) throw new AppError(404, 'Invoice not found');
  res.json({ ...inv, ...invoiceTotals(inv) });
}));

/** POST /api/fees (ADMIN) — create invoice with line items */
router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, title, sessionLabel, dueDate, discount, fine, items } = req.body || {};
  if (!studentId || !title || !Array.isArray(items) || items.length === 0)
    throw new AppError(400, 'studentId, title and items[] required');
  const inv = await prisma.feeInvoice.create({
    data: {
      studentId: Number(studentId), title, sessionLabel: sessionLabel || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      discount: Number(discount || 0), fine: Number(fine || 0),
      items: { create: items.map((i: any) => ({ description: i.description, amount: Number(i.amount), categoryId: i.categoryId || null })) },
    },
  });
  res.status(201).json({ id: inv.id });
}));

/** POST /api/fees/:id/pay (ADMIN) — record a payment, recompute status */
router.post('/:id/pay', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { amount, method, reference } = req.body || {};
  const inv = await prisma.feeInvoice.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!inv) throw new AppError(404, 'Invoice not found');
  const pay = Number(amount);
  if (!pay || pay <= 0) throw new AppError(400, 'Valid amount required');

  const receiptNo = 'RCPT' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10);
  const { total, paid } = invoiceTotals(inv);
  const newStatus = statusFor(total, paid + pay);

  const [payment] = await prisma.$transaction([
    prisma.payment.create({
      data: { invoiceId: id, amount: pay, method: method || 'CASH', reference: reference || null, receiptNo, receivedById: req.user!.id },
    }),
    prisma.feeInvoice.update({ where: { id }, data: { status: newStatus } }),
  ]);
  res.json({ ok: true, receiptNo, paymentId: payment.id, status: newStatus });
}));

/** PUT /api/fees/:id (ADMIN) — adjust discount/fine/due */
router.put('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { discount, fine, dueDate } = req.body || {};
  const data: any = {};
  if (discount !== undefined) data.discount = Number(discount);
  if (fine !== undefined) data.fine = Number(fine);
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  const inv = await prisma.feeInvoice.update({ where: { id }, data, include: { items: true, payments: true } });
  const { total, paid } = invoiceTotals(inv);
  await prisma.feeInvoice.update({ where: { id }, data: { status: statusFor(total, paid) } });
  res.json({ ok: true });
}));

/** DELETE /api/fees/:id (ADMIN) */
router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.feeInvoice.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

/* ---- scholarships ---- */
router.post('/scholarships', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { studentId, name, amount, percent, note } = req.body || {};
  if (!studentId || !name) throw new AppError(400, 'studentId and name required');
  const s = await prisma.scholarship.create({
    data: { studentId: Number(studentId), name, amount: Number(amount || 0), percent: Number(percent || 0), note: note || null },
  });
  res.status(201).json(s);
}));
router.delete('/scholarships/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.scholarship.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

export default router;
