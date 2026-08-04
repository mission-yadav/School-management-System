import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

const num = (v: any) => (v ? Number(v) : 0);

export default function Payroll() {
  const toast = useToast();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data, loading, refetch } = useFetch<any[]>(`/payroll?month=${month}`, [month]);
  const { data: summary } = useFetch<any>(`/payroll/summary?month=${month}`, [month]);
  const { data: employees } = useFetch<any[]>('/payroll/employees');

  const [open, setOpen] = useState(false);
  const [emp, setEmp] = useState('');
  const [form, setForm] = useState<any>({ employeeName: '', basic: '', bonus: '', pf: '', tax: '', deductions: '' });

  function startNew() {
    setEmp('');
    setForm({ employeeName: '', basic: '', bonus: '', pf: '', tax: '', deductions: '' });
    setOpen(true);
  }
  function chooseEmployee(value: string) {
    setEmp(value);
    const [type, refId] = value.split(':');
    const found = (employees || []).find((e: any) => e.type === type && String(e.refId) === refId);
    if (found) setForm((f: any) => ({ ...f, employeeName: found.name, basic: String(found.baseSalary ?? '') }));
  }

  const netPreview = num(form.basic) + num(form.bonus) - num(form.pf) - num(form.tax) - num(form.deductions);

  async function generate() {
    if (!emp) { toast('Select an employee', 'error'); return; }
    const [employeeType, refId] = emp.split(':');
    try {
      await api.post('/payroll', {
        employeeType,
        refId: Number(refId),
        employeeName: form.employeeName,
        month,
        basic: num(form.basic),
        bonus: num(form.bonus),
        pf: num(form.pf),
        tax: num(form.tax),
        deductions: num(form.deductions),
      });
      toast('Payslip generated'); setOpen(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete payslip?')) return;
    try { await api.delete(`/payroll/${id}`); toast('Deleted'); refetch(); }
    catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'employeeName', header: 'Employee', render: (r) => r.employeeName },
    { key: 'employeeType', header: 'Type', render: (r) => r.employeeType },
    { key: 'basic', header: 'Basic', render: (r) => inr(r.basic) },
    { key: 'bonus', header: 'Bonus', render: (r) => inr(r.bonus) },
    { key: 'pf', header: 'PF', render: (r) => inr(r.pf) },
    { key: 'tax', header: 'Tax', render: (r) => inr(r.tax) },
    { key: 'netPay', header: 'Net Pay', render: (r) => inr(r.netPay) },
    {
      key: 'a', header: '', render: (r) => (
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
      ),
    },
  ];

  return (<div>
    <PageHeader title="Payroll" subtitle="Generate & manage payslips" actions={<Button onClick={startNew}>Generate Payslip</Button>} />

    <div className="mb-4">
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
    </div>

    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Employees Paid</div>
        <div className="text-2xl font-bold text-slate-800">{summary?.count ?? 0}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Total Net</div>
        <div className="text-2xl font-bold text-green-600">{inr(summary?.totalNet || 0)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Total Basic</div>
        <div className="text-2xl font-bold text-slate-800">{inr(summary?.totalBasic || 0)}</div>
      </CardContent></Card>
    </div>

    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Generate Payslip" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={generate}>Generate</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Employee">
              <Select value={emp} onChange={(e) => chooseEmployee(e.target.value)}>
                <option value="">Select employee</option>
                {(employees || []).map((e: any) => (
                  <option key={`${e.type}:${e.refId}`} value={`${e.type}:${e.refId}`}>{e.name} ({e.type})</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Employee Name"><Input value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} /></Field>
          <Field label="Month"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
          <Field label="Basic"><Input type="number" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} /></Field>
          <Field label="Bonus"><Input type="number" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></Field>
          <Field label="PF"><Input type="number" value={form.pf} onChange={(e) => setForm({ ...form, pf: e.target.value })} /></Field>
          <Field label="Tax"><Input type="number" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></Field>
          <Field label="Deductions"><Input type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
          <span className="text-sm text-slate-600">Net Pay (preview)</span>
          <span className="text-lg font-bold text-green-600">{inr(netPreview)}</span>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
