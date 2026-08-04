import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export default function Staff() {
  const { data, loading, refetch } = useFetch<any[]>('/staff');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', designation: '', email: '', phone: '', baseSalary: 0 });

  function openNew() { setEditing(null); setForm({ name: '', designation: '', email: '', phone: '', baseSalary: 0 }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ name: r.name, designation: r.designation || '', email: r.email || '', phone: r.phone || '', baseSalary: r.baseSalary || 0 }); setOpen(true); }
  async function save() {
    try {
      const payload = { ...form, baseSalary: Number(form.baseSalary) };
      if (editing) await api.put(`/staff/${editing.id}`, payload);
      else await api.post('/staff', payload);
      toast('Saved'); setOpen(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/staff/${id}`); toast('Deleted'); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'name', header: 'Name' },
    { key: 'designation', header: 'Designation', render: (r) => r.designation || '—' },
    { key: 'email', header: 'Email', render: (r) => r.email || '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    { key: 'baseSalary', header: 'Base Salary', render: (r) => inr(r.baseSalary || 0) },
    { key: 'a', header: '', render: (r) => (<div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button></div>) },
  ];
  if (loading) return <Loading />;
  return (<div>
    <PageHeader title="Staff" subtitle="Manage non-teaching staff" actions={<Button onClick={openNew}>+ Add Staff</Button>} />
    <DataTable columns={columns} rows={data || []} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={editing ? 'Edit Staff' : 'Add Staff'} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Designation"><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Base Salary"><Input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
