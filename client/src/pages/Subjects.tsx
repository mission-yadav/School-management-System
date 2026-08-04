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

export default function Subjects() {
  const [filterClassId, setFilterClassId] = useState('');
  const { data: classes } = useFetch<any[]>('/classes');
  const { data: teachers } = useFetch<any[]>('/teachers');
  const subjectsUrl = filterClassId ? `/subjects?classId=${filterClassId}` : '/subjects';
  const { data, loading, refetch } = useFetch<any[]>(subjectsUrl);
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [credits, setCredits] = useState('');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');

  function openAdd() {
    setEditing(null);
    setName('');
    setCode('');
    setCredits('');
    setClassId(filterClassId || '');
    setTeacherId('');
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setName(row.name || '');
    setCode(row.code || '');
    setCredits(row.credits != null ? String(row.credits) : '');
    setClassId(row.classId != null ? String(row.classId) : '');
    setTeacherId(row.teacherId != null ? String(row.teacherId) : '');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name,
        code,
        credits: credits ? Number(credits) : null,
        classId: classId ? Number(classId) : null,
        teacherId: teacherId ? Number(teacherId) : null,
      };
      if (editing) {
        await api.put(`/subjects/${editing.id}`, payload);
        toast('Subject updated');
      } else {
        await api.post('/subjects', payload);
        toast('Subject created');
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
    if (!confirm(`Delete subject "${row.name}"?`)) return;
    try {
      await api.delete(`/subjects/${row.id}`);
      toast('Subject deleted');
      refetch();
    } catch (e) {
      toast(apiError(e), 'error');
    }
  }

  const columns: Column<any>[] = [
    { header: 'Subject', cell: (r) => r.name },
    { header: 'Code', cell: (r) => r.code || '—' },
    { header: 'Credits', cell: (r) => r.credits ?? '—' },
    { header: 'Class', cell: (r) => r.className || '—' },
    { header: 'Teacher', cell: (r) => r.teacherName || '—' },
    {
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => remove(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Subjects" subtitle="Manage subjects across classes">
        <Button onClick={openAdd}>+ Add Subject</Button>
      </PageHeader>

      <div className="mb-4 max-w-xs">
        <Field>
          <Label>Filter by Class</Label>
          <Select value={filterClassId} onChange={(e) => setFilterClassId(e.target.value)}>
            <option value="">All Classes</option>
            {(classes || []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loading ? (
        <Loading />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No subjects" message="Add a subject to get started." />
      ) : (
        <DataTable columns={columns} rows={data} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? 'Edit Subject' : 'Add Subject'}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !name}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mathematics" />
            </Field>
            <Field>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. MATH101" />
            </Field>
            <Field>
              <Label>Credits</Label>
              <Input type="number" value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 4" />
            </Field>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
