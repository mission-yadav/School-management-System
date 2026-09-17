import prisma from '../prisma.js';

/** Load the configured grade scale once and return a sync percent -> {grade, gpa} resolver. */
export async function gradeResolver(): Promise<(percent: number) => { grade: string; gpa: number }> {
  const scales = await prisma.gradeScale.findMany({ orderBy: { minPercent: 'desc' } });
  const fallback = (p: number) => {
    if (p >= 90) return { grade: 'A+', gpa: 10 };
    if (p >= 80) return { grade: 'A', gpa: 9 };
    if (p >= 70) return { grade: 'B+', gpa: 8 };
    if (p >= 60) return { grade: 'B', gpa: 7 };
    if (p >= 50) return { grade: 'C', gpa: 6 };
    if (p >= 35) return { grade: 'D', gpa: 5 };
    return { grade: 'F', gpa: 0 };
  };
  return (percent: number) => {
    const f = scales.find((s) => percent >= s.minPercent && percent <= s.maxPercent);
    return f ? { grade: f.grade, gpa: f.gpa } : fallback(percent);
  };
}

/** Fixed display priority for subjects (lower = earlier). Unknown subjects fall to the end. */
const SUBJECT_RANK: Record<string, number> = {
  'english i': 1, 'english ii': 2, 'english dict': 3,
  'nepali': 4, 'nepali dict': 5,
  'maths': 6, 'math': 6, 'mathematics': 6,
  'science': 7, 'social studies': 8, 'social': 8, 'computer': 9,
};
export function subjectRank(name: string): number {
  const key = (name || '').toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
  return SUBJECT_RANK[key] ?? 99;
}
export function bySubjectPriority(a: string, b: string): number {
  return (subjectRank(a) - subjectRank(b)) || a.localeCompare(b);
}

export type SubjectRow = { subject: string; marks: number; maxMarks: number; passMarks: number; grade: string; gpa: number; pass: boolean; absent: boolean; theory: number | null; practical: number | null; theoryFull: number; practicalFull: number };
export type Sheet = {
  student: { id: number; name: string; rollNo: string | null; admissionNo: string; iemis: string | null; className: string | null };
  exam: { name: string; examType: string; term: string | null; sessionLabel: string | null; totalWorkingDays: number | null } | null;
  subjects: SubjectRow[];
  total: number; max: number; percent: number; gpa: number; grade: string; result: 'PASS' | 'FAIL';
  attendance: { present: number | null; total: number | null; pass: boolean };
  rank: number; classSize: number;
};

/** Attendance passes at ≥ 75% of the exam's total working days. */
export function attendancePass(present: number | null, total: number | null): boolean {
  if (present == null || !total) return true; // no data → don't flag as failing
  return present / total >= 0.75;
}

/** NEB 4.0 grading scale (per component, from percentage). */
export function nebScale(pct: number): { grade: string; gp: number } {
  if (pct >= 90) return { grade: 'A+', gp: 4.0 };
  if (pct >= 80) return { grade: 'A', gp: 3.6 };
  if (pct >= 70) return { grade: 'B+', gp: 3.2 };
  if (pct >= 60) return { grade: 'B', gp: 2.8 };
  if (pct >= 50) return { grade: 'C+', gp: 2.4 };
  if (pct >= 40) return { grade: 'C', gp: 2.0 };
  if (pct >= 35) return { grade: 'D', gp: 1.6 };
  return { grade: 'NG', gp: 0 };
}
/** Final/overall grade from a credit-weighted GPA (NEB bands, upper-inclusive). */
export function nebFinal(gpa: number): string {
  return gpa > 3.6 ? 'A+' : gpa > 3.2 ? 'A' : gpa > 2.8 ? 'B+' : gpa > 2.4 ? 'B' : gpa > 2.0 ? 'C+' : gpa > 1.6 ? 'C' : gpa > 0.8 ? 'D' : 'NG';
}
/** Credit-weighted components (TH, PR) for a subject — credit hour = full marks / 25 (100 = 4 CH). */
function subjectComponents(r: { theory: number | null; practical: number | null; theoryFull: number; practicalFull: number; absent: boolean }): { gp: number; ch: number }[] {
  const comps: { gp: number; ch: number }[] = [];
  const thPct = r.theoryFull ? (Number(r.theory || 0) / r.theoryFull) * 100 : 0;
  comps.push({ gp: r.absent ? 0 : nebScale(thPct).gp, ch: r.theoryFull / 25 });
  if (r.practicalFull > 0) {
    const prPct = r.practicalFull ? (Number(r.practical || 0) / r.practicalFull) * 100 : 0;
    comps.push({ gp: r.absent ? 0 : nebScale(prPct).gp, ch: r.practicalFull / 25 });
  }
  return comps;
}

function computeSubjects(results: any[], passPercent = 0.35): SubjectRow[] {
  return results
    .slice()
    .sort((a, b) => bySubjectPriority(a.subject?.name || '', b.subject?.name || ''))
    .map((r) => {
      const passMarks = Math.round(r.maxMarks * passPercent);
      const theoryFull = r.subject.theoryFull ?? 50;
      const practicalFull = r.subject.practicalFull ?? 50;
      if (r.absent) return { subject: r.subject.name, marks: 0, maxMarks: r.maxMarks, passMarks, grade: 'ABS', gpa: 0, pass: false, absent: true, theory: null, practical: null, theoryFull, practicalFull };
      const theory = r.theoryMarks ?? null;
      const practical = r.practicalMarks ?? null;
      const comps = subjectComponents({ theory, practical, theoryFull, practicalFull, absent: false });
      const chSum = comps.reduce((a, c) => a + c.ch, 0);
      const gpa = chSum ? comps.reduce((a, c) => a + c.gp * c.ch, 0) / chSum : 0;
      return { subject: r.subject.name, marks: r.marks, maxMarks: r.maxMarks, passMarks, grade: nebFinal(gpa), gpa: Math.round(gpa * 100) / 100, pass: r.marks >= passMarks, absent: false, theory, practical, theoryFull, practicalFull };
    });
}

function summarize(subjects: SubjectRow[]) {
  const total = subjects.reduce((a, s) => a + s.marks, 0);
  const max = subjects.reduce((a, s) => a + s.maxMarks, 0);
  const percent = max ? (total / max) * 100 : 0;
  let gpSum = 0, chSum = 0;
  for (const s of subjects) for (const c of subjectComponents(s)) { gpSum += c.gp * c.ch; chSum += c.ch; }
  const gpa = chSum ? gpSum / chSum : 0;
  const allPass = subjects.length > 0 && subjects.every((s) => s.pass);
  return {
    total, max,
    percent: Math.round(percent * 100) / 100,
    gpa: Math.round(gpa * 100) / 100,
    grade: subjects.length ? nebFinal(gpa) : '—',
    result: (allPass ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
  };
}

/** All students of a class for an exam — each with subject rows, totals, GPA, grade, result and class rank. */
export async function buildClassSheets(examId: number, classId: number): Promise<Sheet[]> {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const students = await prisma.student.findMany({
    where: { classId, status: 'ACTIVE' },
    include: { class: { select: { name: true } } },
    orderBy: [{ rollNo: 'asc' }, { name: 'asc' }],
  });
  const results = await prisma.result.findMany({ where: { examId, student: { classId } }, include: { subject: { select: { name: true, theoryFull: true, practicalFull: true } } } });
  const byStudent = new Map<number, any[]>();
  for (const r of results) { const a = byStudent.get(r.studentId) || []; a.push(r); byStudent.set(r.studentId, a); }
  const passPercent = exam?.examType === 'MONTHLY' ? 0.4 : 0.35; // monthly test passes at 40%
  const totalDays = exam?.totalWorkingDays ?? null;
  const attRows = await prisma.examAttendance.findMany({ where: { examId, student: { classId } } });
  const attByStudent = new Map<number, number>(attRows.map((a) => [a.studentId, a.presentDays]));

  const sheets: Sheet[] = students.map((s) => {
    const subjects = computeSubjects(byStudent.get(s.id) || [], passPercent);
    const sum = summarize(subjects);
    const present = attByStudent.has(s.id) ? attByStudent.get(s.id)! : null;
    return {
      student: { id: s.id, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo, iemis: s.iemis, className: s.class?.name || null },
      exam: exam ? { name: exam.name, examType: exam.examType, term: exam.term, sessionLabel: exam.sessionLabel, totalWorkingDays: totalDays } : null,
      subjects, ...sum,
      attendance: { present, total: totalDays, pass: attendancePass(present, totalDays) },
      rank: 0, classSize: students.length,
    };
  });
  // rank by percentage among students who actually have marks
  [...sheets].filter((s) => s.subjects.length).sort((a, b) => b.percent - a.percent).forEach((s, i) => { s.rank = i + 1; });
  return sheets;
}

/** One student's sheet (with class rank). */
export async function buildSheet(examId: number, studentId: number): Promise<Sheet | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { classId: true } });
  if (student?.classId == null) return null;
  const all = await buildClassSheets(examId, student.classId);
  return all.find((s) => s.student.id === studentId) || null;
}
