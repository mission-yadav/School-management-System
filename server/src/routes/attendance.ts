import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

// ---------------------------------------------------------------------------
// Student attendance
// ---------------------------------------------------------------------------

// GET / (query classId, date) — each ACTIVE student in class with status for date
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const classId = intParam(req.query.classId);
    const dateStr = req.query.date as string;
    if (!dateStr) throw new AppError(400, 'date is required');
    const date = new Date(dateStr);

    const students = await prisma.student.findMany({
      where: { classId, status: 'ACTIVE' },
      orderBy: { rollNo: 'asc' },
    });

    const records = await prisma.studentAttendance.findMany({
      where: { classId, date },
    });
    const byStudent = new Map<number, any>();
    for (const r of records) byStudent.set(r.studentId, r);

    const result = students.map((s) => {
      const att = byStudent.get(s.id);
      return {
        studentId: s.id,
        name: s.name,
        rollNo: s.rollNo,
        status: att ? att.status : null,
        attendanceId: att ? att.id : null,
      };
    });

    res.json(result);
  }),
);

// POST / body { classId, date, records:[{studentId,status}] }
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, date, records } = req.body;
    if (classId == null || !date || !Array.isArray(records)) {
      throw new AppError(400, 'classId, date and records are required');
    }
    const d = new Date(date);
    const markedById = req.user!.id;

    const ops = records.map((rec: any) =>
      prisma.studentAttendance.upsert({
        where: { studentId_date: { studentId: rec.studentId, date: d } },
        update: { status: rec.status, classId, markedById },
        create: {
          studentId: rec.studentId,
          date: d,
          status: rec.status,
          classId,
          markedById,
        },
      }),
    );

    await prisma.$transaction(ops);
    res.json({ ok: true, count: ops.length });
  }),
);

// GET /summary (query classId) — per student counts + percentage
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const classId = intParam(req.query.classId);

    const students = await prisma.student.findMany({
      where: { classId, status: 'ACTIVE' },
      orderBy: { rollNo: 'asc' },
    });

    const grouped = await prisma.studentAttendance.groupBy({
      by: ['studentId', 'status'],
      where: { classId },
      _count: { _all: true },
    });

    const stats = new Map<
      number,
      { present: number; absent: number; late: number; halfDay: number; total: number }
    >();
    for (const s of students) {
      stats.set(s.id, { present: 0, absent: 0, late: 0, halfDay: 0, total: 0 });
    }
    for (const g of grouped) {
      const st = stats.get(g.studentId);
      if (!st) continue;
      const count = g._count._all;
      st.total += count;
      switch (g.status) {
        case 'PRESENT':
          st.present += count;
          break;
        case 'ABSENT':
          st.absent += count;
          break;
        case 'LATE':
          st.late += count;
          break;
        case 'HALF_DAY':
          st.halfDay += count;
          break;
      }
    }

    const result = students.map((s) => {
      const st = stats.get(s.id)!;
      const percentage = st.total > 0 ? Math.round((st.present / st.total) * 100) : 0;
      return {
        studentId: s.id,
        name: s.name,
        rollNo: s.rollNo,
        present: st.present,
        absent: st.absent,
        late: st.late,
        halfDay: st.halfDay,
        total: st.total,
        percentage,
      };
    });

    res.json(result);
  }),
);

// GET /student/:id (query month like '2026-08') — day-by-day records for the month
router.get(
  '/student/:id',
  asyncHandler(async (req, res) => {
    const studentId = intParam(req.params.id);
    const month = req.query.month as string;
    if (!month) throw new AppError(400, 'month is required');

    const [year, mon] = month.split('-').map((v) => parseInt(v, 10));
    if (!year || !mon) throw new AppError(400, 'month must be YYYY-MM');
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));

    const records = await prisma.studentAttendance.findMany({
      where: { studentId, date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
    });

    const result = records.map((r) => ({ date: r.date, status: r.status }));
    res.json(result);
  }),
);

// ---------------------------------------------------------------------------
// Teacher attendance
// ---------------------------------------------------------------------------

// GET /teachers?date= — every TEACHER user with status for that date
router.get(
  '/teachers',
  asyncHandler(async (req, res) => {
    const dateStr = req.query.date as string;
    if (!dateStr) throw new AppError(400, 'date is required');
    const date = new Date(dateStr);

    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      orderBy: { name: 'asc' },
    });

    const records = await prisma.teacherAttendance.findMany({ where: { date } });
    const byUser = new Map<number, any>();
    for (const r of records) byUser.set(r.userId, r);

    const result = teachers.map((t) => {
      const att = byUser.get(t.id);
      return {
        userId: t.id,
        name: t.name,
        status: att ? att.status : null,
        id: att ? att.id : null,
      };
    });

    res.json(result);
  }),
);

// POST /teachers body { date, records:[{userId,status,note?}] }
router.post(
  '/teachers',
  asyncHandler(async (req, res) => {
    const { date, records } = req.body;
    if (!date || !Array.isArray(records)) {
      throw new AppError(400, 'date and records are required');
    }
    const d = new Date(date);

    const ops = records.map((rec: any) =>
      prisma.teacherAttendance.upsert({
        where: { userId_date: { userId: rec.userId, date: d } },
        update: { status: rec.status, note: rec.note },
        create: { userId: rec.userId, date: d, status: rec.status, note: rec.note },
      }),
    );

    await prisma.$transaction(ops);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

// GET /holidays — all, ordered by date
router.get(
  '/holidays',
  asyncHandler(async (_req, res) => {
    const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    res.json(holidays);
  }),
);

// POST /holidays body { date, title } (ADMIN) — upsert by unique date
router.post(
  '/holidays',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const { date, title } = req.body;
    if (!date || !title) throw new AppError(400, 'date and title are required');
    const d = new Date(date);

    const holiday = await prisma.holiday.upsert({
      where: { date: d },
      update: { title },
      create: { date: d, title },
    });

    res.json(holiday);
  }),
);

// DELETE /holidays/:id (ADMIN)
router.delete(
  '/holidays/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    await prisma.holiday.delete({ where: { id } });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Leave requests
// ---------------------------------------------------------------------------

// GET /leaves — all leaves with user name (teachers see only their own)
router.get(
  '/leaves',
  asyncHandler(async (req, res) => {
    const where =
      req.user!.role === 'TEACHER' ? { userId: req.user!.id } : {};

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { id: 'desc' },
    });

    res.json(leaves);
  }),
);

// POST /leaves body { fromDate, toDate, reason } — create for req.user!.id
router.post(
  '/leaves',
  asyncHandler(async (req, res) => {
    const { fromDate, toDate, reason } = req.body;
    if (!fromDate || !toDate) throw new AppError(400, 'fromDate and toDate are required');

    const leave = await prisma.leaveRequest.create({
      data: {
        userId: req.user!.id,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        reason,
      },
    });

    res.json(leave);
  }),
);

// PUT /leaves/:id (ADMIN) body { status }
router.put(
  '/leaves/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const id = intParam(req.params.id);
    const { status } = req.body;
    if (!status) throw new AppError(400, 'status is required');

    const leave = await prisma.leaveRequest.update({
      where: { id },
      data: { status },
    });

    res.json(leave);
  }),
);

export default router;
