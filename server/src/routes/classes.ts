import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** GET /api/classes — all classes with teacher, sections, student count */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      orderBy: { name: 'asc' },
      include: {
        classTeacher: { select: { id: true, name: true } },
        sections: true,
        _count: { select: { students: true, subjects: true } },
      },
    });
    res.json(
      classes.map((c) => ({
        id: c.id,
        name: c.name,
        capacity: c.capacity,
        classTeacherId: c.classTeacherId,
        teacherName: c.classTeacher?.name || null,
        sections: c.sections,
        studentCount: c._count.students,
        subjectCount: c._count.subjects,
      }))
    );
  })
);

/** GET /api/classes/mine — classes the logged-in teacher teaches or leads */
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const uid = req.user!.id;
    const classes = await prisma.class.findMany({
      where: { OR: [{ classTeacherId: uid }, { subjects: { some: { teacherId: uid } } }] },
      orderBy: { name: 'asc' },
      include: { sections: true, _count: { select: { students: true } } },
    });
    res.json(classes.map((c) => ({ id: c.id, name: c.name, sections: c.sections, studentCount: c._count.students })));
  })
);

/** POST /api/classes (ADMIN) */
router.post(
  '/',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { name, capacity, classTeacherId, sections } = req.body || {};
    if (!name) throw new AppError(400, 'name required');
    const created = await prisma.class.create({
      data: {
        name,
        capacity: capacity ? Number(capacity) : 40,
        classTeacherId: classTeacherId || null,
        sections: Array.isArray(sections) && sections.length
          ? { create: sections.map((s: any) => ({ name: s.name || s, capacity: s.capacity || 40 })) }
          : { create: [{ name: 'A' }] },
      },
    });
    res.status(201).json({ id: created.id });
  })
);

/** PUT /api/classes/:id (ADMIN) */
router.put(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const { name, capacity, classTeacherId } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (capacity !== undefined) data.capacity = Number(capacity);
    if (classTeacherId !== undefined) data.classTeacherId = classTeacherId || null;
    await prisma.class.update({ where: { id }, data });
    res.json({ ok: true });
  })
);

/** DELETE /api/classes/:id (ADMIN) */
router.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.class.delete({ where: { id: intParam(req.params.id) } });
    res.json({ ok: true });
  })
);

/* ---- sections ---- */
/** POST /api/classes/:id/sections (ADMIN) */
router.post(
  '/:id/sections',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const classId = intParam(req.params.id);
    const { name, room, capacity } = req.body || {};
    if (!name) throw new AppError(400, 'section name required');
    const section = await prisma.section.create({
      data: { classId, name, room: room || null, capacity: capacity ? Number(capacity) : 40 },
    });
    res.status(201).json(section);
  })
);

/** DELETE /api/classes/sections/:sectionId (ADMIN) */
router.delete(
  '/sections/:sectionId',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    await prisma.section.delete({ where: { id: intParam(req.params.sectionId, 'sectionId') } });
    res.json({ ok: true });
  })
);

export default router;
