import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr, formatDate } from '@/lib/utils';
import { Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useParams, useNavigate } from 'react-router-dom';

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm">{value || '—'}</div>
    </div>
  );
}

export default function StudentProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: s, loading, error } = useFetch<any>(id ? `/students/${id}` : null, [id]);

  if (loading) return <Loading />;
  if (error || !s) return <div className="text-red-600">{error ? apiError(error) : 'Student not found'}</div>;

  const invoiceCols: Column<any>[] = [
    { key: 'title', header: 'Title' },
    { key: 'total', header: 'Total', render: (r) => inr(r.total || 0) },
    { key: 'paid', header: 'Paid', render: (r) => inr(r.paid || 0) },
    { key: 'due', header: 'Due', render: (r) => inr(r.due || 0) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
  ];

  const resultCols: Column<any>[] = [
    { key: 'exam', header: 'Exam', render: (r) => r.exam?.name || '—' },
    { key: 'subject', header: 'Subject', render: (r) => r.subject?.name || '—' },
    { key: 'marks', header: 'Marks', render: (r) => `${r.marks ?? '—'} / ${r.maxMarks ?? '—'}` },
  ];

  const className = [s.class?.name, s.section?.name].filter(Boolean).join(' ');

  return (<div>
    <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">← Back</Button>

    <Card className="mb-6">
      <CardContent className="flex items-center gap-4 py-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-2xl font-semibold text-blue-700">
          {(s.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">{s.name}</h2>
            <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
          </div>
          <div className="text-sm text-gray-500">
            IEMIS ID: {s.iemis || '—'}
            {className && <> · {className}</>}
          </div>
        </div>
      </CardContent>
    </Card>

    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="fees">Fees</TabsTrigger>
        <TabsTrigger value="results">Results</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <Card>
          <CardContent className="py-6 space-y-6">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-500">Personal</div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Row label="IEMIS ID" value={s.iemis} />
                <Row label="Roll No" value={s.rollNo} />
                <Row label="Gender" value={s.gender} />
                <Row label="Date of Birth" value={s.dob ? formatDate(s.dob) : '—'} />
                <Row label="Blood Group" value={s.bloodGroup} />
                <Row label="Phone" value={s.phone} />
                <Row label="Email" value={s.email} />
                <Row label="Address" value={s.address} />
                <Row label="Previous School" value={s.previousSchool} />
                <Row label="House" value={s.house} />
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-500">Medical</div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Row label="Allergies" value={s.allergies} />
                <Row label="Disabilities" value={s.disabilities} />
                <Row label="Medical History" value={s.medicalHistory} />
                <Row label="Vaccination" value={s.vaccination} />
                <Row label="Emergency Contact" value={s.emergencyContact} />
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-gray-500">Parent / Guardian</div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Row label="Name" value={s.parent?.name} />
                <Row label="Phone" value={s.parent?.phone} />
                <Row label="Email" value={s.parent?.email} />
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="fees">
        <DataTable columns={invoiceCols} rows={s.invoices || []} />
      </TabsContent>

      <TabsContent value="results">
        <DataTable columns={resultCols} rows={s.results || []} />
      </TabsContent>
    </Tabs>
  </div>);
}
