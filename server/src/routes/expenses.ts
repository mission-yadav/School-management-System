import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** Build [start, end) DateTime bounds for a 'YYYY-MM' month string. */
function monthRange(month: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new AppError(400, 'Invalid month, expected YYYY-MM');
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) throw new AppError(400, 'Invalid month, expected YYYY-MM');
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

/** Format a Date to a 'YYYY-MM' key. */
function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ---- Categories ----

/** GET /api/expenses/categories — list expense categories */
router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
    res.json(categories);
  })
);

/** POST /api/expenses/categories — create category */
router.post(
  '/categories',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name) throw new AppError(400, 'name required');
    const category = await prisma.expenseCategory.create({ data: { name } });
    res.status(201).json(category);
  })
);

/** DELETE /api/expenses/categories/:id — delete category */
router.delete(
  '/categories/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    await prisma.expenseCategory.delete({ where: { id } });
    res.status(204).end();
  })
);

// ---- Vendors ----

/** GET /api/expenses/vendors — list vendors */
router.get(
  '/vendors',
  asyncHandler(async (_req, res) => {
    const vendors = await prisma.vendor.findMany({ orderBy: { name: 'asc' } });
    res.json(vendors);
  })
);

/** POST /api/expenses/vendors — create vendor */
router.post(
  '/vendors',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, phone, service } = req.body || {};
    if (!name) throw new AppError(400, 'name required');
    const vendor = await prisma.vendor.create({
      data: { name, phone: phone ?? null, service: service ?? null },
    });
    res.status(201).json(vendor);
  })
);

/** DELETE /api/expenses/vendors/:id — delete vendor */
router.delete(
  '/vendors/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    await prisma.vendor.delete({ where: { id } });
    res.status(204).end();
  })
);

// ---- Expenses ----

/** GET /api/expenses — list expenses with optional month/category filters */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { month, categoryId } = req.query;
    const where: any = {};
    if (typeof month === 'string' && month) {
      const { start, end } = monthRange(month);
      where.date = { gte: start, lt: end };
    }
    if (typeof categoryId === 'string' && categoryId) {
      where.categoryId = intParam(categoryId, 'categoryId');
    }
    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { category: true, vendor: true },
    });
    const result = expenses.map((e) => ({
      id: e.id,
      title: e.title,
      amount: e.amount,
      date: e.date,
      method: e.method,
      note: e.note,
      categoryId: e.categoryId,
      vendorId: e.vendorId,
      categoryName: e.category ? e.category.name : null,
      vendorName: e.vendor ? e.vendor.name : null,
    }));
    res.json(result);
  })
);

/** POST /api/expenses — create expense */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { title, amount, date, method, note, categoryId, vendorId } = req.body || {};
    if (!title) throw new AppError(400, 'title required');
    if (typeof amount !== 'number' || Number.isNaN(amount)) throw new AppError(400, 'amount required');
    const expense = await prisma.expense.create({
      data: {
        title,
        amount,
        date: date ? new Date(date) : undefined,
        method: method ?? undefined,
        note: note ?? null,
        categoryId: categoryId ?? null,
        vendorId: vendorId ?? null,
      },
    });
    res.status(201).json(expense);
  })
);

/** DELETE /api/expenses/:id — delete expense */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    await prisma.expense.delete({ where: { id } });
    res.status(204).end();
  })
);

/** GET /api/expenses/summary — totals overall, by category, and by month (last 6 months) */
router.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const expenses = await prisma.expense.findMany({ include: { category: true } });

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    // byCategory
    const catMap = new Map<string, number>();
    for (const e of expenses) {
      const name = e.category ? e.category.name : 'Uncategorized';
      catMap.set(name, (catMap.get(name) ?? 0) + e.amount);
    }
    const byCategory = Array.from(catMap.entries()).map(([category, catTotal]) => ({
      category,
      total: catTotal,
    }));

    // byMonth for the last 6 months (including current)
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(monthKey(d));
    }
    const monthTotals = new Map<string, number>();
    for (const m of months) monthTotals.set(m, 0);
    for (const e of expenses) {
      const key = monthKey(new Date(e.date));
      if (monthTotals.has(key)) monthTotals.set(key, (monthTotals.get(key) ?? 0) + e.amount);
    }
    const byMonth = months.map((month) => ({ month, total: monthTotals.get(month) ?? 0 }));

    res.json({ total, byCategory, byMonth });
  })
);

export default router;
