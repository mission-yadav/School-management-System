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

export type SubjectRow = { subject: string; marks: number; maxMarks: number; passMarks: number; grade: string; gpa: number; pass: boolean };
export type Sheet = {
  student: { id: number; name: string; rollNo: string | null; admissionNo: string; iemis: string | null; className: string | null };
  exam: { name: string; term: string | null; sessionLabel: string | null } | null;
  subjects: SubjectRow[];
  total: number; max: number; percent: number; gpa: number; grade: string; result: 'PASS' | 'FAIL';
  rank: number; classSize: number;
};

function computeSubjects(results: any[], gf: (p: number) => { grade: string; gpa: number }): SubjectRow[] {
  return results
    .slice()
    .sort((a, b) => (a.subject?.name || '').localeCompare(b.subject?.name || ''))
    .map((r) => {
      const passMarks = Math.round(r.maxMarks * 0.35);
      const percent = r.maxMarks ? (r.marks / r.maxMarks) * 100 : 0;
      const g = gf(percent);
      return { subject: r.subject.name, marks: r.marks, maxMarks: r.maxMarks, passMarks, grade: g.grade, gpa: g.gpa, pass: r.marks >= passMarks };
    });
}

function summarize(subjects: SubjectRow[], gf: (p: number) => { grade: string; gpa: number }) {
  const total = subjects.reduce((a, s) => a + s.marks, 0);
  const max = subjects.reduce((a, s) => a + s.maxMarks, 0);
  const percent = max ? (total / max) * 100 : 0;
  const gpa = subjects.length ? subjects.reduce((a, s) => a + s.gpa, 0) / subjects.length : 0;
  const allPass = subjects.length > 0 && subjects.every((s) => s.pass);
  return {
    total, max,
    percent: Math.round(percent * 100) / 100,
    gpa: Math.round(gpa * 100) / 100,
    grade: subjects.length ? gf(percent).grade : '—',
    result: (allPass ? 'PASS' : 'FAIL') as 'PASS' | 'FAIL',
  };
}

/** All students of a class for an exam — each with subject rows, totals, GPA, grade, result and class rank. */
export async function buildClassSheets(examId: number, classId: number): Promise<Sheet[]> {
  const gf = await gradeResolver();
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  const students = await prisma.student.findMany({
    where: { classId, status: 'ACTIVE' },
    include: { class: { select: { name: true } } },
    orderBy: [{ rollNo: 'asc' }, { name: 'asc' }],
  });
  const results = await prisma.result.findMany({ where: { examId, student: { classId } }, include: { subject: { select: { name: true } } } });
  const byStudent = new Map<number, any[]>();
  for (const r of results) { const a = byStudent.get(r.studentId) || []; a.push(r); byStudent.set(r.studentId, a); }

  const sheets: Sheet[] = students.map((s) => {
    const subjects = computeSubjects(byStudent.get(s.id) || [], gf);
    const sum = summarize(subjects, gf);
    return {
      student: { id: s.id, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo, iemis: s.iemis, className: s.class?.name || null },
      exam: exam ? { name: exam.name, term: exam.term, sessionLabel: exam.sessionLabel } : null,
      subjects, ...sum, rank: 0, classSize: students.length,
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
