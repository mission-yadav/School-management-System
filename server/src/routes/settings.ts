import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

const DEFAULT_SETTINGS: Record<string, any> = {
  schoolName: '',
  address: '',
  phone: '',
  email: '',
  session: '',
  logoUrl: '',
  theme: '#262081',
  emailConfig: {},
  smsConfig: {},
};

router.get('/', asyncHandler(async (_req, res) => {
  const rows = await prisma.setting.findMany();
  const out: Record<string, any> = { ...DEFAULT_SETTINGS };
  for (const r of rows as any[]) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  res.json(out);
}));

router.put('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'Body must be an object of key/value settings');
  }
  const keys = Object.keys(body);
  await prisma.$transaction(
    keys.map((key) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(body[key]) },
        create: { key, value: JSON.stringify(body[key]) },
      })
    )
  );
  const rows = await prisma.setting.findMany();
  const out: Record<string, any> = { ...DEFAULT_SETTINGS };
  for (const r of rows as any[]) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  res.json(out);
}));

router.get('/grades', asyncHandler(async (_req, res) => {
  const grades = await prisma.gradeScale.findMany({ orderBy: { minPercent: 'desc' } });
  res.json(grades);
}));

router.put('/grades', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const grades = req.body && req.body.grades;
  if (!Array.isArray(grades)) throw new AppError(400, 'grades must be an array');
  const data = grades.map((g: any) => ({
    grade: g.grade,
    minPercent: Number(g.minPercent),
    maxPercent: Number(g.maxPercent),
    gpa: Number(g.gpa),
  }));
  await prisma.$transaction([
    prisma.gradeScale.deleteMany({}),
    prisma.gradeScale.createMany({ data }),
  ]);
  const updated = await prisma.gradeScale.findMany({ orderBy: { minPercent: 'desc' } });
  res.json(updated);
}));

router.get('/fee-categories', asyncHandler(async (_req, res) => {
  const categories = await prisma.feeCategory.findMany({ orderBy: { name: 'asc' } });
  res.json(categories);
}));

router.post('/fee-categories', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name } = req.body || {};
  if (!name) throw new AppError(400, 'name is required');
  const created = await prisma.feeCategory.create({ data: { name } });
  res.status(201).json(created);
}));

router.delete('/fee-categories/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  await prisma.feeCategory.delete({ where: { id } });
  res.status(204).end();
}));

router.get('/backup', requireRole('ADMIN'), asyncHandler(async (_req, res) => {
  const [students, users, classes, feeInvoices] = await Promise.all([
    prisma.student.findMany(),
    prisma.user.findMany(),
    prisma.class.findMany(),
    prisma.feeInvoice.findMany({ include: { items: true, payments: true } }),
  ]);
  const safeUsers = (users as any[]).map((u) => {
    const { passwordHash, ...rest } = u;
    return rest;
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    data: {
      students,
      users: safeUsers,
      classes,
      feeInvoices,
    },
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="backup.json"');
  res.send(JSON.stringify(payload, null, 2));
}));

export default router;
