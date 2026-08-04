import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** GET /api/teachers — list teacher accounts */
router.get(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, phone: true, active: true, createdAt: true,
        _count: { select: { subjects: true, classTeacherOf: true } },
      },
    });
    res.json(teachers);
  })
);

/** POST /api/teachers — create teacher account */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body || {};
    if (!name || !email || !password) throw new AppError(400, 'name, email, password required');
    const teacher = await prisma.user.create({
      data: { name, email, phone: phone || null, role: 'TEACHER', passwordHash: bcrypt.hashSync(password, 10) },
      select: { id: true, name: true, email: true, phone: true },
    });
    res.status(201).json(teacher);
  })
);

/** PUT /api/teachers/:id */
router.put(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const { name, email, phone, password, active } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (active !== undefined) data.active = active;
    if (password) data.passwordHash = bcrypt.hashSync(password, 10);
    await prisma.user.update({ where: { id }, data });
    res.json({ ok: true });
  })
);

/** DELETE /api/teachers/:id */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.user.delete({ where: { id: intParam(req.params.id) } });
    res.json({ ok: true });
  })
);

export default router;
