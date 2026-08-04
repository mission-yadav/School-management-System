import { useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

type ReportDef = {
  key: string;
  title: string;
  description: string;
  path: string;
  file: string;
};

const REPORTS: ReportDef[] = [
  {
    key: 'students',
    title: 'Student Report',
    description: 'Full roster of enrolled students with class and contact details.',
    path: '/reports/students',
    file: 'students.csv',
  },
  {
    key: 'fees',
    title: 'Fee Report',
    description: 'Fee collection, dues, and payment status across students.',
    path: '/reports/fees',
    file: 'fees.csv',
  },
  {
    key: 'attendance',
    title: 'Attendance Report',
    description: 'Attendance summary by class and month.',
    path: '/reports/attendance',
    file: 'attendance.csv',
  },
  {
    key: 'payroll',
    title: 'Payroll Report',
    description: 'Staff salary and payroll disbursement details.',
    path: '/reports/payroll',
    file: 'payroll.csv',
  },
  {
    key: 'expenses',
    title: 'Expense Report',
    description: 'School expenses categorised by month.',
    path: '/reports/expenses',
    file: 'expenses.csv',
  },
  {
    key: 'admissions',
    title: 'Admission Report',
    description: 'New admissions and enquiry pipeline.',
    path: '/reports/admissions',
    file: 'admissions.csv',
  },
];

export default function Reports() {
  const { toast } = useToast();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const active = REPORTS.find((r) => r.key === activeKey) || null;

  async function view(report: ReportDef) {
    setActiveKey(report.key);
    setLoading(true);
    setRows([]);
    try {
      const { data } = await api.get(report.path);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      toast({ title: 'Failed to load report', description: apiError(e), variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv(report: ReportDef) {
    const sep = report.path.includes('?') ? '&' : '?';
    try {
      await downloadFile(`${report.path}${sep}format=csv`, report.file);
    } catch (e) {
      toast({ title: 'Export failed', description: apiError(e), variant: 'destructive' });
    }
  }

  const columns: Column<any>[] =
    rows.length > 0
      ? Object.keys(rows[0]).map((k) => ({
          key: k,
          header: k,
          render: (row: any) => {
            const v = row[k];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
          },
        }))
      : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" subtitle="Generate and export school reports" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <Card key={report.key}>
            <CardHeader>
              <CardTitle>{report.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{report.description}</p>
              <div className="flex gap-2">
                <Button
                  variant={activeKey === report.key ? 'default' : 'outline'}
                  onClick={() => view(report)}
                >
                  View
                </Button>
                <Button variant="outline" onClick={() => exportCsv(report)}>
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{active ? active.title : 'Report Preview'}</CardTitle>
        </CardHeader>
        <CardContent>
          {!active ? (
            <EmptyState
              title="No report selected"
              description="Click “View” on any report above to preview its data here."
            />
          ) : loading ? (
            <Loading />
          ) : rows.length === 0 ? (
            <EmptyState title="No data" description="This report returned no rows." />
          ) : (
            <DataTable columns={columns} data={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
