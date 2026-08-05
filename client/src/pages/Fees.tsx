import { useEffect, useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column, Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { SearchModeToggle, searchPlaceholder, type SearchMode } from '@/components/SearchModeToggle';

type Line = { key: string; label: string; amount: number | string; include: boolean; conditional?: string };

// Canonical component order — Monthly first, Annual second, Miscellaneous last.
const COMPONENTS: { key: string; header: string }[] = [
  { key: 'monthlyTuition', header: 'Monthly' },
  { key: 'annualCharge', header: 'Annual' },
  { key: 'computerFee', header: 'Computer' },
  { key: 'transportFee', header: 'Transport' },
  { key: 'examFee', header: 'Exam' },
  { key: 'miscCharge', header: 'Misc' },
];

export default function Fees() {
  return (
    <div>
      <PageHeader title="Fee Management" subtitle="Intimations, collections & fee structure" />
      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="structure">Fee Structure</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="structure"><FeeStructureEditor /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================================================== Invoices */
function InvoicesTab() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const url = `/fees${status ? `?status=${status}` : ''}`;
  const { data, loading, refetch } = useFetch<any[]>(url, [status]);
  const { data: summary, refetch: refetchSummary } = useFetch<any>('/fees/summary', [status]);
  const { data: students } = useFetch<any[]>('/students');
  const { data: classes } = useFetch<any[]>('/classes');

  function reload() { refetch(); refetchSummary(); }

  // ---- list filters ----
  const [listClass, setListClass] = useState('');
  const [listBy, setListBy] = useState<SearchMode>('name');
  const [listSearch, setListSearch] = useState('');
  const filteredInvoices = (data || []).filter((r: any) => {
    if (listClass && String(r.classId) !== String(listClass)) return false;
    const term = listSearch.trim().toLowerCase();
    if (!term) return true;
    return listBy === 'iemis'
      ? String(r.iemis || '').toLowerCase().includes(term)
      : String(r.studentName || '').toLowerCase().includes(term);
  });

  // ---- new bill dialog ----
  const [openNew, setOpenNew] = useState(false);
  const [pickClass, setPickClass] = useState('');
  const [stuBy, setStuBy] = useState<SearchMode>('name');
  const [stuSearch, setStuSearch] = useState('');
  const filteredStudents = (students || []).filter((s: any) => {
    if (pickClass && String(s.classId) !== String(pickClass)) return false;
    const term = stuSearch.trim().toLowerCase();
    if (!term) return true;
    return stuBy === 'iemis'
      ? String(s.iemis || '').toLowerCase().includes(term)
      : String(s.name || '').toLowerCase().includes(term);
  });
  const [form, setForm] = useState<any>({ studentId: '', title: 'Term Fees', sessionLabel: '', dueDate: '', less: '' });
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!form.studentId) { setLines([]); return; }
    api.get(`/fees/prefill?studentId=${form.studentId}`)
      .then((r) => setLines(r.data.lines))
      .catch((e) => toast(apiError(e), 'error'));
  }, [form.studentId]);

  function startNew() {
    setForm({ studentId: '', title: 'Term Fees', sessionLabel: '', dueDate: '', less: '' });
    setLines([]); setPickClass(''); setStuBy('name'); setStuSearch('');
    setOpenNew(true);
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const included = lines.filter((l) => l.include);
  const gross = included.reduce((a, l) => a + Number(l.amount || 0), 0);
  const less = Number(form.less || 0);
  const grand = gross - less;

  async function createBill(printAfter: boolean) {
    if (!form.studentId) { toast('Select a student', 'error'); return; }
    try {
      const res = await api.post('/fees', {
        studentId: Number(form.studentId), title: form.title, sessionLabel: form.sessionLabel,
        dueDate: form.dueDate, discount: less, fine: 0,
        items: included.map((l) => ({ description: l.label, amount: Number(l.amount || 0) })),
      });
      toast('Intimation created'); setOpenNew(false); reload();
      const id = res.data?.id;
      if (printAfter && id) { try { await downloadFile(`/pdf/intimation/${id}`, `intimation-${id}.pdf`); } catch (e) { toast(apiError(e), 'error'); } }
    } catch (e) { toast(apiError(e), 'error'); }
  }

  // ---- bulk generate for a class ----
  const [openBulk, setOpenBulk] = useState(false);
  const [bulk, setBulk] = useState<any>({ classId: '', title: 'Term Fees', dueDate: '', includeExam: false, less: '' });
  async function generateClass() {
    if (!bulk.classId || !bulk.title) { toast('Class and title required', 'error'); return; }
    try {
      const res = await api.post('/fees/generate-class', {
        classId: Number(bulk.classId), title: bulk.title, dueDate: bulk.dueDate,
        includeExam: bulk.includeExam, less: Number(bulk.less || 0),
      });
      toast(`Generated ${res.data.created} intimation(s)`); setOpenBulk(false); reload();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  // ---- payment dialog ----
  const [openPay, setOpenPay] = useState(false);
  const [payRow, setPayRow] = useState<any>(null);
  const [pay, setPay] = useState<any>({ amount: '', method: 'CASH', reference: '' });
  function startPay(row: any) { setPayRow(row); setPay({ amount: String(row.due ?? ''), method: 'CASH', reference: '' }); setOpenPay(true); }
  async function collect() {
    if (!payRow) return;
    try {
      const res = await api.post(`/fees/${payRow.id}/pay`, { amount: Number(pay.amount || 0), method: pay.method, reference: pay.reference });
      const { receiptNo, paymentId } = res.data || {};
      toast(`Receipt ${receiptNo}`); setOpenPay(false); reload();
      if (paymentId && confirm(`Download receipt ${receiptNo}?`)) {
        try { await downloadFile(`/pdf/receipt/${paymentId}`, `${receiptNo}.pdf`); } catch (e) { toast(apiError(e), 'error'); }
      }
    } catch (e) { toast(apiError(e), 'error'); }
  }

  async function remove(id: number) {
    if (!confirm('Delete invoice?')) return;
    try { await api.delete(`/fees/${id}`); toast('Deleted'); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const money = (v: any) => (v ? inr(v) : '—');
  const columns: Column<any>[] = [
    { key: 'student', header: 'Student', render: (r) => (<div><div className="font-medium text-slate-800">{r.studentName}</div><div className="text-xs text-slate-500">{r.className} · IEMIS {r.iemis || '—'}</div></div>) },
    { key: 'title', header: 'Fee', render: (r) => r.title },
    ...COMPONENTS.map((c) => ({ key: c.key, header: c.header, className: 'text-right whitespace-nowrap', render: (r: any) => money(r.components?.[c.key]) })),
    { key: 'total', header: 'Total', className: 'text-right font-medium', render: (r) => inr(r.total) },
    { key: 'paid', header: 'Paid', className: 'text-right', render: (r) => inr(r.paid) },
    { key: 'due', header: 'Due', className: 'text-right', render: (r) => inr(r.due) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
    { key: 'a', header: '', render: (r) => (
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="ghost" onClick={() => downloadFile(`/pdf/intimation/${r.id}`, `intimation-${r.id}.pdf`)}>Intimation</Button>
        {r.paid > 0 && <Button size="sm" variant="ghost" onClick={() => downloadFile(`/pdf/receipt/invoice/${r.id}`, `receipt-${r.id}.pdf`)}>Receipt</Button>}
        {r.status !== 'PAID' && <Button size="sm" variant="outline" onClick={() => startPay(r)}>Collect</Button>}
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
      </div>
    ) },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Total Billed</div><div className="text-2xl font-bold text-slate-800">{inr(summary?.billed || 0)}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Collected</div><div className="text-2xl font-bold text-green-600">{inr(summary?.collected || 0)}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Outstanding</div><div className="text-2xl font-bold text-red-600">{inr(summary?.due || 0)}</div></CardContent></Card>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">All Statuses</option><option value="PENDING">Pending</option><option value="PARTIAL">Partial</option><option value="PAID">Paid</option>
        </Select>
        <Select value={listClass} onChange={(e) => setListClass(e.target.value)} className="w-40">
          <option value="">All Classes</option>
          {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <SearchModeToggle value={listBy} onChange={setListBy} />
        <Input className="w-56" placeholder={searchPlaceholder(listBy)} value={listSearch} onChange={(e) => setListSearch(e.target.value)} inputMode={listBy === 'iemis' ? 'numeric' : 'text'} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => { setBulk({ classId: '', title: 'Term Fees', dueDate: '', includeExam: false, less: '' }); setOpenBulk(true); }}>Generate for Class</Button>
          <Button onClick={startNew}>+ New Intimation</Button>
        </div>
      </div>

      {loading ? <Loading /> : <DataTable columns={columns} rows={filteredInvoices} />}

      {/* New bill */}
      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent
          title="New Fee Intimation"
          footer={<><Button variant="secondary" onClick={() => setOpenNew(false)}>Cancel</Button><Button variant="outline" onClick={() => createBill(false)}>Create</Button><Button onClick={() => createBill(true)}>Create & Print Intimation</Button></>}
        >
          {/* student picker */}
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="mb-2 text-sm font-medium text-slate-600">Select Student</div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Select value={pickClass} onChange={(e) => setPickClass(e.target.value)} className="w-36">
                <option value="">All classes</option>
                {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <SearchModeToggle value={stuBy} onChange={setStuBy} />
              <Input className="min-w-[9rem] flex-1" placeholder={searchPlaceholder(stuBy)} value={stuSearch} onChange={(e) => setStuSearch(e.target.value)} inputMode={stuBy === 'iemis' ? 'numeric' : 'text'} />
            </div>
            <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">{`Select student (${filteredStudents.length})`}</option>
              {filteredStudents.map((s: any) => <option key={s.id} value={s.id}>{s.name} · IEMIS {s.iemis || '—'} · {s.className || '—'}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Intimation Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Session"><Input value={form.sessionLabel} onChange={(e) => setForm({ ...form, sessionLabel: e.target.value })} /></Field>
            <Field label="Due Date"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          </div>

          {/* fee components */}
          {form.studentId && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-slate-600">Fee Components</div>
              <div className="rounded-lg border border-slate-200">
                {lines.map((l, i) => (
                  <label key={l.key} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0">
                    <input type="checkbox" checked={l.include} onChange={(e) => setLine(i, { include: e.target.checked })} className="size-4 accent-[#262081]" />
                    <span className="flex-1 text-sm text-slate-700">
                      {l.label}
                      {l.conditional === 'transport' && <span className="ml-2 text-xs text-amber-600">(if service taken)</span>}
                      {l.conditional === 'exam' && <span className="ml-2 text-xs text-blue-600">(exam season)</span>}
                    </span>
                    <span className="text-slate-400">₹</span>
                    <Input type="number" className="w-28" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} disabled={!l.include} />
                  </label>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-end gap-4">
                <div className="text-right text-sm">
                  <div className="text-slate-500">Sub Total: <b className="text-slate-700">{inr(gross)}</b></div>
                </div>
                <Field label="Less (deduction)"><Input type="number" className="w-32" value={form.less} onChange={(e) => setForm({ ...form, less: e.target.value })} /></Field>
                <div className="rounded-lg bg-brand-50 px-4 py-2 text-right">
                  <div className="text-xs text-brand">Grand Total</div>
                  <div className="text-lg font-bold text-brand">{inr(grand)}</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* bulk generate */}
      <Dialog open={openBulk} onOpenChange={setOpenBulk}>
        <DialogContent title="Generate Intimations for a Class" footer={<><Button variant="secondary" onClick={() => setOpenBulk(false)}>Cancel</Button><Button onClick={generateClass}>Generate</Button></>}>
          <p className="mb-3 text-sm text-slate-500">Creates a fee intimation for every active student in the class using that class's fee structure (transport added only for students who use it).</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Class">
              <Select value={bulk.classId} onChange={(e) => setBulk({ ...bulk, classId: e.target.value })}>
                <option value="">Select class</option>
                {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Intimation Title"><Input value={bulk.title} onChange={(e) => setBulk({ ...bulk, title: e.target.value })} /></Field>
            <Field label="Due Date"><Input type="date" value={bulk.dueDate} onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })} /></Field>
            <Field label="Less (each)"><Input type="number" value={bulk.less} onChange={(e) => setBulk({ ...bulk, less: e.target.value })} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={bulk.includeExam} onChange={(e) => setBulk({ ...bulk, includeExam: e.target.checked })} className="size-4 accent-[#262081]" />
              Include Exam Fee (exam season)
            </label>
          </div>
        </DialogContent>
      </Dialog>

      {/* payment */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent title="Collect Payment" footer={<><Button variant="secondary" onClick={() => setOpenPay(false)}>Cancel</Button><Button onClick={collect}>Collect</Button></>}>
          {payRow && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-sm text-slate-500">{payRow.studentName} — {payRow.title} (Due {inr(payRow.due)})</div>
              <Field label="Amount"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Method">
                <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank Transfer</option>
                </Select>
              </Field>
              <div className="col-span-2"><Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ======================================================= Fee Structure */
const STRUCT_COLS: { key: string; label: string }[] = [
  { key: 'monthlyTuition', label: 'Monthly Tuition' },
  { key: 'annualCharge', label: 'Annual' },
  { key: 'computerFee', label: 'Computer' },
  { key: 'transportFee', label: 'Transport' },
  { key: 'examFee', label: 'Exam' },
  { key: 'miscCharge', label: 'Misc' },
];

function FeeStructureEditor() {
  const toast = useToast();
  const { data, loading } = useFetch<any[]>('/fees/structure');
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { if (data) setRows(data); }, [data]);

  const upd = (i: number, key: string, v: string) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  async function save(row: any) {
    try {
      await api.put(`/fees/structure/${row.classId}`, row);
      toast(`Saved ${row.className}`);
    } catch (e) { toast(apiError(e), 'error'); }
  }

  if (loading) return <Loading />;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Set the standard charges for each class. These amounts pre-fill every student's bill. Transportation is billed only to students who use the service.</p>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            <TH>Class</TH>
            {STRUCT_COLS.map((c) => <TH key={c.key} className="text-right">{c.label}</TH>)}
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r, i) => (
            <TR key={r.classId}>
              <TD className="font-medium text-slate-800">{r.className}</TD>
              {STRUCT_COLS.map((c) => (
                <TD key={c.key} className="text-right">
                  <Input type="number" className="w-24 text-right" value={r[c.key]} onChange={(e) => upd(i, c.key, e.target.value)} />
                </TD>
              ))}
              <TD><Button size="sm" onClick={() => save(r)}>Save</Button></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
