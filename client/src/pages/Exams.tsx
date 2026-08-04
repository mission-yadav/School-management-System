import { useEffect, useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

export default function Exams() {
  const toast = useToast();

  // ---- Exams tab ----
  const exams = useFetch<any[]>('/exams');
  const [form, setForm] = useState({ name: '', term: '', sessionLabel: '' });
  const [creating, setCreating] = useState(false);

  async function createExam() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/exams', {
        name: form.name,
        term: form.term,
        sessionLabel: form.sessionLabel,
      });
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
    if (!confirm('Delete this exam?')) return;
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
    { header: '#Subjects', accessor: (r) => r._count?.subjects ?? 0 },
    { header: '#Results', accessor: (r) => r._count?.results ?? 0 },
    { header: 'Created', accessor: (r) => new Date(r.createdAt).toLocaleDateString() },
    {
      header: '',
      accessor: (r) => (
        <Button variant="destructive" size="sm" onClick={() => deleteExam(r.id)}>
          Delete
        </Button>
      ),
    },
  ];

  // ---- shared selects data ----
  const classes = useFetch<any[]>('/classes');

  // ---- Marks Entry tab ----
  const [meExamId, setMeExamId] = useState('');
  const [meClassId, setMeClassId] = useState('');
  const [meSubjectId, setMeSubjectId] = useState('');
  const [meMaxMarks, setMeMaxMarks] = useState('100');
  const meSubjects = useFetch<any[]>(meClassId ? `/subjects?classId=${meClassId}` : null);
  const [meRows, setMeRows] = useState<any[]>([]);
  const [meLoading, setMeLoading] = useState(false);
  const [meSaving, setMeSaving] = useState(false);

  // reset dependents
  useEffect(() => {
    setMeSubjectId('');
  }, [meClassId]);

  useEffect(() => {
    if (!meExamId || !meClassId || !meSubjectId) {
      setMeRows([]);
      return;
    }
    let active = true;
    setMeLoading(true);
    api
      .get(`/exams/${meExamId}/results?classId=${meClassId}&subjectId=${meSubjectId}`)
      .then((res) => {
        if (!active) return;
        const data: any[] = res.data || [];
        setMeRows(
          data.map((r) => ({
            ...r,
            marks: r.marks === null || r.marks === undefined ? '' : String(r.marks),
          }))
        );
      })
      .catch((e) => {
        if (active) toast.error(apiError(e));
      })
      .finally(() => {
        if (active) setMeLoading(false);
      });
    return () => {
      active = false;
    };
  }, [meExamId, meClassId, meSubjectId]);

  function setRowMarks(i: number, value: string) {
    setMeRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, marks: value } : r)));
  }

  async function saveMarks() {
    if (!meExamId || !meSubjectId) return;
    setMeSaving(true);
    try {
      await api.post(`/exams/${meExamId}/results`, {
        subjectId: Number(meSubjectId),
        maxMarks: Number(meMaxMarks),
        records: meRows.map((r) => ({
          studentId: r.studentId,
          marks: r.marks === '' ? '' : Number(r.marks),
        })),
      });
      toast.success('Marks saved');
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setMeSaving(false);
    }
  }

  // ---- Rank List tab ----
  const [rlExamId, setRlExamId] = useState('');
  const [rlClassId, setRlClassId] = useState('');
  const [rlRows, setRlRows] = useState<any[]>([]);
  const [rlLoading, setRlLoading] = useState(false);

  useEffect(() => {
    if (!rlExamId || !rlClassId) {
      setRlRows([]);
      return;
    }
    let active = true;
    setRlLoading(true);
    api
      .get(`/exams/${rlExamId}/ranklist?classId=${rlClassId}`)
      .then((res) => {
        if (active) setRlRows(res.data || []);
      })
      .catch((e) => {
        if (active) toast.error(apiError(e));
      })
      .finally(() => {
        if (active) setRlLoading(false);
      });
    return () => {
      active = false;
    };
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
      header: '',
      accessor: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadFile(
              `/pdf/report-card?examId=${rlExamId}&studentId=${r.studentId}`,
              `report-${r.name}.pdf`
            )
          }
        >
          Report Card PDF
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Exams" subtitle="Manage exams, enter marks and generate rank lists" />

      <Tabs defaultValue="exams">
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="marks">Marks Entry</TabsTrigger>
          <TabsTrigger value="ranks">Rank List &amp; Report Cards</TabsTrigger>
        </TabsList>

        {/* Exams */}
        <TabsContent value="exams">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Create Exam</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Name">
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Mid Term"
                  />
                </Field>
                <Field label="Term">
                  <Input
                    value={form.term}
                    onChange={(e) => setForm({ ...form, term: e.target.value })}
                    placeholder="Term 1"
                  />
                </Field>
                <Field label="Session">
                  <Input
                    value={form.sessionLabel}
                    onChange={(e) => setForm({ ...form, sessionLabel: e.target.value })}
                    placeholder="2025-26"
                  />
                </Field>
                <Button onClick={createExam} disabled={creating || !form.name.trim()}>
                  {creating ? 'Creating…' : 'Create Exam'}
                </Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>All Exams</CardTitle>
              </CardHeader>
              <CardContent>
                {exams.loading ? (
                  <Loading />
                ) : (exams.data?.length ?? 0) === 0 ? (
                  <EmptyState title="No exams yet" />
                ) : (
                  <DataTable columns={examColumns} data={exams.data || []} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Marks Entry */}
        <TabsContent value="marks">
          <Card>
            <CardHeader>
              <CardTitle>Marks Entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Exam">
                  <Select value={meExamId} onChange={(e) => setMeExamId(e.target.value)}>
                    <option value="">Select exam</option>
                    {(exams.data || []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Class">
                  <Select value={meClassId} onChange={(e) => setMeClassId(e.target.value)}>
                    <option value="">Select class</option>
                    {(classes.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Subject">
                  <Select
                    value={meSubjectId}
                    onChange={(e) => setMeSubjectId(e.target.value)}
                    disabled={!meClassId}
                  >
                    <option value="">Select subject</option>
                    {(meSubjects.data || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Max Marks">
                  <Input
                    type="number"
                    value={meMaxMarks}
                    onChange={(e) => setMeMaxMarks(e.target.value)}
                  />
                </Field>
              </div>

              {!meExamId || !meClassId || !meSubjectId ? (
                <EmptyState title="Select exam, class and subject to enter marks" />
              ) : meLoading ? (
                <Loading />
              ) : meRows.length === 0 ? (
                <EmptyState title="No students found" />
              ) : (
                <>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Roll</TH>
                        <TH>Student</TH>
                        <TH>Marks</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {meRows.map((r, i) => (
                        <TR key={r.studentId}>
                          <TD>{r.rollNo}</TD>
                          <TD>{r.name}</TD>
                          <TD>
                            <Input
                              type="number"
                              value={r.marks}
                              onChange={(e) => setRowMarks(i, e.target.value)}
                              className="w-24"
                            />
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  <Button onClick={saveMarks} disabled={meSaving}>
                    {meSaving ? 'Saving…' : 'Save Marks'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rank List */}
        <TabsContent value="ranks">
          <Card>
            <CardHeader>
              <CardTitle>Rank List &amp; Report Cards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Exam">
                  <Select value={rlExamId} onChange={(e) => setRlExamId(e.target.value)}>
                    <option value="">Select exam</option>
                    {(exams.data || []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Class">
                  <Select value={rlClassId} onChange={(e) => setRlClassId(e.target.value)}>
                    <option value="">Select class</option>
                    {(classes.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {!rlExamId || !rlClassId ? (
                <EmptyState title="Select exam and class to view rank list" />
              ) : rlLoading ? (
                <Loading />
              ) : rlRows.length === 0 ? (
                <EmptyState title="No results found" />
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
