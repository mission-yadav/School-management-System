import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** GET /api/subjects?classId= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const subjects = await prisma.subject.findMany({
      where: classId ? { classId } : undefined,
      orderBy: [{ classId: 'asc' }, { name: 'asc' }],
      include: { class: { select: { name: true } }, teacher: { select: { name: true } } },
    });
    res.json(
      subjects.map((s) => ({
        id: s.id, name: s.name, code: s.code, credits: s.credits,
        classId: s.classId, className: s.class?.name || null,
        teacherId: s.teacherId, teacherName: s.teacher?.name || null,
      }))
    );
  })
);

/** POST /api/subjects (ADMIN) */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, code, credits, classId, teacherId } = req.body || {};
    if (!name || !classId) throw new AppError(400, 'name and classId required');
    const created = await prisma.subject.create({
      data: {
        name, code: code || null, credits: credits ? Number(credits) : 1,
        classId: Number(classId), teacherId: teacherId || null,
      },
    });
    res.status(201).json({ id: created.id });
  })
);

/** PUT /api/subjects/:id (ADMIN) */
router.put(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const { name, code, credits, classId, teacherId } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (code !== undefined) data.code = code;
    if (credits !== undefined) data.credits = Number(credits);
    if (classId !== undefined) data.classId = Number(classId);
    if (teacherId !== undefined) data.teacherId = teacherId || null;
    await prisma.subject.update({ where: { id }, data });
    res.json({ ok: true });
  })
);

/** DELETE /api/subjects/:id (ADMIN) */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.subject.delete({ where: { id: intParam(req.params.id) } });
    res.json({ ok: true });
  })
);

export default router;
