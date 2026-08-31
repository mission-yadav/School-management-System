import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';
import { buildClassSheets, buildSheet } from '../lib/exam.js';

const router = Router();
router.use(authRequired);

/* ---- exams ---- */
router.get('/', asyncHandler(async (_req, res) => {
  res.json(await prisma.exam.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { subjects: true, results: true } } } }));
}));

router.post('/', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const { name, term, sessionLabel } = req.body || {};
  if (!name) throw new AppError(400, 'name required');
  const exam = await prisma.exam.create({ data: { name, term: term || null, sessionLabel: sessionLabel || null } });
  res.status(201).json(exam);
}));

router.delete('/:id', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.exam.delete({ where: { id: intParam(req.params.id) } });
  res.json({ ok: true });
}));

/* ---- marks distribution (exam subjects) ---- */
/** GET /api/exams/:id/subjects */
router.get('/:id/subjects', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const rows = await prisma.examSubject.findMany({
    where: { examId },
    include: { subject: { include: { class: { select: { name: true } } } } },
  });
  res.json(rows.map((r) => ({
    id: r.id, subjectId: r.subjectId, subjectName: r.subject.name,
    className: r.subject.class?.name || null, maxMarks: r.maxMarks, passMarks: r.passMarks, date: r.date,
  })));
}));

/** POST /api/exams/:id/subjects (ADMIN) — add subject to exam with marks distribution */
router.post('/:id/subjects', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const { subjectId, maxMarks, passMarks, date } = req.body || {};
  if (!subjectId) throw new AppError(400, 'subjectId required');
  const row = await prisma.examSubject.upsert({
    where: { examId_subjectId: { examId, subjectId: Number(subjectId) } },
    update: { maxMarks: Number(maxMarks || 100), passMarks: Number(passMarks || 35), date: date ? new Date(date) : null },
    create: { examId, subjectId: Number(subjectId), maxMarks: Number(maxMarks || 100), passMarks: Number(passMarks || 35), date: date ? new Date(date) : null },
  });
  res.status(201).json(row);
}));

router.delete('/:id/subjects/:examSubjectId', requireRole('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.examSubject.delete({ where: { id: intParam(req.params.examSubjectId, 'examSubjectId') } });
  res.json({ ok: true });
}));

/* ---- results / marks entry ---- */
/** GET /api/exams/:id/results?classId=&subjectId= — roster with each student's mark */
router.get('/:id/results', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const classId = Number(req.query.classId);
  const subjectId = Number(req.query.subjectId);
  if (!classId || !subjectId) throw new AppError(400, 'classId and subjectId required');

  const students = await prisma.student.findMany({
    where: { classId, status: 'ACTIVE' },
    orderBy: [{ rollNo: 'asc' }, { name: 'asc' }],
  });
  const results = await prisma.result.findMany({ where: { examId, subjectId } });
  const byStudent = new Map(results.map((r) => [r.studentId, r]));
  res.json(students.map((s) => {
    const r = byStudent.get(s.id);
    return { studentId: s.id, name: s.name, rollNo: s.rollNo, marks: r?.marks ?? null, maxMarks: r?.maxMarks ?? null, resultId: r?.id ?? null };
  }));
}));

/** POST /api/exams/:id/results — save marks for a subject */
router.post('/:id/results', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const { subjectId, maxMarks = 100, records } = req.body || {};
  if (!subjectId || !Array.isArray(records)) throw new AppError(400, 'subjectId and records[] required');
  const ops = records
    .filter((r: any) => r.marks !== '' && r.marks !== null && r.marks !== undefined)
    .map((r: any) =>
      prisma.result.upsert({
        where: { examId_subjectId_studentId: { examId, subjectId: Number(subjectId), studentId: Number(r.studentId) } },
        update: { marks: Number(r.marks), maxMarks: Number(maxMarks), enteredById: req.user!.id },
        create: { examId, subjectId: Number(subjectId), studentId: Number(r.studentId), marks: Number(r.marks), maxMarks: Number(maxMarks), enteredById: req.user!.id },
      })
    );
  await prisma.$transaction(ops);
  res.json({ ok: true, saved: ops.length });
}));

/** GET /api/exams/:id/ranklist?classId= — total, percentage, grade, rank */
router.get('/:id/ranklist', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const classId = Number(req.query.classId);
  if (!classId) throw new AppError(400, 'classId required');
  const sheets = await buildClassSheets(examId, classId);
  const rows = sheets
    .filter((s) => s.subjects.length)
    .map((s) => ({ studentId: s.student.id, name: s.student.name, rollNo: s.student.rollNo, total: s.total, max: s.max, percent: s.percent, grade: s.grade, gpa: s.gpa, subjects: s.subjects.length, rank: s.rank }))
    .sort((a, b) => a.rank - b.rank);
  res.json(rows);
}));

/** GET /api/exams/:id/report-card?studentId= — full computed sheet (subjects, GPA, grade, rank) */
router.get('/:id/report-card', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const studentId = Number(req.query.studentId);
  if (!studentId) throw new AppError(400, 'studentId required');
  const sheet = await buildSheet(examId, studentId);
  if (!sheet) throw new AppError(404, 'Student not found');
  res.json(sheet);
}));

/* ---- per-student marks entry (all of a class's subjects for one student) ---- */
/** GET /api/exams/:id/entry?classId=&studentId= — the class's subjects + this student's marks */
router.get('/:id/entry', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const classId = Number(req.query.classId);
  const studentId = Number(req.query.studentId);
  if (!classId || !studentId) throw new AppError(400, 'classId and studentId required');
  const subjects = await prisma.subject.findMany({ where: { classId }, orderBy: { name: 'asc' } });
  const results = await prisma.result.findMany({ where: { examId, studentId } });
  const bySub = new Map(results.map((r) => [r.subjectId, r]));
  res.json(subjects.map((s) => {
    const r = bySub.get(s.id);
    return { subjectId: s.id, subjectName: s.name, marks: r?.marks ?? null, maxMarks: r?.maxMarks ?? 100 };
  }));
}));

/** POST /api/exams/:id/entry — save one student's marks across subjects */
router.post('/:id/entry', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const { studentId, records } = req.body || {};
  if (!studentId || !Array.isArray(records)) throw new AppError(400, 'studentId and records[] required');
  const sid = Number(studentId);
  const ops = records.map((r: any) => {
    const subjectId = Number(r.subjectId);
    const maxMarks = Number(r.maxMarks || 100);
    const empty = r.marks === '' || r.marks === null || r.marks === undefined;
    return empty
      ? prisma.result.deleteMany({ where: { examId, subjectId, studentId: sid } })
      : prisma.result.upsert({
          where: { examId_subjectId_studentId: { examId, subjectId, studentId: sid } },
          update: { marks: Number(r.marks), maxMarks, enteredById: req.user!.id },
          create: { examId, subjectId, studentId: sid, marks: Number(r.marks), maxMarks, enteredById: req.user!.id },
        });
  });
  await prisma.$transaction(ops);
  res.json({ ok: true, saved: ops.length });
}));

export default router;
