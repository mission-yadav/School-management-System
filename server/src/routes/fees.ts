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
    include: { items: true, payments: true, student: { include: { class: { select: { id: true, name: true } } } } },
  });
  res.json(invoices.map((inv) => {
    const t = invoiceTotals(inv);
    return {
      id: inv.id, title: inv.title, studentId: inv.studentId,
      studentName: inv.student.name, iemis: inv.student.iemis,
      classId: inv.student.class?.id || null, className: inv.student.class?.name || null,
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

/* -------------------------------------------------- fee structure (per class) */
function emptyStructure(classId: number) {
  return { classId, annualCharge: 0, monthlyTuition: 0, computerFee: 0, examFee: 0, transportFee: 0, miscCharge: 0 };
}

/** GET /api/fees/structure — every class with its fee structure */
router.get('/structure', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const classes = await prisma.class.findMany({ orderBy: { name: 'asc' }, include: { feeStructure: true } });
  res.json(classes.map((c) => {
    const s = c.feeStructure;
    return {
      classId: c.id, className: c.name,
      annualCharge: s?.annualCharge ?? 0, monthlyTuition: s?.monthlyTuition ?? 0,
      computerFee: s?.computerFee ?? 0, examFee: s?.examFee ?? 0,
      transportFee: s?.transportFee ?? 0, miscCharge: s?.miscCharge ?? 0,
    };
  }));
}));

/** PUT /api/fees/structure/:classId — upsert a class fee structure */
router.put('/structure/:classId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const classId = intParam(req.params.classId, 'classId');
  const b = req.body || {};
  const num = (v: any) => Number(v || 0);
  const data = {
    annualCharge: num(b.annualCharge), monthlyTuition: num(b.monthlyTuition),
    computerFee: num(b.computerFee), examFee: num(b.examFee),
    transportFee: num(b.transportFee), miscCharge: num(b.miscCharge),
  };
  const row = await prisma.feeStructure.upsert({ where: { classId }, update: data, create: { classId, ...data } });
  res.json(row);
}));

/** GET /api/fees/prefill?studentId= — suggested bill lines from the student's class structure */
router.get('/prefill', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const studentId = intParam(req.query.studentId, 'studentId');
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { class: { include: { feeStructure: true } } },
  });
  if (!student) throw new AppError(404, 'Student not found');
  const s = student.class?.feeStructure || emptyStructure(student.classId || 0);
  const transportAmt = student.transportFee ?? s.transportFee ?? 0;
  const lines = [
    { key: 'annualCharge', label: 'Annual Charge', amount: s.annualCharge, include: true },
    { key: 'monthlyTuition', label: 'Monthly Tuition Fee', amount: s.monthlyTuition, include: true },
    { key: 'computerFee', label: 'Computer Fee', amount: s.computerFee, include: true },
    { key: 'miscCharge', label: 'Miscellaneous Charges', amount: s.miscCharge, include: true },
    { key: 'transportFee', label: 'Transportation Charge', amount: transportAmt, include: !!student.usesTransport, conditional: 'transport' },
    { key: 'examFee', label: 'Exam Fee', amount: s.examFee, include: false, conditional: 'exam' },
  ];
  res.json({
    studentId: student.id, studentName: student.name, className: student.class?.name || null,
    usesTransport: student.usesTransport, hasStructure: !!student.class?.feeStructure, lines,
  });
}));

/** POST /api/fees/generate-class — create a bill for every active student in a class */
router.post('/generate-class', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { classId, title, sessionLabel, dueDate, includeExam, less } = req.body || {};
  if (!classId || !title) throw new AppError(400, 'classId and title required');
  const cls = await prisma.class.findUnique({ where: { id: Number(classId) }, include: { feeStructure: true } });
  if (!cls) throw new AppError(404, 'Class not found');
  const s = cls.feeStructure || emptyStructure(cls.id);
  const students = await prisma.student.findMany({ where: { classId: Number(classId), status: 'ACTIVE' } });

  let created = 0;
  for (const stu of students) {
    const items: { description: string; amount: number }[] = [
      { description: 'Annual Charge', amount: s.annualCharge },
      { description: 'Monthly Tuition Fee', amount: s.monthlyTuition },
      { description: 'Computer Fee', amount: s.computerFee },
      { description: 'Miscellaneous Charges', amount: s.miscCharge },
    ];
    if (stu.usesTransport) items.push({ description: 'Transportation Charge', amount: stu.transportFee ?? s.transportFee });
    if (includeExam) items.push({ description: 'Exam Fee', amount: s.examFee });
    const filtered = items.filter((i) => Number(i.amount) > 0);
    if (!filtered.length) continue;
    await prisma.feeInvoice.create({
      data: {
        studentId: stu.id, title, sessionLabel: sessionLabel || null,
        dueDate: dueDate ? new Date(dueDate) : null, discount: Number(less || 0),
        items: { create: filtered.map((i) => ({ description: i.description, amount: Number(i.amount) })) },
      },
    });
    created++;
  }
  res.json({ ok: true, created, total: students.length });
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
