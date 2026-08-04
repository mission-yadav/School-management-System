import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** Serialize rows to CSV text; quotes fields containing commas/quotes/newlines. */
function toCsv(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(','));
  }
  return lines.join('\n');
}

/** Send rows as JSON, or CSV when ?format=csv. */
function sendReport(req: any, res: any, rows: any[], filename: string) {
  if (String(req.query.format).toLowerCase() === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(toCsv(rows));
  }
  res.json(rows);
}

router.get('/students', asyncHandler(async (req, res) => {
  const students = await prisma.student.findMany({
    include: { class: true },
    orderBy: { name: 'asc' },
  });
  const rows = students.map((s) => ({
    admissionNo: s.admissionNo,
    name: s.name,
    gender: s.gender,
    phone: s.phone,
    className: s.class ? s.class.name : '',
    status: s.status,
  }));
  sendReport(req, res, rows, 'students');
}));

router.get('/fees', asyncHandler(async (req, res) => {
  const invoices = await prisma.feeInvoice.findMany({
    include: { items: true, payments: true, student: true },
    orderBy: { createdAt: 'desc' },
  });
  const rows = invoices.map((inv: any) => {
    const itemsTotal = inv.items.reduce((a: number, it: any) => a + Number(it.amount), 0);
    const total = itemsTotal + Number(inv.fine || 0) - Number(inv.discount || 0);
    const paid = inv.payments.reduce((a: number, p: any) => a + Number(p.amount), 0);
    return {
      invoiceId: inv.id,
      student: inv.student ? inv.student.name : '',
      title: inv.title,
      total,
      paid,
      due: total - paid,
      status: inv.status,
    };
  });
  sendReport(req, res, rows, 'fees');
}));

router.get('/attendance', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.query.classId) {
    where.student = { classId: intParam(String(req.query.classId), 'classId') };
  }
  if (req.query.month) {
    const month = String(req.query.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, 'Invalid month');
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    where.date = { gte: start, lt: end };
  }
  const records = await prisma.studentAttendance.findMany({
    where,
    include: { student: true },
  });
  const map = new Map<number, { name: string; present: number; total: number }>();
  for (const r of records as any[]) {
    const key = r.studentId;
    if (!map.has(key)) {
      map.set(key, { name: r.student ? r.student.name : String(key), present: 0, total: 0 });
    }
    const agg = map.get(key)!;
    agg.total += 1;
    if (r.status === 'PRESENT') agg.present += 1;
  }
  const rows = Array.from(map.values()).map((a) => ({
    name: a.name,
    present: a.present,
    total: a.total,
    percentage: a.total ? Math.round((a.present / a.total) * 10000) / 100 : 0,
  }));
  sendReport(req, res, rows, 'attendance');
}));

router.get('/payroll', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.query.month) where.month = String(req.query.month);
  const payslips = await prisma.payslip.findMany({ where });
  const rows = payslips.map((p) => ({
    employeeName: p.employeeName,
    month: p.month,
    netPay: p.netPay,
  }));
  sendReport(req, res, rows, 'payroll');
}));

router.get('/expenses', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.query.month) {
    const month = String(req.query.month);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError(400, 'Invalid month');
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    where.date = { gte: start, lt: end };
  }
  const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
  const rows = expenses.map((e) => ({
    title: e.title,
    amount: e.amount,
    date: e.date,
  }));
  sendReport(req, res, rows, 'expenses');
}));

router.get('/admissions', asyncHandler(async (req, res) => {
  const requests = await prisma.admissionRequest.findMany({ orderBy: { createdAt: 'desc' } });
  const rows = requests.map((a) => ({
    applicantName: a.applicantName,
    status: a.status,
    createdAt: a.createdAt,
  }));
  sendReport(req, res, rows, 'admissions');
}));

export default router;
