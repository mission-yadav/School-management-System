import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { SearchModeToggle, searchPlaceholder, type SearchMode } from '@/components/SearchModeToggle';
import { StudentFormDialog } from '@/components/StudentFormDialog';

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

  const [dialog, setDialog] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });

  async function remove(id: number) {
    if (!confirm('Delete?')) return;
    try { await api.delete(`/students/${id}`); toast('Deleted'); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }
  async function setStatus(id: number, status: string) {
    try { await api.post(`/students/${id}/status`, { status }); toast(`Marked ${status}`); refetch(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'edit', header: '', className: 'w-10', render: (r) => (
      <Button size="icon" variant="ghost" className="h-8 w-8 text-brand" title="Edit student" onClick={() => setDialog({ open: true, id: r.id })}><Pencil className="size-4" /></Button>
    ) },
    { key: 'rollNo', header: 'Roll', render: (r) => r.rollNo || '—' },
    { key: 'name', header: 'Name', render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.feeFree && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">FREE</span>}
        <Link className="text-blue-600 hover:underline" to={`/students/${r.id}`}>{r.name}</Link>
      </span>
    ) },
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
    <PageHeader title="Students" subtitle="Manage student records" actions={<Button onClick={() => setDialog({ open: true, id: null })}>+ Admit Student</Button>} />
    <div className="flex gap-3 mb-4">
      <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-48">
        <option value="">All Classes</option>
        {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <SearchModeToggle value={searchBy} onChange={setSearchBy} />
      <Input placeholder={searchPlaceholder(searchBy)} value={q} onChange={(e) => setQ(e.target.value)} className="w-64" inputMode={searchBy === 'iemis' ? 'numeric' : 'text'} />
    </div>
    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    <StudentFormDialog open={dialog.open} studentId={dialog.id} onClose={() => setDialog({ open: false, id: null })} onSaved={refetch} />
  </div>);
}
