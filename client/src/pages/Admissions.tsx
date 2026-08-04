import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { formatDate } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export default function Admissions() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const url = `/admissions${status ? `?status=${status}` : ''}`;
  const { data, loading, refetch } = useFetch<any[]>(url, [status]);
  const { data: stats, refetch: refetchStats } = useFetch<any>('/admissions/stats/summary');
  const { data: classes } = useFetch<any[]>('/classes');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ applicantName: '', appliedClass: '', parentName: '', phone: '', email: '', dob: '', gender: 'MALE', previousSchool: '' });

  const [enrollFor, setEnrollFor] = useState<any>(null);
  const [enrollClassId, setEnrollClassId] = useState('');

  function reload() { refetch(); refetchStats(); }

  function openNew() {
    setForm({ applicantName: '', appliedClass: '', parentName: '', phone: '', email: '', dob: '', gender: 'MALE', previousSchool: '' });
    setOpen(true);
  }
  async function save() {
    try { await api.post('/admissions', form); toast('Application created'); setOpen(false); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }
  async function approve(id: number) {
    try { await api.post(`/admissions/${id}/approve`); toast('Approved'); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }
  async function updateStatus(id: number, st: string) {
    try { await api.put(`/admissions/${id}`, { status: st }); toast(`Marked ${st}`); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/admissions/${id}`); toast('Deleted'); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }
  function openEnroll(r: any) { setEnrollFor(r); setEnrollClassId(''); }
  async function doEnroll() {
    if (!enrollFor) return;
    try {
      const res = await api.post(`/admissions/${enrollFor.id}/enroll`, { classId: enrollClassId ? Number(enrollClassId) : undefined });
      toast(`Enrolled — student #${res.data?.studentId ?? ''}`);
      setEnrollFor(null); reload();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  const cards = [
    { label: 'Pending', key: 'PENDING' },
    { label: 'Approved', key: 'APPROVED' },
    { label: 'Waitlist', key: 'WAITLIST' },
    { label: 'Rejected', key: 'REJECTED' },
    { label: 'Enrolled', key: 'ENROLLED' },
  ];

  const columns: Column<any>[] = [
    { key: 'applicantName', header: 'Applicant' },
    { key: 'appliedClass', header: 'Applied Class', render: (r) => r.appliedClass || '—' },
    { key: 'parentName', header: 'Parent', render: (r) => r.parentName || '—' },
    { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
    { key: 'entranceScore', header: 'Entrance', render: (r) => r.entranceScore ?? '—' },
    { key: 'documentsVerified', header: 'Docs', render: (r) => r.documentsVerified ? '✓' : '✗' },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
    {
      key: 'a', header: '', render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => approve(r.id)}>Approve</Button>}
          {r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'WAITLIST')}>Waitlist</Button>}
          {r.status === 'PENDING' && <Button size="sm" variant="ghost" onClick={() => updateStatus(r.id, 'REJECTED')}>Reject</Button>}
          {(r.status === 'APPROVED' || r.status === 'WAITLIST') && <Button size="sm" variant="ghost" onClick={() => openEnroll(r)}>Enroll</Button>}
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (<div>
    <PageHeader title="Admissions" subtitle="Manage applications" actions={<Button onClick={openNew}>+ New Application</Button>} />

    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{stats?.[c.key] ?? 0}</div>
            <div className="text-sm text-gray-500">{c.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>

    <div className="mb-4">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
        <option value="">All Statuses</option>
        <option value="PENDING">Pending</option>
        <option value="APPROVED">Approved</option>
        <option value="WAITLIST">Waitlist</option>
        <option value="REJECTED">Rejected</option>
        <option value="ENROLLED">Enrolled</option>
      </Select>
    </div>

    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="New Application" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Applicant Name"><Input value={form.applicantName} onChange={(e) => setForm({ ...form, applicantName: e.target.value })} /></Field>
          <Field label="Applied Class"><Input value={form.appliedClass} onChange={(e) => setForm({ ...form, appliedClass: e.target.value })} /></Field>
          <Field label="Parent Name"><Input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></Field>
          <Field label="Gender">
            <Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="Previous School"><Input value={form.previousSchool} onChange={(e) => setForm({ ...form, previousSchool: e.target.value })} /></Field>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!enrollFor} onOpenChange={(v) => { if (!v) setEnrollFor(null); }}>
      <DialogContent title="Enroll Applicant" footer={<><Button variant="secondary" onClick={() => setEnrollFor(null)}>Cancel</Button><Button onClick={doEnroll}>Enroll</Button></>}>
        <div className="space-y-3">
          <div className="text-sm text-gray-500">{enrollFor?.applicantName} · applied {formatDate(enrollFor?.createdAt)}</div>
          <Field label="Assign Class">
            <Select value={enrollClassId} onChange={(e) => setEnrollClassId(e.target.value)}>
              <option value="">Select class</option>
              {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
