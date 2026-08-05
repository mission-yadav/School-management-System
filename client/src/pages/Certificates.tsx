import { useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { SearchModeToggle, searchPlaceholder, type SearchMode } from '@/components/SearchModeToggle';

const TYPES = [
  { value: 'BONAFIDE', label: 'Bonafide' },
  { value: 'CHARACTER', label: 'Character' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'STUDY', label: 'Study' },
  { value: 'ID_CARD', label: 'ID Card' },
];

function typeLabel(t: string) {
  return TYPES.find((x) => x.value === t)?.label ?? t;
}

export default function Certificates() {
  const toast = useToast();
  const students = useFetch<any[]>('/students');
  const certificates = useFetch<any[]>('/certificates');
  const classes = useFetch<any[]>('/classes');

  const [studentId, setStudentId] = useState('');
  const [type, setType] = useState('BONAFIDE');
  const [issuing, setIssuing] = useState(false);

  // student picker filters
  const [pickClass, setPickClass] = useState('');
  const [stuBy, setStuBy] = useState<SearchMode>('name');
  const [stuSearch, setStuSearch] = useState('');
  const filteredStudents = (students.data || []).filter((s: any) => {
    if (pickClass && String(s.classId) !== String(pickClass)) return false;
    const term = stuSearch.trim().toLowerCase();
    if (!term) return true;
    return stuBy === 'iemis'
      ? String(s.iemis || '').toLowerCase().includes(term)
      : String(s.name || '').toLowerCase().includes(term);
  });

  async function issue() {
    if (!studentId) {
      toast.error('Select a student');
      return;
    }
    setIssuing(true);
    try {
      const res = await api.post('/certificates', { studentId: Number(studentId), type });
      toast.success('Certificate issued');
      certificates.refetch();
      const created = res.data;
      if (created?.id) {
        downloadFile(`/pdf/certificate/${created.id}`, `${created.serialNo}.pdf`);
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setIssuing(false);
    }
  }

  async function deleteCertificate(id: number | string) {
    if (!confirm('Delete this certificate?')) return;
    try {
      await api.delete(`/certificates/${id}`);
      toast.success('Certificate deleted');
      certificates.refetch();
    } catch (e) {
      toast.error(apiError(e));
    }
  }

  const columns: Column<any>[] = [
    { header: 'Serial No', accessor: (r) => r.serialNo },
    { header: 'Student', accessor: (r) => r.studentName },
    { header: 'IEMIS ID', accessor: (r) => r.iemis || '—' },
    { header: 'Type', accessor: (r) => <Badge variant={statusVariant(r.type)}>{typeLabel(r.type)}</Badge> },
    { header: 'Issued', accessor: (r) => new Date(r.issuedAt).toLocaleDateString() },
    {
      header: '',
      accessor: (r) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadFile(`/pdf/certificate/${r.id}`, `${r.serialNo}.pdf`)}
          >
            Download PDF
          </Button>
          <Button size="sm" variant="destructive" onClick={() => deleteCertificate(r.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Certificates" subtitle="Issue and manage student certificates" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Issue Certificate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Student">
              <div className="space-y-2">
                <Select value={pickClass} onChange={(e) => setPickClass(e.target.value)}>
                  <option value="">All classes</option>
                  {(classes.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <div className="flex items-center gap-2">
                  <SearchModeToggle value={stuBy} onChange={setStuBy} />
                  <Input
                    className="flex-1"
                    placeholder={searchPlaceholder(stuBy)}
                    value={stuSearch}
                    onChange={(e) => setStuSearch(e.target.value)}
                    inputMode={stuBy === 'iemis' ? 'numeric' : 'text'}
                  />
                </div>
                <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  <option value="">{`Select student (${filteredStudents.length})`}</option>
                  {filteredStudents.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} · IEMIS {s.iemis || '—'} · {s.className || '—'}</option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={issue} disabled={issuing || !studentId}>
              {issuing ? 'Issuing…' : 'Issue'}
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Issued Certificates</CardTitle>
          </CardHeader>
          <CardContent>
            {certificates.loading ? (
              <Loading />
            ) : (certificates.data?.length ?? 0) === 0 ? (
              <EmptyState title="No certificates issued yet" />
            ) : (
              <DataTable columns={columns} data={certificates.data || []} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
