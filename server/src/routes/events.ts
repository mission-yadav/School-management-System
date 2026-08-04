import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const month = req.query.month;
  let events;
  if (month) {
    const [year, mon] = String(month).split('-').map(Number);
    if (!year || !mon) throw new AppError(400, 'Invalid month format, expected YYYY-MM');
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 1);
    events = await prisma.event.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    events = await prisma.event.findMany({
      where: { date: { gte: today } },
      orderBy: { date: 'asc' },
    });
  }
  res.json(events);
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { title, description, date, type } = req.body;
  if (!title) throw new AppError(400, 'title is required');
  if (!date) throw new AppError(400, 'date is required');
  const created = await prisma.event.create({
    data: {
      title,
      description,
      date: new Date(date),
      type,
    },
  });
  res.status(201).json(created);
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  await prisma.event.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
