import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { usePdfViewer } from '@/components/PdfViewer';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { formatBS } from '@/lib/nepaliDate';

export default function Exams() {
  const toast = useToast();
  const openPdf = usePdfViewer();

  // ---- Exams tab ----
  const exams = useFetch<any[]>('/exams');
  const [form, setForm] = useState({ name: '', term: '', sessionLabel: '' });
  const [creating, setCreating] = useState(false);

  async function createExam() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/exams', { name: form.name, term: form.term, sessionLabel: form.sessionLabel });
      toast.success('Exam created');
      setForm({ name: '', term: '', sessionLabel: '' });
      exams.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCreating(false);
    }
  }

  async function deleteExam(id: number | string) {
    if (!confirm('Delete this exam? All its marks will be removed.')) return;
    try {
      await api.delete(`/exams/${id}`);
      toast.success('Exam deleted');
      exams.refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const examColumns: Column<any>[] = [
    { header: 'Name', accessor: (r) => r.name },
    { header: 'Term', accessor: (r) => r.term },
    { header: '#Results', accessor: (r) => r._count?.results ?? 0 },
    { header: 'Created', accessor: (r) => formatBS(r.createdAt) },
    { header: '', accessor: (r) => <Button variant="destructive" size="sm" onClick={() => deleteExam(r.id)}>Delete</Button> },
  ];

  const classes = useFetch<any[]>('/classes');

  // ---- Marks Entry (per student) ----
  const [meExamId, setMeExamId] = useState('');
  const [meClassId, setMeClassId] = useState('');
  const [meStudentId, setMeStudentId] = useState('');
  const meStudents = useFetch<any[]>(meClassId ? `/classes/${meClassId}/students` : null);
  const [meRows, setMeRows] = useState<any[]>([]); // { subjectId, subjectName, marks, maxMarks }
  const [meLoading, setMeLoading] = useState(false);
  const [meSaving, setMeSaving] = useState(false);

  useEffect(() => { setMeStudentId(''); }, [meClassId]);

  useEffect(() => {
    if (!meExamId || !meClassId || !meStudentId) { setMeRows([]); return; }
    let active = true; setMeLoading(true);
    api.get(`/exams/${meExamId}/entry?classId=${meClassId}&studentId=${meStudentId}`)
      .then((res) => { if (active) setMeRows((res.data || []).map((r: any) => ({ ...r, marks: r.marks == null ? '' : String(r.marks), maxMarks: String(r.maxMarks ?? 100) }))); })
      .catch((e) => { if (active) toast.error(apiError(e)); })
      .finally(() => { if (active) setMeLoading(false); });
    return () => { active = false; };
  }, [meExamId, meClassId, meStudentId]);

  const setRow = (i: number, patch: any) => setMeRows((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function saveStudentMarks() {
    if (!meExamId || !meStudentId) return;
    setMeSaving(true);
    try {
      await api.post(`/exams/${meExamId}/entry`, {
        studentId: Number(meStudentId),
        records: meRows.map((r) => ({ subjectId: r.subjectId, marks: r.marks === '' ? '' : Number(r.marks), maxMarks: Number(r.maxMarks || 100) })),
      });
      toast.success('Marks saved');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setMeSaving(false);
    }
  }

  const meStudentName = (meStudents.data || []).find((s) => String(s.id) === meStudentId)?.name || 'student';

  // ---- Rank List & Sheets ----
  const [rlExamId, setRlExamId] = useState('');
  const [rlClassId, setRlClassId] = useState('');
  const [rlRows, setRlRows] = useState<any[]>([]);
  const [rlLoading, setRlLoading] = useState(false);

  useEffect(() => {
    if (!rlExamId || !rlClassId) { setRlRows([]); return; }
    let active = true; setRlLoading(true);
    api.get(`/exams/${rlExamId}/ranklist?classId=${rlClassId}`)
      .then((res) => { if (active) setRlRows(res.data || []); })
      .catch((e) => { if (active) toast.error(apiError(e)); })
      .finally(() => { if (active) setRlLoading(false); });
    return () => { active = false; };
  }, [rlExamId, rlClassId]);

  const rankColumns: Column<any>[] = [
    { header: 'Rank', accessor: (r) => r.rank },
    { header: 'Roll', accessor: (r) => r.rollNo },
    { header: 'Name', accessor: (r) => r.name },
    { header: 'Total', accessor: (r) => `${r.total}/${r.max}` },
    { header: 'Percent', accessor: (r) => `${r.percent}%` },
    { header: 'Grade', accessor: (r) => <Badge variant={statusVariant(r.grade)}>{r.grade}</Badge> },
    { header: 'GPA', accessor: (r) => r.gpa },
    {
      header: 'Sheets',
      accessor: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => openPdf({ url: `/pdf/marksheet?examId=${rlExamId}&studentId=${r.studentId}`, filename: `marksheet-${r.name}.pdf`, title: `Marks Sheet — ${r.name}` })}>Marks</Button>
          <Button size="sm" variant="outline" onClick={() => openPdf({ url: `/pdf/gradesheet?examId=${rlExamId}&studentId=${r.studentId}`, filename: `gradesheet-${r.name}.pdf`, title: `Grade Sheet — ${r.name}` })}>Grade</Button>
        </div>
      ),
    },
  ];

  const examOptions = (
    <>
      <option value="">Select exam</option>
      {(exams.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
    </>
  );
  const classOptions = (
    <>
      <option value="">Select class</option>
      {(classes.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </>
  );

  return (
    <div>
      <PageHeader title="Exams" subtitle="Create exams, enter marks, and print marks sheets & grade sheets" />

      <Tabs defaultValue="exams">
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="marks">Marks Entry</TabsTrigger>
          <TabsTrigger value="sheets">Results &amp; Sheets</TabsTrigger>
        </TabsList>

        {/* Exams */}
        <TabsContent value="exams">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader><CardTitle>Create Exam</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="First Terminal Exam" /></Field>
                <Field label="Term"><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Term 1" /></Field>
                <Field label="Session"><Input value={form.sessionLabel} onChange={(e) => setForm({ ...form, sessionLabel: e.target.value })} placeholder="2082-83" /></Field>
                <Button onClick={createExam} disabled={creating || !form.name.trim()}>{creating ? 'Creating…' : 'Create Exam'}</Button>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader><CardTitle>All Exams</CardTitle></CardHeader>
              <CardContent>
                {exams.loading ? <Loading /> : (exams.data?.length ?? 0) === 0 ? <EmptyState title="No exams yet" /> : <DataTable columns={examColumns} data={exams.data || []} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Marks Entry (per student) */}
        <TabsContent value="marks">
          <Card>
            <CardHeader><CardTitle>Class-wise Marks Entry</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Exam"><Select value={meExamId} onChange={(e) => setMeExamId(e.target.value)}>{examOptions}</Select></Field>
                <Field label="Class"><Select value={meClassId} onChange={(e) => setMeClassId(e.target.value)}>{classOptions}</Select></Field>
                <Field label="Student">
                  <Select value={meStudentId} onChange={(e) => setMeStudentId(e.target.value)} disabled={!meClassId}>
                    <option value="">Select student</option>
                    {(meStudents.data || []).map((s) => <option key={s.id} value={s.id}>{s.rollNo ? `${s.rollNo}. ` : ''}{s.name}</option>)}
                  </Select>
                </Field>
              </div>

              {!meExamId || !meClassId ? (
                <EmptyState title="Select an exam and class" />
              ) : !meStudentId ? (
                <EmptyState title="Select a student to enter marks" />
              ) : meLoading ? (
                <Loading />
              ) : meRows.length === 0 ? (
                <EmptyState title="No subjects for this class" description="Add subjects for this class on the Subjects page first." />
              ) : (
                <>
                  <Table>
                    <THead><TR><TH>Subject</TH><TH>Full Marks</TH><TH>Obtained</TH></TR></THead>
                    <TBody>
                      {meRows.map((r, i) => (
                        <TR key={r.subjectId}>
                          <TD>{r.subjectName}</TD>
                          <TD><Input type="number" value={r.maxMarks} onChange={(e) => setRow(i, { maxMarks: e.target.value })} className="w-24" /></TD>
                          <TD><Input type="number" value={r.marks} onChange={(e) => setRow(i, { marks: e.target.value })} className="w-24" placeholder="—" /></TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={saveStudentMarks} disabled={meSaving}>{meSaving ? 'Saving…' : 'Save Marks'}</Button>
                    <Button variant="outline" onClick={() => openPdf({ url: `/pdf/marksheet?examId=${meExamId}&studentId=${meStudentId}`, filename: `marksheet-${meStudentName}.pdf`, title: `Marks Sheet — ${meStudentName}` })}>Marks Sheet</Button>
                    <Button variant="outline" onClick={() => openPdf({ url: `/pdf/gradesheet?examId=${meExamId}&studentId=${meStudentId}`, filename: `gradesheet-${meStudentName}.pdf`, title: `Grade Sheet — ${meStudentName}` })}>Grade Sheet</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results & Sheets */}
        <TabsContent value="sheets">
          <Card>
            <CardHeader><CardTitle>Rank List &amp; Class Sheets</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Exam"><Select value={rlExamId} onChange={(e) => setRlExamId(e.target.value)}>{examOptions}</Select></Field>
                <Field label="Class"><Select value={rlClassId} onChange={(e) => setRlClassId(e.target.value)}>{classOptions}</Select></Field>
              </div>

              {rlExamId && rlClassId && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">Whole class (2 per A4 landscape):</span>
                  <Button variant="outline" onClick={() => openPdf({ url: `/pdf/class-marksheet?examId=${rlExamId}&classId=${rlClassId}`, filename: 'class-marksheet.pdf', title: 'Class Marks Sheet (2 per page)' })}>Class Marks Sheet</Button>
                  <Button variant="outline" onClick={() => openPdf({ url: `/pdf/class-gradesheet?examId=${rlExamId}&classId=${rlClassId}`, filename: 'class-gradesheet.pdf', title: 'Class Grade Sheet (2 per page)' })}>Class Grade Sheet</Button>
                </div>
              )}

              {!rlExamId || !rlClassId ? (
                <EmptyState title="Select an exam and class" />
              ) : rlLoading ? (
                <Loading />
              ) : rlRows.length === 0 ? (
                <EmptyState title="No marks entered for this class yet" />
              ) : (
                <DataTable columns={rankColumns} data={rlRows} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
