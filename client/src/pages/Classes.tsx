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

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [classTeacherId, setClassTeacherId] = useState('');
  const [sections, setSections] = useState('');

  function openAdd() {
    setEditing(null);
    setName('');
    setCapacity('');
    setClassTeacherId('');
    setSections('');
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    setName(row.name || '');
    setCapacity(row.capacity != null ? String(row.capacity) : '');
    setClassTeacherId(row.classTeacherId != null ? String(row.classTeacherId) : '');
    setSections('');
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/classes/${editing.id}`, {
          name,
          capacity: capacity ? Number(capacity) : null,
          classTeacherId: classTeacherId ? Number(classTeacherId) : null,
        });
        toast('Class updated');
      } else {
        const sectionList = sections
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean)
          .map((n) => ({ name: n }));
        await api.post('/classes', {
          name,
          capacity: capacity ? Number(capacity) : null,
          classTeacherId: classTeacherId ? Number(classTeacherId) : null,
          sections: sectionList,
        });
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

  const columns: Column<any>[] = [
    { header: 'Class', cell: (r) => r.name },
    { header: 'Class Teacher', cell: (r) => r.teacherName || '—' },
    { header: 'Sections', cell: (r) => (r.sections || []).map((s: any) => s.name).join(', ') || '—' },
    { header: 'Students', cell: (r) => r.studentCount ?? 0 },
    { header: 'Subjects', cell: (r) => r.subjectCount ?? 0 },
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
      <PageHeader title="Classes" subtitle="Manage classes and sections">
        <Button onClick={openAdd}>+ Add Class</Button>
      </PageHeader>

      {loading ? (
        <Loading />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No classes" message="Create your first class to get started." />
      ) : (
        <DataTable columns={columns} rows={data} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? 'Edit Class' : 'Add Class'}
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
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 10" />
            </Field>
            <Field>
              <Label>Capacity</Label>
              <Input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 40"
              />
            </Field>
            <Field>
              <Label>Class Teacher</Label>
              <Select value={classTeacherId} onChange={(e) => setClassTeacherId(e.target.value)}>
                <option value="">None</option>
                {(teachers || []).map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            {!editing && (
              <Field>
                <Label>Sections</Label>
                <Input
                  value={sections}
                  onChange={(e) => setSections(e.target.value)}
                  placeholder="Comma-separated, e.g. A, B, C"
                />
              </Field>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
