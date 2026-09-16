import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { usePdfViewer } from '@/components/PdfViewer';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { formatBS } from '@/lib/nepaliDate';

const EXAM_TYPES = [
  { value: 'TERMINAL_1', label: '1st Terminal Exam' },
  { value: 'TERMINAL_2', label: '2nd Terminal Exam' },
  { value: 'TERMINAL_3', label: '3rd Terminal Exam' },
  { value: 'FINAL', label: 'Final Exam' },
  { value: 'MONTHLY', label: 'Monthly Test' },
];
const examTypeLabel = (v: string) => EXAM_TYPES.find((t) => t.value === v)?.label || v;

export default function Exams() {
  const toast = useToast();
  const openPdf = usePdfViewer();

  // ---- Exams tab ----
  const exams = useFetch<any[]>('/exams');
  const [form, setForm] = useState({ name: '', term: '', sessionLabel: '', examType: 'TERMINAL_1', totalWorkingDays: '' });
  const [creating, setCreating] = useState(false);

  async function createExam() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/exams', { name: form.name, term: form.term, sessionLabel: form.sessionLabel, examType: form.examType, totalWorkingDays: form.totalWorkingDays });
      toast.success('Exam created');
      setForm({ name: '', term: '', sessionLabel: '', examType: 'TERMINAL_1', totalWorkingDays: '' });
      exams.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setCreating(false);
    }
  }

  // ---- Edit exam ----
  const [editExam, setEditExam] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', examType: 'TERMINAL_1', term: '', sessionLabel: '', totalWorkingDays: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  function openEditExam(r: any) {
    setEditForm({
      name: r.name || '', examType: r.examType || 'TERMINAL_1', term: r.term || '',
      sessionLabel: r.sessionLabel || '', totalWorkingDays: r.totalWorkingDays != null ? String(r.totalWorkingDays) : '',
    });
    setEditExam(r);
  }

  async function saveEditExam() {
    if (!editExam) return;
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    if (!confirm('Save changes to this exam?')) return;
    setSavingEdit(true);
    try {
      await api.patch(`/exams/${editExam.id}`, {
        name: editForm.name, examType: editForm.examType, term: editForm.term,
        sessionLabel: editForm.sessionLabel, totalWorkingDays: editForm.totalWorkingDays,
      });
      toast.success('Exam updated');
      setEditExam(null);
      exams.refetch();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingEdit(false);
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
    { header: 'Type', accessor: (r) => examTypeLabel(r.examType) },
    { header: 'Term', accessor: (r) => r.term },
    { header: 'Work. Days', accessor: (r) => r.totalWorkingDays ?? '—' },
    { header: '#Results', accessor: (r) => r._count?.results ?? 0 },
    { header: 'Created', accessor: (r) => formatBS(r.createdAt) },
    {
      header: '',
      accessor: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEditExam(r)}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => deleteExam(r.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  const classes = useFetch<any[]>('/classes');

  // ---- Marks Entry (per student) ----
  const [meExamId, setMeExamId] = useState('');
  const [meClassId, setMeClassId] = useState('');
  const [meStudentId, setMeStudentId] = useState('');
  const meStudents = useFetch<any[]>(meClassId ? `/classes/${meClassId}/students` : null);
  const [meRows, setMeRows] = useState<any[]>([]); // { subjectId, subjectName, marks, maxMarks }
  const [mePresent, setMePresent] = useState(''); // attendance: present days
  const [meTotalDays, setMeTotalDays] = useState<number | null>(null);
  const [meLoading, setMeLoading] = useState(false);
  const [meSaving, setMeSaving] = useState(false);
  const meMonthly = (exams.data || []).find((x) => String(x.id) === meExamId)?.examType === 'MONTHLY';

  useEffect(() => { setMeStudentId(''); }, [meClassId]);

  useEffect(() => {
    if (!meExamId || !meClassId || !meStudentId) { setMeRows([]); setMePresent(''); setMeTotalDays(null); return; }
    let active = true; setMeLoading(true);
    Promise.all([
      api.get(`/exams/${meExamId}/entry?classId=${meClassId}&studentId=${meStudentId}`),
      api.get(`/exams/${meExamId}/attendance?studentId=${meStudentId}`),
    ])
      .then(([res, att]) => {
        if (!active) return;
        setMeRows((res.data || []).map((r: any) => ({ ...r, theory: r.theory == null ? '' : String(r.theory), practical: r.practical == null ? '' : String(r.practical), obtained: r.obtained == null ? '' : String(r.obtained) })));
        setMePresent(att.data?.present == null ? '' : String(att.data.present));
        setMeTotalDays(att.data?.totalWorkingDays ?? null);
      })
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
        presentDays: mePresent === '' ? '' : Number(mePresent),
        records: meRows.map((r) => meMonthly
          ? ({ subjectId: r.subjectId, obtained: r.obtained === '' ? '' : Number(r.obtained), absent: !!r.absent })
          : ({ subjectId: r.subjectId, theory: r.theory === '' ? '' : Number(r.theory), practical: r.practical === '' ? '' : Number(r.practical), absent: !!r.absent })),
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
  const [rlNonce, setRlNonce] = useState(0);
  const rlMonthly = (exams.data || []).find((x) => String(x.id) === rlExamId)?.examType === 'MONTHLY';

  useEffect(() => {
    if (!rlExamId || !rlClassId) { setRlRows([]); return; }
    let active = true; setRlLoading(true);
    api.get(`/exams/${rlExamId}/ranklist?classId=${rlClassId}`)
      .then((res) => { if (active) setRlRows(res.data || []); })
      .catch((e) => { if (active) toast.error(apiError(e)); })
      .finally(() => { if (active) setRlLoading(false); });
    return () => { active = false; };
  }, [rlExamId, rlClassId, rlNonce]);

  async function resetStudentMarks(r: any) {
    if (!confirm(`Reset ${r.name}'s marks for this exam? This clears all their entered marks and removes them from the list.`)) return;
    try {
      await api.delete(`/exams/${rlExamId}/entry/${r.studentId}`);
      toast.success(`${r.name}'s marks reset`);
      setRlNonce((n) => n + 1);
    } catch (e) { toast.error(apiError(e)); }
  }

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
          {!rlMonthly && <Button size="sm" variant="outline" onClick={() => openPdf({ url: `/pdf/gradesheet?examId=${rlExamId}&studentId=${r.studentId}`, filename: `gradesheet-${r.name}.pdf`, title: `Grade Sheet — ${r.name}` })}>Grade</Button>}
          <Button size="sm" variant="ghost" title="Reset this student's marks" onClick={() => resetStudentMarks(r)}><Trash2 className="size-4 text-red-500" /></Button>
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
                <Field label="Exam Type">
                  <Select value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
                    {EXAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. First Terminal Exam" /></Field>
                <Field label="Term"><Input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} placeholder="Term 1" /></Field>
                <Field label="Session"><Input value={form.sessionLabel} onChange={(e) => setForm({ ...form, sessionLabel: e.target.value })} placeholder="2082-83" /></Field>
                <Field label="Total Working Days"><Input type="number" value={form.totalWorkingDays} onChange={(e) => setForm({ ...form, totalWorkingDays: e.target.value })} placeholder="e.g. 56" /></Field>
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
                  {meMonthly ? (
                    <Table>
                      <THead><TR><TH>Subject</TH><TH>Obtained</TH><TH>Absent</TH></TR></THead>
                      <TBody>
                        {meRows.map((r, i) => (
                          <TR key={r.subjectId}>
                            <TD>{r.subjectName} <span className="text-xs text-slate-400">/{r.maxMarks}</span></TD>
                            <TD><Input type="number" value={r.absent ? '' : r.obtained} disabled={!!r.absent} onChange={(e) => setRow(i, { obtained: e.target.value })} className="w-24" placeholder={r.absent ? 'ABS' : `/${r.maxMarks}`} /></TD>
                            <TD>
                              <input type="checkbox" className="size-4 accent-[#262081]" checked={!!r.absent}
                                onChange={(e) => setRow(i, e.target.checked ? { absent: true, obtained: '' } : { absent: false })} />
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  ) : (
                  <Table>
                    <THead><TR><TH>Subject</TH><TH>Theory</TH><TH>Practical</TH><TH>Total</TH><TH>Absent</TH></TR></THead>
                    <TBody>
                      {meRows.map((r, i) => {
                        const hasPr = Number(r.practicalFull) > 0;
                        const full = Number(r.theoryFull || 0) + Number(r.practicalFull || 0);
                        const total = r.absent ? 0 : Number(r.theory || 0) + (hasPr ? Number(r.practical || 0) : 0);
                        return (
                          <TR key={r.subjectId}>
                            <TD>{r.subjectName} <span className="text-xs text-slate-400">/{full}</span></TD>
                            <TD><Input type="number" value={r.absent ? '' : r.theory} disabled={!!r.absent} onChange={(e) => setRow(i, { theory: e.target.value })} className="w-20" placeholder={r.absent ? 'ABS' : `/${r.theoryFull}`} /></TD>
                            <TD>{hasPr
                              ? <Input type="number" value={r.absent ? '' : r.practical} disabled={!!r.absent} onChange={(e) => setRow(i, { practical: e.target.value })} className="w-20" placeholder={r.absent ? 'ABS' : `/${r.practicalFull}`} />
                              : <span className="text-slate-400">—</span>}</TD>
                            <TD className="font-medium">{r.absent ? '—' : total}</TD>
                            <TD>
                              <input
                                type="checkbox"
                                className="size-4 accent-[#262081]"
                                checked={!!r.absent}
                                onChange={(e) => setRow(i, e.target.checked ? { absent: true, theory: '', practical: '' } : { absent: false })}
                              />
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                  )}
                  <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
                    <Field label={`Attendance — present days${meTotalDays != null ? ` (out of ${meTotalDays})` : ''}`}>
                      <Input type="number" value={mePresent} onChange={(e) => setMePresent(e.target.value)} className="w-32"
                        placeholder={meTotalDays != null ? `/ ${meTotalDays}` : 'present days'} />
                    </Field>
                    {meTotalDays == null && <span className="pb-2 text-xs text-amber-600">Set “Total Working Days” on the exam to compute attendance %.</span>}
                    {meTotalDays != null && mePresent !== '' && Number(mePresent) / meTotalDays < 0.75 && (
                      <span className="pb-2 text-sm font-medium text-red-600">Below 75% — counts as fail in attendance</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={saveStudentMarks} disabled={meSaving}>{meSaving ? 'Saving…' : 'Save Marks'}</Button>
                    <Button variant="outline" onClick={() => openPdf({ url: `/pdf/marksheet?examId=${meExamId}&studentId=${meStudentId}`, filename: `marksheet-${meStudentName}.pdf`, title: `Marks Sheet — ${meStudentName}` })}>Marks Sheet</Button>
                    {!meMonthly && <Button variant="outline" onClick={() => openPdf({ url: `/pdf/gradesheet?examId=${meExamId}&studentId=${meStudentId}`, filename: `gradesheet-${meStudentName}.pdf`, title: `Grade Sheet — ${meStudentName}` })}>Grade Sheet</Button>}
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
                  <Button variant="outline" onClick={() => openPdf({ url: `/pdf/class-marksheet?examId=${rlExamId}&classId=${rlClassId}`, filename: 'class-marksheet.pdf', title: 'Class Marks Sheet' })}>Class Marks Sheet</Button>
                  {!rlMonthly && <Button variant="outline" onClick={() => openPdf({ url: `/pdf/class-gradesheet?examId=${rlExamId}&classId=${rlClassId}`, filename: 'class-gradesheet.pdf', title: 'Class Grade Sheet' })}>Class Grade Sheet</Button>}
                  <Button variant="outline" onClick={() => openPdf({ url: `/pdf/tabulation?examId=${rlExamId}&classId=${rlClassId}`, filename: 'tabulation.pdf', title: 'Tabulation Record' })}>Tabulation Record</Button>
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

      {/* Edit exam */}
      <Dialog open={!!editExam} onOpenChange={(o) => { if (!o) setEditExam(null); }}>
        <DialogContent
          title="Edit Exam"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditExam(null)}>Cancel</Button>
              <Button onClick={saveEditExam} disabled={savingEdit || !editForm.name.trim()}>{savingEdit ? 'Saving…' : 'Save Changes'}</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Exam Type">
              <Select value={editForm.examType} onChange={(e) => setEditForm({ ...editForm, examType: e.target.value })}>
                {EXAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="Name"><Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="e.g. First Terminal Exam" /></Field>
            <Field label="Term"><Input value={editForm.term} onChange={(e) => setEditForm({ ...editForm, term: e.target.value })} placeholder="Term 1" /></Field>
            <Field label="Session"><Input value={editForm.sessionLabel} onChange={(e) => setEditForm({ ...editForm, sessionLabel: e.target.value })} placeholder="2082-83" /></Field>
            <Field label="Total Working Days"><Input type="number" value={editForm.totalWorkingDays} onChange={(e) => setEditForm({ ...editForm, totalWorkingDays: e.target.value })} placeholder="e.g. 56" /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
