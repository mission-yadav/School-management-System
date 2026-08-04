import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const where: any = {};
  if (req.user!.role !== 'ADMIN') {
    where.audience = { in: ['ALL', 'TEACHERS'] };
  }
  const notices = await prisma.notice.findMany({
    where,
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const flattened = notices.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    audience: n.audience,
    classId: n.classId,
    authorId: n.authorId,
    createdAt: n.createdAt,
    authorName: n.author ? n.author.name : null,
  }));
  res.json(flattened);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { title, body, audience, classId } = req.body;
  if (!title) throw new AppError(400, 'title is required');
  if (!body) throw new AppError(400, 'body is required');
  const created = await prisma.notice.create({
    data: {
      title,
      body,
      audience: audience ?? 'ALL',
      classId: classId != null ? Number(classId) : undefined,
      authorId: req.user!.id,
    },
  });
  res.status(201).json(created);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) throw new AppError(404, 'Notice not found');
  if (req.user!.role !== 'ADMIN' && notice.authorId !== req.user!.id) {
    throw new AppError(403, 'Forbidden');
  }
  await prisma.notice.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
