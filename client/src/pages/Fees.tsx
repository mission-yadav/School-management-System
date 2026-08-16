import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { formatBS } from '@/lib/nepaliDate';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
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
import { PdfPreviewDialog, type PdfPreview } from '@/components/PdfPreviewDialog';
import { FeeEditDialog } from '@/components/FeeEditDialog';
import { StudentLedgerDialog } from '@/components/StudentLedgerDialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Pencil, FileText, Wallet, ScrollText, ChevronDown, Undo2 } from 'lucide-react';

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

/** Monthly column: shows the per-month tuition rate; an arrow reveals the accumulated total. */
function MonthlyCell({ m }: { m?: { rate: number; months: number; accumulated: number } }) {
  const [show, setShow] = useState(false);
  if (!m || !m.rate) return <>—</>;
  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="inline-flex items-center gap-1 hover:text-brand"
        title={show ? 'Hide accumulated' : `Accumulated: ${inr(m.accumulated)} (${m.months} mo)`}
      >
        {inr(m.rate)}
        <ChevronDown className={`size-3.5 text-slate-400 transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>
      {show && <span className="text-[11px] text-slate-500">Σ {inr(m.accumulated)} · {m.months} mo</span>}
    </div>
  );
}

export default function Fees() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tab = pathname.endsWith('/structure') ? 'structure' : 'invoices';
  return (
    <div>
      <PageHeader title="Fee Management" subtitle="Billing, collections & fee structure" />
      <Tabs value={tab} onValueChange={(v) => navigate(v === 'structure' ? '/fees/structure' : '/fees')}>
        <TabsList>
          <TabsTrigger value="invoices">Billing &amp; Ledgers</TabsTrigger>
          <TabsTrigger value="structure">Fee Structure</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices"><InvoicesTab /></TabsContent>
        <TabsContent value="structure"><FeeStructureEditor /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ===================================================== Billing month bar */
function BillingMonthCard({ onAdvanced }: { onAdvanced: () => void }) {
  const toast = useToast();
  const [info, setInfo] = useState<any>(null);
  const [action, setAction] = useState<null | 'advance' | 'revert'>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/fees/billing-period').then(({ data }) => setInfo(data)).catch(() => {}); }, []);

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/fees/billing-period/${action}`);
      setInfo(data); setAction(null);
      toast(`Billing month ${action === 'advance' ? 'advanced' : 'reverted'} to ${data.label}`);
      onAdvanced();
    } catch (e) { toast(apiError(e), 'error'); }
    finally { setBusy(false); }
  }

  if (!info) return null;
  const to = action === 'revert' ? info.prev : info.next;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div>
          <div className="text-sm text-slate-500">Current Billing Month</div>
          <div className="text-2xl font-bold text-brand">{info.label}</div>
          <div className="text-xs text-slate-400">
            New charges accrue only up to this month.{' '}
            {info.isBehindReal && <span className="text-amber-600">Calendar is already {info.real.label} — advance when you're ready.</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {info.canRevert && <Button variant="outline" onClick={() => setAction('revert')}>← Revert to {info.prev.label}</Button>}
          <Button onClick={() => setAction('advance')}>Update Month → {info.next.label}</Button>
        </div>
      </CardContent>

      <Dialog open={!!action} onOpenChange={(o) => { if (!o) setAction(null); }}>
        <DialogContent
          className="max-w-md"
          title={action === 'revert' ? 'Revert Billing Month?' : 'Advance Billing Month?'}
          footer={<>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
            <Button onClick={run} disabled={busy}>{busy ? 'Working…' : `Yes, ${action === 'revert' ? 'revert' : 'advance'} to ${to?.label}`}</Button>
          </>}
        >
          {action === 'revert' ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>This moves the billing month back from <b>{info.label}</b> to <b>{info.prev.label}</b> and removes <b>{info.label}</b> tuition from every student's ledger.</p>
              <p className="text-amber-700">Payments already recorded are kept, so a student who paid for {info.label} may show a credit until you advance again.</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <p>This moves the billing month from <b>{info.label}</b> to <b>{info.next.label}</b> and adds <b>{info.next.label}</b> tuition to every active student's ledger.</p>
              <p className="text-amber-700">The new month's charges apply immediately and appear on the next bills.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================================================== Invoices */
function InvoicesTab() {
  const toast = useToast();
  const { data, loading, refetch } = useFetch<any[]>('/fees');
  const { data: summary, refetch: refetchSummary } = useFetch<any>('/fees/summary');
  const { data: students, refetch: refetchStudents } = useFetch<any[]>('/students');
  const { data: classes } = useFetch<any[]>('/classes');

  function reload() { refetch(); refetchSummary(); }

  // PDF preview + student edit dialogs
  const [preview, setPreview] = useState<PdfPreview | null>(null);
  const [feeEdit, setFeeEdit] = useState<{ open: boolean; invoiceId: number | null; studentId: number | null }>({ open: false, invoiceId: null, studentId: null });
  const [ledgerId, setLedgerId] = useState<number | null>(null);
  const [correctId, setCorrectId] = useState<number | null>(null);

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

  // ---- pagination (10 rows per page) ----
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const curPage = Math.min(page, pageCount);
  useEffect(() => { setPage(1); }, [listClass, listSearch, listBy]);
  const pageRows = filteredInvoices.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);

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
  const [free, setFree] = useState(false);

  async function loadPrefill(studentId: string) {
    if (!studentId) { setLines([]); setFree(false); return; }
    try {
      const { data } = await api.get(`/fees/prefill?studentId=${studentId}`);
      setLines(data.lines); setFree(!!data.feeFree);
    } catch (e) { toast(apiError(e), 'error'); }
  }
  useEffect(() => { loadPrefill(form.studentId); /* eslint-disable-next-line */ }, [form.studentId]);

  // toggle the "Free" (monthly fee waiver) flag on the selected student
  async function toggleFree(checked: boolean) {
    if (!form.studentId) return;
    setFree(checked);
    try {
      await api.put(`/students/${form.studentId}`, { feeFree: checked });
      await loadPrefill(form.studentId);
      refetchStudents();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  function startNew() {
    setForm({ studentId: '', title: 'Term Fees', sessionLabel: '', dueDate: '', less: '' });
    setLines([]); setFree(false); setPickClass(''); setStuBy('name'); setStuSearch('');
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
      if (printAfter && id) setPreview({ url: `/pdf/intimation/${id}`, filename: `intimation-${id}.pdf`, title: 'Fee Intimation Card' });
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
  const [pay, setPay] = useState<any>({ amount: '', less: '', method: 'CASH', reference: '' });
  function startPay(row: any) { setPayRow(row); setPay({ amount: String(row.due ?? ''), less: '', method: 'CASH', reference: '' }); setOpenPay(true); }
  async function collect(printReceipt: boolean) {
    if (!payRow) return;
    try {
      const res = await api.post(`/fees/${payRow.id}/pay`, { amount: Number(pay.amount || 0), less: Number(pay.less || 0), method: pay.method, reference: pay.reference });
      const { receiptNo, paymentId } = res.data || {};
      toast(`Payment recorded · ${receiptNo}`); setOpenPay(false); reload();
      if (printReceipt && paymentId) setPreview({ url: `/pdf/receipt/${paymentId}`, filename: `${receiptNo}.pdf`, title: 'Fee Receipt' });
    } catch (e) { toast(apiError(e), 'error'); }
  }

  async function remove(id: number) {
    if (!confirm('Delete invoice?')) return;
    try { await api.delete(`/fees/${id}`); toast('Deleted'); reload(); } catch (e) { toast(apiError(e), 'error'); }
  }

  const money = (v: any) => (v ? inr(v) : '—');
  const columns: Column<any>[] = [
    { key: 'student', header: 'Student', render: (r) => (
      <div>
        <div className="flex items-center gap-1.5">
          {r.feeFree && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">FREE</span>}
          <span className="font-medium text-slate-800">{r.studentName}</span>
        </div>
        <div className="text-xs text-slate-500">{r.className} · IEMIS {r.iemis || '—'}</div>
      </div>
    ) },
    { key: 'title', header: 'Fee', render: (r) => r.title },
    ...COMPONENTS.map((c) => ({ key: c.key, header: c.header, className: 'text-right whitespace-nowrap', render: (r: any) => c.key === 'monthlyTuition' ? <MonthlyCell m={r.monthly} /> : money(r.components?.[c.key]) })),
    { key: 'total', header: 'Total', className: 'text-right font-medium', render: (r) => inr(r.total) },
    { key: 'paid', header: 'Paid', className: 'text-right font-medium text-green-600', render: (r) => inr(r.paid) },
    { key: 'due', header: 'Dues', className: 'text-right', render: (r) => (
      <span className={`inline-block rounded-md px-2.5 py-1 text-sm font-semibold ${r.due > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{inr(r.due)}</span>
    ) },
    { key: 'a', header: '', className: 'text-right', render: (r) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">Actions <ChevronDown className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setFeeEdit({ open: true, invoiceId: r.id, studentId: r.studentId })}><Pencil className="size-4" /> Edit Fees</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPreview({ url: `/pdf/intimation/${r.id}`, filename: `intimation-${r.id}.pdf`, title: 'Fee Intimation Card' })}><FileText className="size-4" /> Intimation</DropdownMenuItem>
          {r.status !== 'PAID' && <DropdownMenuItem onSelect={() => startPay(r)}><Wallet className="size-4" /> Collect Payment</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setCorrectId(r.studentId)}><Undo2 className="size-4" /> Paid Correction</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLedgerId(r.studentId)}><ScrollText className="size-4" /> Record / Ledger</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <div>
      <div className="mb-4"><BillingMonthCard onAdvanced={reload} /></div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Total Billed</div><div className="text-2xl font-bold text-slate-800">{inr(summary?.billed || 0)}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Collected</div><div className="text-2xl font-bold text-green-600">{inr(summary?.collected || 0)}</div></CardContent></Card>
          <Card><CardContent className="pt-5"><div className="text-sm text-slate-500">Outstanding</div><div className="text-2xl font-bold text-red-600">{inr(summary?.due || 0)}</div></CardContent></Card>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={listClass} onChange={(e) => setListClass(e.target.value)} className="w-40">
          <option value="">All Classes</option>
          {(classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <SearchModeToggle value={listBy} onChange={setListBy} />
        <Input className="w-56" placeholder={searchPlaceholder(listBy)} value={listSearch} onChange={(e) => setListSearch(e.target.value)} inputMode={listBy === 'iemis' ? 'numeric' : 'text'} />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!filteredInvoices.length}
          title="Prints the listed bills 4 to an A4 sheet — no A6 paper needed; cut along the dashed lines"
          onClick={() => setPreview({ url: `/pdf/bills?ids=${filteredInvoices.map((r: any) => r.id).join(',')}`, filename: 'bills-4up.pdf', title: `Fee Bills · 4 per A4 (${filteredInvoices.length})` })}
        >
          Print bills · 4/sheet
        </Button>
      </div>

      {loading ? <Loading /> : <DataTable columns={columns} rows={pageRows} />}

      {filteredInvoices.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            Showing {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(curPage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>Previous</Button>
            <span className="px-1 text-slate-600">Page {curPage} / {pageCount}</span>
            <Button size="sm" variant="outline" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* payment */}
      <Dialog open={openPay} onOpenChange={setOpenPay}>
        <DialogContent title="Collect Payment" footer={<><Button variant="secondary" onClick={() => setOpenPay(false)}>Cancel</Button><Button variant="outline" onClick={() => collect(false)}>Collect</Button><Button onClick={() => collect(true)}>Collect & Receipt</Button></>}>
          {payRow && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 text-sm text-slate-500">{payRow.studentName} — Due {inr(payRow.due)}</div>
              <Field label="Amount Received"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Less (concession)"><Input type="number" value={pay.less} onChange={(e) => setPay({ ...pay, less: e.target.value })} /></Field>
              <Field label="Method">
                <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                  <option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank Transfer</option>
                </Select>
              </Field>
              <Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
              <div className="col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Balance cleared this time: <b>{inr(Number(pay.amount || 0) + Number(pay.less || 0))}</b>
                <span className="text-slate-400"> ({inr(pay.amount || 0)} paid + {inr(pay.less || 0)} less)</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog preview={preview} onClose={() => setPreview(null)} />
      <FeeEditDialog
        open={feeEdit.open}
        invoiceId={feeEdit.invoiceId}
        studentId={feeEdit.studentId}
        onClose={() => setFeeEdit({ open: false, invoiceId: null, studentId: null })}
        onSaved={() => { reload(); refetchStudents(); }}
      />
      <StudentLedgerDialog
        open={ledgerId !== null}
        studentId={ledgerId}
        onClose={() => setLedgerId(null)}
        onPreview={setPreview}
      />

      <PaidCorrectionDialog studentId={correctId} onClose={() => setCorrectId(null)} onChanged={reload} />
    </div>
  );
}

/* ================================================ Paid correction (revert payments) */
function PaidCorrectionDialog({ studentId, onClose, onChanged }: { studentId: number | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [led, setLed] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  async function load() {
    if (studentId == null) return;
    setLoading(true);
    try { const { data } = await api.get(`/fees/ledger/${studentId}`); setLed(data); }
    catch (e) { toast(apiError(e), 'error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { setLed(null); if (studentId != null) load(); /* eslint-disable-next-line */ }, [studentId]);

  async function revert(p: any) {
    if (!confirm(`Revert this collection of ${inr(p.amount)}${p.less ? ` (+ ${inr(p.less)} less)` : ''}? This removes the payment and increases the balance due.`)) return;
    setBusy(p.id);
    try {
      await api.delete(`/fees/payment/${p.id}`);
      toast('Payment reverted');
      await load();
      onChanged();
    } catch (e) { toast(apiError(e), 'error'); }
    finally { setBusy(null); }
  }

  const payments = led?.payments || [];
  return (
    <Dialog open={studentId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg" title="Paid Correction" footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
        {loading ? <Loading label="Loading payments…" /> : (
          <div className="space-y-3">
            {led && (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-medium text-slate-700">{led.student?.name}</span>
                <span className="text-slate-500">Due <b className={led.totals?.due > 0 ? 'text-red-600' : 'text-green-600'}>{inr(led.totals?.due || 0)}</b></span>
              </div>
            )}
            <p className="text-xs text-slate-400">Revert a wrongly-collected payment. It's removed one at a time and the balance due is recalculated.</p>
            {payments.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">No payments recorded for this student.</div>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {inr(p.amount)}{p.less ? <span className="text-slate-400"> + {inr(p.less)} less</span> : null}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{p.method}</span>
                      </div>
                      <div className="text-xs text-slate-400">{p.receiptNo} · {formatBS(p.paidAt)}</div>
                    </div>
                    <Button size="sm" variant="outline" className="text-red-600" disabled={busy === p.id} onClick={() => revert(p)}>
                      {busy === p.id ? 'Reverting…' : 'Revert'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
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
      const { data } = await api.put(`/fees/structure/${row.classId}`, row);
      const n = data?.synced ?? 0;
      toast(n ? `Saved ${row.className} · updated ${n} existing bill${n === 1 ? '' : 's'}` : `Saved ${row.className}`);
    } catch (e) { toast(apiError(e), 'error'); }
  }

  if (loading) return <Loading />;
  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">Set the standard charges for each class. Saving updates every existing bill in that class (monthly tuition and charges), and pre-fills new bills. Transportation is billed only to students who use the service.</p>
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
