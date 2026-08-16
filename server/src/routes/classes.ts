import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { syncStudentLedger } from '../lib/ledger.js';

const router = Router();
router.use(authRequired);

/** GET /api/classes — all classes (in promotion order) with teacher, sections, student count.
 *  Each class also carries nextClassId: the class students promote into. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        classTeacher: { select: { id: true, name: true } },
        sections: true,
        _count: { select: { students: true, subjects: true } },
      },
    });
    // next class = the first class with a strictly greater order
    const nextIdFor = (c: { id: number; order: number }) => {
      const later = classes.filter((x) => x.order > c.order).sort((a, b) => a.order - b.order);
      return later.length ? later[0].id : null;
    };
    res.json(
      classes.map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        capacity: c.capacity,
        classTeacherId: c.classTeacherId,
        teacherName: c.classTeacher?.name || null,
        sections: c.sections,
        studentCount: c._count.students,
        subjectCount: c._count.subjects,
        nextClassId: nextIdFor(c),
      }))
    );
  })
);

/** GET /api/classes/:id/students — active students in a class (for the promotion screen) */
router.get(
  '/:id/students',
  asyncHandler(async (req, res) => {
    const classId = intParam(req.params.id);
    const students = await prisma.student.findMany({
      where: { classId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, iemis: true, rollNo: true },
    });
    res.json(students);
  })
);

/** POST /api/classes/promote (ADMIN) — move students to a new class and adjust their fees.
 *  body: { promotions: [{ studentId, targetClassId }] } */
router.post(
  '/promote',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const promotions = (req.body?.promotions || []) as { studentId: number; targetClassId: number }[];
    if (!Array.isArray(promotions) || !promotions.length) throw new AppError(400, 'promotions[] required');
    let promoted = 0;
    for (const p of promotions) {
      const studentId = Number(p.studentId), targetClassId = Number(p.targetClassId);
      if (!studentId || !targetClassId) continue;
      await prisma.student.update({ where: { id: studentId }, data: { classId: targetClassId, sectionId: null } });
      await syncStudentLedger(studentId); // re-price the ledger to the new class's fee structure
      promoted++;
    }
    res.json({ ok: true, promoted });
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
    const { name, order, capacity, classTeacherId, sections } = req.body || {};
    if (!name) throw new AppError(400, 'name required');
    const created = await prisma.class.create({
      data: {
        name,
        order: order != null ? Number(order) : 0,
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
    const { name, order, capacity, classTeacherId } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (order !== undefined) data.order = Number(order);
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
