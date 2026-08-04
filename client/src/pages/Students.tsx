import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { Link } from 'react-router-dom';
import { SearchModeToggle, searchPlaceholder, type SearchMode } from '@/components/SearchModeToggle';

export default function Students() {
  const toast = useToast();
  const [classId, setClassId] = useState('');
  const [q, setQ] = useState('');
  const [searchBy, setSearchBy] = useState<SearchMode>('name');
  const params = new URLSearchParams();
  if (classId) params.set('classId', classId);
  if (q) { params.set('q', q); params.set('by', searchBy); }
  const qs = params.toString();
  const url = `/students${qs ? `?${qs}` : ''}`;
  const { data, loading, refetch } = useFetch<any[]>(url, [classId, q, searchBy]);
  const { data: classes } = useFetch<any[]>('/classes');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: '', admissionNo: '', iemis: '', rollNo: '', gender: 'MALE', dob: '', bloodGroup: '',
    phone: '', email: '', address: '', classId: '', sectionId: '',
    parentName: '', parentPhone: '', allergies: '', disabilities: '',
  });

  const sections = (classes || []).find((c: any) => String(c.id) === String(form.classId))?.sections || [];

  function openNew() {
    setForm({
      name: '', admissionNo: '', iemis: '', rollNo: '', gender: 'MALE', dob: '', bloodGroup: '',
      phone: '', email: '', address: '', classId: '', sectionId: '',
      parentName: '', parentPhone: '', allergies: '', disabilities: '',
    });
    setOpen(true);
  }
  async function save() {
    try {
      const payload = {
        ...form,
        classId: form.classId ? Number(form.classId) : undefined,
        sectionId: form.sectionId ? Number(form.sectionId) : undefined,
      };
      await api.post('/students', payload);
      toast('Student admitted'); setOpen(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/students/${id}`); toast('Deleted'); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }
  async function setStatus(id: number, status: string) {
    try { await api.post(`/students/${id}/status`, { status }); toast(`Marked ${status}`); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'rollNo', header: 'Roll', render: (r) => r.rollNo || '—' },
    { key: 'name', header: 'Name', render: (r) => <Link className="text-blue-600 hover:underline" to={`/students/${r.id}`}>{r.name}</Link> },
    { key: 'iemis', header: 'IEMIS ID', render: (r) => r.iemis || '—' },
    { key: 'class', header: 'Class', render: (r) => [r.className, r.sectionName].filter(Boolean).join(' ') || '—' },
    { key: 'gender', header: 'Gender', render: (r) => r.gender || '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
    {
      key: 'a', header: '', render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'SUSPENDED')}>Suspend</Button>
          <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'ALUMNI')}>Alumni</Button>
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (<div>
    <PageHeader title="Students" subtitle="Manage student records" actions={<Button onClick={openNew}>+ Admit Student</Button>} />
    <div className="flex gap-3 mb-4">
      <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-48">
        <option value="">All Classes</option>
        {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <SearchModeToggle value={searchBy} onChange={setSearchBy} />
      <Input placeholder={searchPlaceholder(searchBy)} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" inputMode={searchBy === 'iemis' ? 'numeric' : 'text'} />
    </div>
    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Admit Student" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="IEMIS ID"><Input value={form.iemis} onChange={(e) => setForm({ ...form, iemis: e.target.value })} /></Field>
          <Field label="Class">
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, sectionId: '' })}>
              <option value="">Select class</option>
              {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Section">
            <Select value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
              <option value="">Select section</option>
              {sections.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Roll No"><Input value={form.rollNo} onChange={(e) => setForm({ ...form, rollNo: e.target.value })} /></Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
          <Field label="Blood Group"><Input value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="col-span-2">
            <Field label="Address"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </div>
          <Field label="Guardian Name"><Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></Field>
          <Field label="Guardian Phone"><Input value={form.parentPhone} onChange={(e) => setForm({ ...form, parentPhone: e.target.value })} /></Field>
          <div className="col-span-2 mt-2 text-sm font-medium text-gray-500">Medical</div>
          <Field label="Allergies"><Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></Field>
          <Field label="Disabilities"><Input value={form.disabilities} onChange={(e) => setForm({ ...form, disabilities: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
