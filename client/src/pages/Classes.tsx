import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Label, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export default function Classes() {
  const { data, loading, refetch } = useFetch<any[]>('/classes');
  const { data: teachers } = useFetch<any[]>('/teachers');
  const toast = useToast();
  const classes = data || [];

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [order, setOrder] = useState('');
  const [capacity, setCapacity] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');
  const [sections, setSections] = useState('');

  function openAdd() {
    setEditing(null);
    setName(''); setOrder(''); setCapacity(''); setClassTeacherId(''); setSections('');
    setOpen(true);
  }
  function openEdit(row: any) {
    setEditing(row);
    setName(row.name || '');
    setOrder(row.order != null ? String(row.order) : '');
    setCapacity(row.capacity != null ? String(row.capacity) : '');
    setClassTeacherId(row.classTeacherId != null ? String(row.classTeacherId) : '');
    setSections('');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const base = {
        name,
        order: order ? Number(order) : 0,
        capacity: capacity ? Number(capacity) : null,
        classTeacherId: classTeacherId ? Number(classTeacherId) : null,
      };
      if (editing) {
        await api.put(`/classes/${editing.id}`, base);
        toast('Class updated');
      } else {
        const sectionList = sections.split(',').map((n) => n.trim()).filter(Boolean).map((n) => ({ name: n }));
        await api.post('/classes', { ...base, sections: sectionList });
        toast('Class created');
      }
      setOpen(false);
      refetch();
    } catch (e) {
      toast(apiError(e), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: any) {
    if (!confirm(`Delete class "${row.name}"?`)) return;
    try {
      await api.delete(`/classes/${row.id}`);
      toast('Class deleted');
      refetch();
    } catch (e) {
      toast(apiError(e), 'error');
    }
  }

  // ---------------- promotion ----------------
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [srcId, setSrcId] = useState('');
  const [pStudents, setPStudents] = useState<any[]>([]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [promoting, setPromoting] = useState(false);

  const srcClass = classes.find((c) => String(c.id) === srcId);
  const checkedCount = pStudents.filter((s) => checked[s.id]).length;

  function openPromote() {
    setSrcId(''); setPStudents([]); setChecked({}); setTargets({});
    setPromoteOpen(true);
  }
  async function loadStudents(classId: string) {
    setSrcId(classId);
    setPStudents([]); setChecked({}); setTargets({});
    if (!classId) return;
    try {
      const { data } = await api.get(`/classes/${classId}/students`);
      const cls = classes.find((c) => String(c.id) === classId);
      const tgt = cls?.nextClassId ? String(cls.nextClassId) : '';
      const chk: Record<number, boolean> = {}, tg: Record<number, string> = {};
      (data as any[]).forEach((s) => { chk[s.id] = true; tg[s.id] = tgt; });
      setPStudents(data); setChecked(chk); setTargets(tg);
    } catch (e) { toast(apiError(e), 'error'); }
  }
  const allChecked = pStudents.length > 0 && pStudents.every((s) => checked[s.id]);
  function toggleAll() {
    const v = !allChecked;
    setChecked(Object.fromEntries(pStudents.map((s) => [s.id, v])));
  }
  async function doPromote() {
    const promotions = pStudents
      .filter((s) => checked[s.id] && targets[s.id])
      .map((s) => ({ studentId: s.id, targetClassId: Number(targets[s.id]) }));
    if (!promotions.length) { toast('Tick students and choose a target class', 'error'); return; }
    setPromoting(true);
    try {
      const { data } = await api.post('/classes/promote', { promotions });
      toast(`Promoted ${data.promoted} student(s) · fees adjusted`);
      setPromoteOpen(false);
      refetch();
    } catch (e) { toast(apiError(e), 'error'); } finally { setPromoting(false); }
  }

  const columns: Column<any>[] = [
    { header: '#', className: 'w-12 text-slate-400', cell: (r) => r.order || '—' },
    { header: 'Class', cell: (r) => r.name },
    { header: 'Promotes to', cell: (r) => classes.find((c) => c.id === r.nextClassId)?.name || '—' },
    { header: 'Class Teacher', cell: (r) => r.teacherName || '—' },
    { header: 'Sections', cell: (r) => (r.sections || []).map((s: any) => s.name).join(', ') || '—' },
    { header: 'Students', cell: (r) => r.studentCount ?? 0 },
    {
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>Edit</Button>
          <Button variant="destructive" size="sm" onClick={() => remove(r)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Classes" subtitle="Manage classes, sections & yearly promotion">
        <Button variant="outline" onClick={openPromote}>Update Class (Promote)</Button>
        <Button onClick={openAdd}>+ Add Class</Button>
      </PageHeader>

      {loading ? (
        <Loading />
      ) : classes.length === 0 ? (
        <EmptyState title="No classes" message="Create your first class to get started." />
      ) : (
        <DataTable columns={columns} rows={classes} />
      )}

      {/* add / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? 'Edit Class' : 'Add Class'}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !name}>{saving ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 10 / U.K.G." />
              </Field>
              <Field>
                <Label>Order</Label>
                <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="P.G.=1 … 10=14" />
              </Field>
            </div>
            <p className="-mt-2 text-xs text-slate-400">Order sets the promotion sequence — students in this class promote to the next-higher order.</p>
            <Field>
              <Label>Capacity</Label>
              <Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 40" />
            </Field>
            <Field>
              <Label>Class Teacher</Label>
              <Select value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)}>
                <option value="">None</option>
                {(teachers || []).map((t) => <option key={t.id} value={String(t.id)}>{t.name}</option>)}
              </Select>
            </Field>
            {!editing && (
              <Field>
                <Label>Sections</Label>
                <Input value={sections} onChange={(e) => setSections(e.target.value)} placeholder="Comma-separated, e.g. A, B, C" />
              </Field>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* promote */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent
          className="max-w-2xl"
          title="Update Class · Promote Students"
          footer={
            <>
              <Button variant="secondary" onClick={() => setPromoteOpen(false)}>Cancel</Button>
              <Button onClick={doPromote} disabled={promoting || checkedCount === 0}>
                {promoting ? 'Promoting…' : `Promote ${checkedCount} student${checkedCount === 1 ? '' : 's'}`}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field>
              <Label>Class to promote from</Label>
              <Select value={srcId} onChange={(e) => loadStudents(e.target.value)}>
                <option value="">Select a class…</option>
                {classes.map((c) => <option key={c.id} value={String(c.id)}>{c.name} ({c.studentCount ?? 0})</option>)}
              </Select>
            </Field>

            {srcClass && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Default target: <b>{classes.find((c) => c.id === srcClass.nextClassId)?.name || '— (last class, pick per student)'}</b>.
                Untick anyone staying back; change a student's target to promote across multiple classes.
              </div>
            )}

            {srcId && pStudents.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No active students in this class.</div>}

            {pStudents.length > 0 && (
              <div className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 font-medium text-slate-600">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="size-4 accent-[#262081]" />
                    Select all ({checkedCount}/{pStudents.length})
                  </label>
                  <span className="text-xs text-slate-400">Target class</span>
                </div>
                <div className="max-h-[45vh] overflow-y-auto">
                  {pStudents.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 border-b border-slate-50 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!checked[s.id]}
                        onChange={(e) => setChecked({ ...checked, [s.id]: e.target.checked })}
                        className="size-4 accent-[#262081]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                        <div className="text-xs text-slate-400">IEMIS {s.iemis || '—'}</div>
                      </div>
                      <Select
                        value={targets[s.id] || ''}
                        onChange={(e) => setTargets({ ...targets, [s.id]: e.target.value })}
                        className="w-40"
                      >
                        <option value="">— keep —</option>
                        {classes.filter((c) => String(c.id) !== srcId).map((c) => (
                          <option key={c.id} value={String(c.id)}>{c.name}</option>
                        ))}
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
