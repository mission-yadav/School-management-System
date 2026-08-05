import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/context/auth';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Label, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatBS } from '@/lib/nepaliDate';
import { useToast } from '@/components/ui/toast';

const STATUSES: { key: string; label: string }[] = [
  { key: 'PRESENT', label: 'Present' },
  { key: 'ABSENT', label: 'Absent' },
  { key: 'LATE', label: 'Late' },
];

export default function Attendance() {
  const { user } = useAuth();
  const classesUrl = user?.role === 'TEACHER' ? '/classes/mine' : '/classes';
  const { data: classes } = useFetch<any[]>(classesUrl);
  const toast = useToast();

  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId || !date) {
      setRows([]);
      return;
    }
    let active = true;
    setLoading(true);
    api
      .get(`/attendance?classId=${classId}&date=${date}`)
      .then((res: any) => {
        if (!active) return;
        const list = (res.data || res || []).map((r: any) => ({
          ...r,
          status: r.status || 'PRESENT',
        }));
        setRows(list);
      })
      .catch((e) => {
        if (active) toast(apiError(e), 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [classId, date]);

  function setStatus(studentId: any, status: string) {
    setRows((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, status } : r)));
  }

  function setAll(status: string) {
    setRows((prev) => prev.map((r) => ({ ...r, status })));
  }

  async function save() {
    if (!classId) return;
    setSaving(true);
    try {
      await api.post('/attendance', {
        classId: Number(classId),
        date,
        records: rows.map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      toast('Attendance saved');
    } catch (e) {
      toast(apiError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark daily attendance" />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <Field className="min-w-[200px]">
            <Label>Class</Label>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {(classes || []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="min-w-[160px]">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {date && <div className="mt-1 text-xs font-medium text-brand">{formatBS(date)} BS</div>}
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAll('PRESENT')} disabled={!rows.length}>
              All Present
            </Button>
            <Button variant="outline" onClick={() => setAll('ABSENT')} disabled={!rows.length}>
              All Absent
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Loading />
      ) : !classId ? (
        <EmptyState title="Select a class" message="Choose a class and date to mark attendance." />
      ) : rows.length === 0 ? (
        <EmptyState title="No students" message="No students found for this class." />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Roll</TH>
                <TH>Student</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.studentId}>
                  <TD>{r.rollNo || '—'}</TD>
                  <TD>{r.name}</TD>
                  <TD>
                    <div className="flex gap-2">
                      {STATUSES.map((s) => (
                        <Button
                          key={s.key}
                          size="sm"
                          variant={r.status === s.key ? 'default' : 'outline'}
                          onClick={() => setStatus(r.studentId, s.key)}
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>

          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Attendance'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
