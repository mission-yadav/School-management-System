import { useEffect, useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { DataTable, type Column } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

export default function Settings() {
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Configure your school system" />

      <Tabs defaultValue="school">
        <TabsList>
          <TabsTrigger value="school">School Info</TabsTrigger>
          <TabsTrigger value="grades">Grading System</TabsTrigger>
          <TabsTrigger value="fees">Fee Categories</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="school">
          <SchoolInfoTab toast={toast} />
        </TabsContent>
        <TabsContent value="grades">
          <GradesTab toast={toast} />
        </TabsContent>
        <TabsContent value="fees">
          <FeeCategoriesTab toast={toast} />
        </TabsContent>
        <TabsContent value="backup">
          <BackupTab toast={toast} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ToastFn = ReturnType<typeof useToast>['toast'];

function SchoolInfoTab({ toast }: { toast: ToastFn }) {
  const { data, loading } = useFetch<any>('/settings');
  const [form, setForm] = useState<any>({
    schoolName: '',
    address: '',
    phone: '',
    email: '',
    session: '',
    logoUrl: '',
    theme: '#4f46e5',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setForm((prev: any) => ({ ...prev, ...data }));
    }
  }, [data]);

  function set(key: string, value: string) {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.put('/settings', form);
      toast({ title: 'Settings saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: apiError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>School Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School Name">
            <Input value={form.schoolName || ''} onChange={(e) => set('schoolName', e.target.value)} />
          </Field>
          <Field label="Session">
            <Input value={form.session || ''} onChange={(e) => set('session', e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <Input value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Address">
            <Input value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
          <Field label="Logo URL">
            <Input value={form.logoUrl || ''} onChange={(e) => set('logoUrl', e.target.value)} />
          </Field>
          <Field label="Theme Color">
            <Input type="color" value={form.theme || '#4f46e5'} onChange={(e) => set('theme', e.target.value)} />
          </Field>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  );
}

function GradesTab({ toast }: { toast: ToastFn }) {
  const { data, loading } = useFetch<any[]>('/settings/grades');
  const [grades, setGrades] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setGrades(data.map((g: any) => ({ ...g })));
  }, [data]);

  function update(i: number, key: string, value: string) {
    setGrades((prev) => prev.map((g, idx) => (idx === i ? { ...g, [key]: value } : g)));
  }

  function addRow() {
    setGrades((prev) => [...prev, { grade: '', minPercent: '', maxPercent: '', gpa: '' }]);
  }

  function removeRow(i: number) {
    setGrades((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = grades.map((g) => ({
        grade: g.grade,
        minPercent: Number(g.minPercent),
        maxPercent: Number(g.maxPercent),
        gpa: Number(g.gpa),
      }));
      await api.put('/settings/grades', { grades: payload });
      toast({ title: 'Grading system saved' });
    } catch (err) {
      toast({ title: 'Failed to save', description: apiError(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grading System</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="p-2">Grade</th>
                <th className="p-2">Min %</th>
                <th className="p-2">Max %</th>
                <th className="p-2">GPA</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g, i) => (
                <tr key={i}>
                  <td className="p-2">
                    <Input value={g.grade ?? ''} onChange={(e) => update(i, 'grade', e.target.value)} />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={g.minPercent ?? ''}
                      onChange={(e) => update(i, 'minPercent', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={g.maxPercent ?? ''}
                      onChange={(e) => update(i, 'maxPercent', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={g.gpa ?? ''}
                      onChange={(e) => update(i, 'gpa', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <Button variant="destructive" onClick={() => removeRow(i)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow}>
            + Add Row
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FeeCategoriesTab({ toast }: { toast: ToastFn }) {
  const { data, loading, refetch } = useFetch<any[]>('/settings/fee-categories');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const categories = data || [];

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.post('/settings/fee-categories', { name });
      toast({ title: 'Category added' });
      setName('');
      refetch();
    } catch (err) {
      toast({ title: 'Failed to add', description: apiError(err), variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: any) {
    try {
      await api.delete(`/settings/fee-categories/${id}`);
      toast({ title: 'Category removed' });
      refetch();
    } catch (err) {
      toast({ title: 'Failed to remove', description: apiError(err), variant: 'destructive' });
    }
  }

  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', render: (r: any) => r.name },
    {
      key: 'actions',
      header: '',
      render: (r: any) => (
        <Button variant="destructive" onClick={() => remove(r.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee Categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
          <Button onClick={add} disabled={adding}>
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
        {loading ? <Loading /> : <DataTable columns={columns} data={categories} />}
      </CardContent>
    </Card>
  );
}

function BackupTab({ toast }: { toast: ToastFn }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      await downloadFile('/settings/backup', 'backup.json');
    } catch (err) {
      toast({ title: 'Backup failed', description: apiError(err), variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download a full JSON snapshot of your school data including students, staff, fees, and
          settings. Keep this file safe — it can be used to restore your system.
        </p>
        <Button onClick={download} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download Backup'}
        </Button>
      </CardContent>
    </Card>
  );
}
