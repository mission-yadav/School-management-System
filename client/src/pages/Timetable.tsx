import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/context/auth';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Label, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const GRID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PERIODS = [1, 2, 3, 4, 5, 6];

export default function Timetable() {
  const { user } = useAuth();
  if (user?.role === 'TEACHER') return <TeacherTimetable />;
  return <AdminTimetable />;
}

function TeacherTimetable() {
  const { data, loading } = useFetch<any[]>('/timetable/mine');

  if (loading) return <Loading />;

  return (
    <div>
      <PageHeader title="My Timetable" subtitle="Your weekly schedule" />
      {!data || data.length === 0 ? (
        <EmptyState title="No schedule" message="You have no timetable slots yet." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day) => {
            const slots = (data || [])
              .filter((s) => s.day === day)
              .sort((a, b) => (a.period || 0) - (b.period || 0));
            if (slots.length === 0) return null;
            return (
              <Card key={day}>
                <CardHeader>
                  <CardTitle>{day}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {slots.map((s) => (
                    <div key={s.id} className="rounded-md border p-2 text-sm">
                      <div className="font-medium">{s.subjectName}</div>
                      <div className="text-muted-foreground">{s.className}</div>
                      <div className="text-muted-foreground">
                        Period {s.period} · {s.startTime}–{s.endTime}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminTimetable() {
  const { data: classes } = useFetch<any[]>('/classes');
  const { data: teachers } = useFetch<any[]>('/teachers');
  const toast = useToast();

  const [classId, setClassId] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cellDay, setCellDay] = useState('');
  const [cellPeriod, setCellPeriod] = useState<number>(0);
  const [existing, setExisting] = useState<any>(null);
  const [subjectId, setSubjectId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  function loadSlots() {
    if (!classId) {
      setSlots([]);
      return;
    }
    setLoading(true);
    api
      .get(`/timetable?classId=${classId}`)
      .then((res: any) => setSlots(res.data || res || []))
      .catch((e) => toast(apiError(e), 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadSlots();
    if (!classId) {
      setSubjects([]);
      return;
    }
    api
      .get(`/subjects?classId=${classId}`)
      .then((res: any) => setSubjects(res.data || res || []))
      .catch((e) => toast(apiError(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  function findSlot(day: string, period: number) {
    return slots.find((s) => s.day === day && s.period === period);
  }

  function openCell(day: string, period: number) {
    const slot = findSlot(day, period);
    setCellDay(day);
    setCellPeriod(period);
    setExisting(slot || null);
    setSubjectId(slot ? String(slot.subjectId) : '');
    setTeacherId(slot ? String(slot.teacherId) : '');
    setStartTime(slot ? slot.startTime || '' : '');
    setEndTime(slot ? slot.endTime || '' : '');
    setOpen(true);
  }

  async function save() {
    if (!classId || !subjectId) return;
    setSaving(true);
    try {
      await api.post('/timetable', {
        classId: Number(classId),
        subjectId: Number(subjectId),
        teacherId: teacherId ? Number(teacherId) : null,
        day: cellDay,
        period: cellPeriod,
        startTime,
        endTime,
      });
      toast('Slot saved');
      setOpen(false);
      loadSlots();
    } catch (e) {
      toast(apiError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function clearSlot() {
    if (!existing) return;
    setSaving(true);
    try {
      await api.delete(`/timetable/${existing.id}`);
      toast('Slot cleared');
      setOpen(false);
      loadSlots();
    } catch (e) {
      toast(apiError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Timetable" subtitle="Manage class schedule" />

      <div className="mb-4 max-w-xs">
        <Field>
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
      </div>

      {!classId ? (
        <EmptyState title="Select a class" message="Choose a class to view its timetable." />
      ) : loading ? (
        <Loading />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Day</TH>
              {PERIODS.map((p) => (
                <TH key={p}>Period {p}</TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {GRID_DAYS.map((day) => (
              <TR key={day}>
                <TH>{day}</TH>
                {PERIODS.map((p) => {
                  const slot = findSlot(day, p);
                  return (
                    <TD key={p}>
                      <button
                        type="button"
                        onClick={() => openCell(day, p)}
                        className="w-full min-h-[48px] rounded-md border border-dashed p-2 text-left text-xs hover:bg-muted"
                      >
                        {slot ? (
                          <>
                            <div className="font-medium">{slot.subjectName}</div>
                            <div className="text-muted-foreground">{slot.teacherName || '—'}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">+ Add</span>
                        )}
                      </button>
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`${cellDay} · Period ${cellPeriod}`}
          footer={
            <>
              {existing && (
                <Button variant="destructive" onClick={clearSlot} disabled={saving}>
                  Clear
                </Button>
              )}
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !subjectId}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field>
              <Label>Subject</Label>
              <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                <option value="">Select subject</option>
                {(subjects || []).map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <Label>Teacher</Label>
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">None</option>
                {(teachers || []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </Field>
              <Field>
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </Field>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
