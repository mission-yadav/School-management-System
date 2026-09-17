import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, FileText, Wallet, Undo2 } from 'lucide-react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { usePdfViewer } from '@/components/PdfViewer';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { BS_MONTHS } from '@/lib/nepaliDate';
import { inr } from '@/lib/utils';

type Emp = { id: number; name: string; post: string | null; idNo: string | null; total: number; order: number };
const blank = { name: '', post: '', idNo: '', total: '' };

export default function Salary() {
  const toast = useToast();
  const openPdf = usePdfViewer();
  const { data, loading, refetch } = useFetch<Emp[]>('/salary');
  const period = useFetch<any>('/fees/billing-period');

  // month/year for the generated sheet (defaults to the current billing month)
  // Salary records begin at Shrawan 2083 — the page defaults here and can't go earlier.
  const SALARY_START = { year: 2083, month: 4 };
  const [year, setYear] = useState<number | null>(SALARY_START.year);
  const [month, setMonth] = useState<number | null>(SALARY_START.month);

  // payments already made for the selected month
  const payments = useFetch<any[]>(year && month ? `/salary/payments?year=${year}&month=${month}` : null, [year, month]);
  const paidByEmp = new Map<number, any>((payments.data || []).map((p) => [p.employeeId, p]));

  // add / edit dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [saving, setSaving] = useState(false);

  function startAdd() { setEditId(null); setForm(blank); setOpen(true); }
  function startEdit(r: Emp) { setEditId(r.id); setForm({ name: r.name, post: r.post || '', idNo: r.idNo || '', total: r.total ? String(r.total) : '' }); setOpen(true); }

  async function save() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const body = { name: form.name, post: form.post, idNo: form.idNo, total: Number(form.total || 0) };
      if (editId) await api.put(`/salary/${editId}`, body);
      else await api.post('/salary', body);
      toast.success(editId ? 'Staff updated' : 'Staff added');
      setOpen(false); refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  }

  async function remove(r: Emp) {
    if (!confirm(`Remove ${r.name} from the salary roster?`)) return;
    try { await api.delete(`/salary/${r.id}`); toast.success('Removed'); refetch(); }
    catch (e) { toast.error(apiError(e)); }
  }

  // ---- Pay salary ----
  const [payRow, setPayRow] = useState<Emp | null>(null);
  const [payForm, setPayForm] = useState<any>({ absentDays: '0', paid: '' });
  const [monthDays, setMonthDays] = useState<number | null>(null);
  const [paidEdited, setPaidEdited] = useState(false);
  const [paySaving, setPaySaving] = useState(false);

  const pTotal = payRow?.total || 0;
  const pAbsent = Math.max(0, Math.floor(Number(payForm.absentDays || 0)));
  const pTds = Math.round(pTotal * 0.01);
  const pPerDay = monthDays ? pTotal / monthDays : 0;
  const pDeductDays = Math.max(0, pAbsent - 1); // first absent day is excused
  const pDeduction = Math.round(pPerDay * pDeductDays);
  const pNet = Math.round(pTotal - pTds - pDeduction);

  // keep the Paid field tracking the computed net until the accountant edits it
  useEffect(() => {
    if (payRow && !paidEdited) setPayForm((f: any) => ({ ...f, paid: String(pNet) }));
  }, [pNet, payRow, paidEdited]);

  async function startPay(r: Emp) {
    if (!year || !month) { toast.error('Select a month first'); return; }
    const existing = paidByEmp.get(r.id);
    setPayRow(r);
    setMonthDays(null);
    setPaidEdited(!!existing);
    setPayForm({ absentDays: existing ? String(existing.absentDays) : '0', paid: existing ? String(existing.paid) : '' });
    try { const res = await api.get(`/salary/month-days?year=${year}&month=${month}`); setMonthDays(res.data.days); }
    catch (e) { toast.error(apiError(e)); }
  }

  async function savePay() {
    if (!payRow || !year || !month) return;
    setPaySaving(true);
    try {
      await api.post(`/salary/${payRow.id}/pay`, { year, month, absentDays: pAbsent, paid: payForm.paid === '' ? undefined : Number(payForm.paid) });
      toast.success('Salary paid');
      setPayRow(null); payments.refetch();
    } catch (e) { toast.error(apiError(e)); } finally { setPaySaving(false); }
  }

  async function undoPay(r: Emp) {
    const p = paidByEmp.get(r.id); if (!p) return;
    if (!confirm(`Undo ${r.name}'s salary payment for ${monthName} ${year}?`)) return;
    try { await api.delete(`/salary/payment/${p.id}`); toast.success('Payment undone'); payments.refetch(); }
    catch (e) { toast.error(apiError(e)); }
  }

  const monthName = month ? BS_MONTHS[month - 1] : '';
  function generate() {
    if (!year || !month) return;
    openPdf({
      url: `/pdf/salary-sheet?year=${year}&month=${month}`,
      filename: `salary-${monthName}-${year}.pdf`,
      title: `Salary Sheet — ${monthName} ${year}`,
    });
  }

  const maxYear = Math.max(SALARY_START.year, period.data?.year ?? SALARY_START.year) + 1;
  const years: number[] = [];
  for (let yy = SALARY_START.year; yy <= maxYear; yy++) years.push(yy);
  const total = (data || []).reduce((a, r) => a + (r.total || 0), 0);

  const columns: Column<Emp>[] = [
    { key: 'name', header: 'Staffs', render: (r) => <span className="font-medium text-slate-900">{r.name}{r.idNo ? <span className="ml-1 text-xs font-normal text-slate-400">({r.idNo})</span> : null}</span> },
    { key: 'post', header: 'Post', render: (r) => r.post || '—' },
    { key: 'total', header: 'Total', className: 'text-right', render: (r) => <span className="font-medium">{r.total ? inr(r.total) : '—'}</span> },
    { key: 'status', header: `Paid (${monthName || '—'})`, className: 'text-right', render: (r) => {
      const p = paidByEmp.get(r.id);
      return p
        ? <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-600">{inr(p.paid)}{p.absentDays ? ` · ${p.absentDays}d abs` : ''}</span>
        : <span className="text-xs text-slate-400">Unpaid</span>;
    } },
    { key: 'a', header: '', className: 'text-right', render: (r) => {
      const paid = paidByEmp.has(r.id);
      return (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant={paid ? 'ghost' : 'outline'} onClick={() => startPay(r)}><Wallet className="size-4" /> {paid ? 'Edit Pay' : 'Pay'}</Button>
          {paid && <Button size="sm" variant="ghost" onClick={() => undoPay(r)} title="Undo payment"><Undo2 className="size-4 text-amber-600" /></Button>}
          <Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil className="size-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="size-4 text-red-500" /></Button>
        </div>
      );
    } },
  ];

  return (
    <div>
      <PageHeader title="Salary" subtitle="Manage the staff salary roster and generate the monthly salary sheet" />

      {/* Generate the monthly sheet */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-5">
          <Field label="Month" className="min-w-[140px]">
            <Select value={month ?? ''} onChange={(e) => setMonth(Number(e.target.value))}>
              {BS_MONTHS.map((m, i) => (year === SALARY_START.year && i + 1 < SALARY_START.month) ? null : <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Year (BS)" className="min-w-[120px]">
            <Select value={year ?? ''} onChange={(e) => { const y = Number(e.target.value); setYear(y); if (y === SALARY_START.year && (month ?? 0) < SALARY_START.month) setMonth(SALARY_START.month); }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Button onClick={generate} disabled={!year || !month}><FileText className="size-4" /> Generate Salary Sheet</Button>
          <div className="ml-auto text-sm text-slate-500">Absent · TDS · Paid · Sign are left blank on the sheet for hand-filling each month.</div>
        </CardContent>
      </Card>

      {/* Roster */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-500">{(data?.length ?? 0)} staff · Monthly total <span className="font-semibold text-slate-700">{inr(total)}</span></div>
        <Button onClick={startAdd}><Plus className="size-4" /> Add Staff</Button>
      </div>

      {loading ? <Loading /> : (data?.length ?? 0) === 0
        ? <EmptyState title="No staff yet" description="Add teaching and non-teaching staff to build the salary roster." />
        : <DataTable columns={columns} rows={data || []} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editId ? 'Edit Staff' : 'Add Staff'}
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button></>}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Anjali Chaurasiya" /></Field>
            <Field label="Post"><Input value={form.post} onChange={(e) => setForm({ ...form, post: e.target.value })} placeholder="A.T / O.A / Principal / PT…" /></Field>
            <Field label="ID No (optional)"><Input value={form.idNo} onChange={(e) => setForm({ ...form, idNo: e.target.value })} placeholder="e.g. 156243074" /></Field>
            <Field label="Total (monthly salary)" className="col-span-2"><Input type="number" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} placeholder="e.g. 9000" /></Field>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pay salary */}
      <Dialog open={payRow !== null} onOpenChange={(o) => { if (!o) setPayRow(null); }}>
        <DialogContent
          title={payRow ? `Pay Salary — ${payRow.name}` : 'Pay Salary'}
          footer={<><Button variant="secondary" onClick={() => setPayRow(null)}>Cancel</Button><Button onClick={savePay} disabled={paySaving || monthDays === null}>{paySaving ? 'Saving…' : 'Record Payment'}</Button></>}
        >
          {payRow && (
            <div className="space-y-3">
              <div className="text-sm text-slate-500">For <b>{monthName} {year}</b>{monthDays ? ` · ${monthDays} days in month` : ''}</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Salary (Total)"><Input value={inr(pTotal)} disabled /></Field>
                <Field label="Absent days"><Input type="number" min={0} value={payForm.absentDays} onChange={(e) => { setPaidEdited(false); setPayForm({ ...payForm, absentDays: e.target.value }); }} /></Field>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">TDS (1% of salary)</span><span className="font-medium text-red-600">− {inr(pTds)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Absent deduction {monthDays ? `(${inr(Math.round(pPerDay))}/day × ${pDeductDays}${pAbsent > 0 ? ', 1 day excused' : ''})` : ''}</span><span className="font-medium text-red-600">− {inr(pDeduction)}</span></div>
                <div className="mt-1 flex justify-between border-t border-slate-200 pt-1"><span className="font-semibold text-slate-700">Net payable</span><span className="font-bold text-slate-900">{inr(pNet)}</span></div>
              </div>
              <Field label="Amount Paid"><Input type="number" value={payForm.paid} onChange={(e) => { setPaidEdited(true); setPayForm({ ...payForm, paid: e.target.value }); }} /></Field>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
