import { Router } from 'express';
import prisma from '../prisma.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, AppError, intParam } from '../lib/http.js';

const router = Router();
router.use(authRequired);

/** Map a percentage to a grade + gpa using the configured GradeScale (fallback to defaults). */
async function gradeFor(percent: number): Promise<{ grade: string; gpa: number }> {
  const scales = await prisma.gradeScale.findMany({ orderBy: { minPercent: 'desc' } });
  const found = scales.find((s) => percent >= s.minPercent && percent <= s.maxPercent);
  if (found) return { grade: found.grade, gpa: found.gpa };
  // fallback
  if (percent >= 90) return { grade: 'A+', gpa: 10 };
  if (percent >= 80) return { grade: 'A', gpa: 9 };
  if (percent >= 70) return { grade: 'B+', gpa: 8 };
  if (percent >= 60) return { grade: 'B', gpa: 7 };
  if (percent >= 50) return { grade: 'C', gpa: 6 };
  if (percent >= 35) return { grade: 'D', gpa: 5 };
  return { grade: 'F', gpa: 0 };
}

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

  const students = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' } });
  const results = await prisma.result.findMany({ where: { examId, student: { classId } } });

  const rows = await Promise.all(students.map(async (s) => {
    const rs = results.filter((r) => r.studentId === s.id);
    const total = rs.reduce((a, r) => a + r.marks, 0);
    const max = rs.reduce((a, r) => a + r.maxMarks, 0);
    const percent = max ? (total / max) * 100 : 0;
    const { grade, gpa } = await gradeFor(percent);
    return { studentId: s.id, name: s.name, rollNo: s.rollNo, total, max, percent: Math.round(percent * 100) / 100, grade, gpa, subjects: rs.length };
  }));
  rows.sort((a, b) => b.percent - a.percent);
  rows.forEach((r, i) => ((r as any).rank = i + 1));
  res.json(rows);
}));

/** GET /api/exams/:id/report-card?studentId= — per-subject breakdown + GPA */
router.get('/:id/report-card', asyncHandler(async (req, res) => {
  const examId = intParam(req.params.id);
  const studentId = Number(req.query.studentId);
  if (!studentId) throw new AppError(400, 'studentId required');

  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: { select: { name: true } } } });
  if (!student) throw new AppError(404, 'Student not found');
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const results = await prisma.result.findMany({ where: { examId, studentId }, include: { subject: { select: { name: true } } } });

  const subjects = await Promise.all(results.map(async (r) => {
    const percent = r.maxMarks ? (r.marks / r.maxMarks) * 100 : 0;
    const g = await gradeFor(percent);
    return { subject: r.subject.name, marks: r.marks, maxMarks: r.maxMarks, percent: Math.round(percent * 100) / 100, grade: g.grade, gpa: g.gpa };
  }));
  const total = subjects.reduce((a, s) => a + s.marks, 0);
  const max = subjects.reduce((a, s) => a + s.maxMarks, 0);
  const percent = max ? (total / max) * 100 : 0;
  const overall = await gradeFor(percent);
  const gpa = subjects.length ? subjects.reduce((a, s) => a + s.gpa, 0) / subjects.length : 0;

  res.json({
    student: { id: student.id, name: student.name, admissionNo: student.admissionNo, rollNo: student.rollNo, className: student.class?.name || null },
    exam: exam ? { name: exam.name, term: exam.term } : null,
    subjects, total, max, percent: Math.round(percent * 100) / 100,
    grade: overall.grade, gpa: Math.round(gpa * 100) / 100,
    result: percent >= 35 ? 'PASS' : 'FAIL',
  });
}));

export default router;
