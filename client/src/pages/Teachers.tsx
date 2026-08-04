import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export default function Teachers() {
  const { data, loading, refetch } = useFetch<any[]>('/teachers');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', email: '', password: '', phone: '' });

  function openNew() { setEditing(null); setForm({ name: '', email: '', password: '', phone: '' }); setOpen(true); }
  function openEdit(r: any) { setEditing(r); setForm({ name: r.name, email: r.email, phone: r.phone || '', password: '' }); setOpen(true); }
  async function save() {
    try {
      if (editing) await api.put(`/teachers/${editing.id}`, form);
      else await api.post('/teachers', form);
      toast('Saved'); setOpen(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/teachers/${id}`); toast('Deleted'); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    { key: 'a', header: '', render: (r) => (<div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button><Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button></div>) },
  ];
  if (loading) return <Loading />;
  return (<div>
    <PageHeader title="Teachers" subtitle="Manage teacher accounts" actions={<Button onClick={openNew}>+ Add Teacher</Button>} />
    <DataTable columns={columns} rows={data || []} />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title={editing ? 'Edit Teacher' : 'Add Teacher'} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={editing ? 'Reset password (blank=keep)' : 'Password'}><Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
