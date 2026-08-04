import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

router.get('/', asyncHandler(async (req, res) => {
  const classId = req.query.classId;
  if (!classId) throw new AppError(400, 'classId is required');
  const slots = await prisma.timetableSlot.findMany({
    where: { classId: Number(classId) },
    include: {
      subject: { select: { name: true } },
      teacher: { select: { name: true } },
    },
    orderBy: [{ day: 'asc' }, { period: 'asc' }],
  });
  const flattened = slots.map((s) => ({
    id: s.id,
    classId: s.classId,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    day: s.day,
    period: s.period,
    startTime: s.startTime,
    endTime: s.endTime,
    subjectName: s.subject ? s.subject.name : null,
    teacherName: s.teacher ? s.teacher.name : null,
  }));
  res.json(flattened);
}));

router.get('/mine', asyncHandler(async (req, res) => {
  const slots = await prisma.timetableSlot.findMany({
    where: { teacherId: req.user!.id },
    include: {
      class: { select: { name: true } },
      subject: { select: { name: true } },
    },
    orderBy: [{ day: 'asc' }, { period: 'asc' }],
  });
  const flattened = slots.map((s) => ({
    id: s.id,
    classId: s.classId,
    subjectId: s.subjectId,
    teacherId: s.teacherId,
    day: s.day,
    period: s.period,
    startTime: s.startTime,
    endTime: s.endTime,
    className: s.class ? s.class.name : null,
    subjectName: s.subject ? s.subject.name : null,
  }));
  res.json(flattened);
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { classId, subjectId, teacherId, day, period, startTime, endTime } = req.body;
  if (classId == null) throw new AppError(400, 'classId is required');
  if (!day) throw new AppError(400, 'day is required');
  if (period == null) throw new AppError(400, 'period is required');
  const slot = await prisma.timetableSlot.upsert({
    where: {
      classId_day_period: {
        classId: Number(classId),
        day,
        period: Number(period),
      },
    },
    update: {
      subjectId: subjectId != null ? Number(subjectId) : null,
      teacherId: teacherId != null ? Number(teacherId) : null,
      startTime,
      endTime,
    },
    create: {
      classId: Number(classId),
      subjectId: subjectId != null ? Number(subjectId) : undefined,
      teacherId: teacherId != null ? Number(teacherId) : undefined,
      day,
      period: Number(period),
      startTime,
      endTime,
    },
  });
  res.status(201).json(slot);
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  await prisma.timetableSlot.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
