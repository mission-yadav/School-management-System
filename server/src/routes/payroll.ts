import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** Validate a 'YYYY-MM' month string. */
function assertMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new AppError(400, 'Invalid month, expected YYYY-MM');
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new AppError(400, 'Invalid month, expected YYYY-MM');
  return month;
}

/** GET /api/payroll/employees — combined payable employees (teachers + active staff) */
router.get(
  '/employees',
  asyncHandler(async (_req, res) => {
    const [teachers, staff] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'TEACHER' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.staff.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, baseSalary: true },
      }),
    ]);

    const employees = [
      ...teachers.map((t) => ({
        type: 'TEACHER' as const,
        refId: t.id,
        name: t.name,
        baseSalary: 0,
      })),
      ...staff.map((s) => ({
        type: 'STAFF' as const,
        refId: s.id,
        name: s.name,
        baseSalary: s.baseSalary,
      })),
    ];

    res.json(employees);
  })
);

/** GET /api/payroll — list payslips for a month (or all), newest first */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { month } = req.query;
    const where: any = {};
    if (typeof month === 'string' && month) {
      where.month = assertMonth(month);
    }
    const payslips = await prisma.payslip.findMany({
      where,
      orderBy: { generatedAt: 'desc' },
    });
    res.json(payslips);
  })
);

/** POST /api/payroll — upsert a payslip and compute net pay */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { employeeType, refId, employeeName, month, basic, bonus, pf, tax, deductions } =
      req.body || {};

    if (employeeType !== 'TEACHER' && employeeType !== 'STAFF') {
      throw new AppError(400, 'employeeType must be TEACHER or STAFF');
    }
    if (typeof refId !== 'number' || !Number.isInteger(refId) || refId <= 0) {
      throw new AppError(400, 'refId required');
    }
    if (!employeeName) throw new AppError(400, 'employeeName required');
    if (typeof month !== 'string' || !month) throw new AppError(400, 'month required');
    assertMonth(month);
    if (typeof basic !== 'number' || Number.isNaN(basic)) throw new AppError(400, 'basic required');

    const bonusV = typeof bonus === 'number' ? bonus : 0;
    const pfV = typeof pf === 'number' ? pf : 0;
    const taxV = typeof tax === 'number' ? tax : 0;
    const deductionsV = typeof deductions === 'number' ? deductions : 0;
    const netPay = basic + bonusV - pfV - taxV - deductionsV;

    const payslip = await prisma.payslip.upsert({
      where: {
        employeeType_refId_month: { employeeType, refId, month },
      },
      create: {
        employeeType,
        refId,
        employeeName,
        month,
        basic,
        bonus: bonusV,
        pf: pfV,
        tax: taxV,
        deductions: deductionsV,
        netPay,
      },
      update: {
        employeeName,
        basic,
        bonus: bonusV,
        pf: pfV,
        tax: taxV,
        deductions: deductionsV,
        netPay,
      },
    });

    res.json(payslip);
  })
);

/** DELETE /api/payroll/:id — delete a payslip */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    await prisma.payslip.delete({ where: { id } });
    res.status(204).end();
  })
);

/** GET /api/payroll/summary — aggregate totals for a month */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { month } = req.query;
    const where: any = {};
    if (typeof month === 'string' && month) {
      where.month = assertMonth(month);
    }
    const payslips = await prisma.payslip.findMany({ where });

    const count = payslips.length;
    const totalNet = payslips.reduce((sum, p) => sum + p.netPay, 0);
    const totalBasic = payslips.reduce((sum, p) => sum + p.basic, 0);
    const totalDeductions = payslips.reduce(
      (sum, p) => sum + p.pf + p.tax + p.deductions,
      0
    );

    res.json({
      month: typeof month === 'string' && month ? month : null,
      count,
      totalNet,
      totalBasic,
      totalDeductions,
    });
  })
);

export default router;
