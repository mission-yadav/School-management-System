import { useState } from 'react';
import api, { apiError, downloadFile } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusVariant } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

type Item = { description: string; amount: string; categoryId: string };

export default function Fees() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const url = `/fees${status ? `?status=${status}` : ''}`;
  const { data, loading, refetch } = useFetch<any[]>(url, [status]);
  const { data: summary } = useFetch<any>('/fees/summary', [status]);
  const { data: students } = useFetch<any[]>('/students');
  const { data: categories } = useFetch<any[]>('/fees/categories');

  // ---- New invoice dialog ----
  const emptyItem = (): Item => ({ description: '', amount: '', categoryId: '' });
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState<any>({ studentId: '', title: '', sessionLabel: '', dueDate: '', discount: '', fine: '' });
  const [items, setItems] = useState<Item[]>([emptyItem()]);

  function startNew() {
    setForm({ studentId: '', title: '', sessionLabel: '', dueDate: '', discount: '', fine: '' });
    setItems([emptyItem()]);
    setOpenNew(true);
  }
  function updateItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addItem() { setItems((prev) => [...prev, emptyItem()]); }
  function removeItem(i: number) { setItems((prev) => prev.filter((_, idx) => idx !== i)); }

  async function createInvoice() {
    try {
      await api.post('/fees', {
        studentId: form.studentId ? Number(form.studentId) : undefined,
        title: form.title,
        sessionLabel: form.sessionLabel,
        dueDate: form.dueDate,
        discount: form.discount ? Number(form.discount) : 0,
        fine: form.fine ? Number(form.fine) : 0,
        items: items.map((it) => ({
          description: it.description,
          amount: it.amount ? Number(it.amount) : 0,
          categoryId: it.categoryId ? Number(it.categoryId) : undefined,
        })),
      });
      toast('Invoice created'); setOpenNew(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  // ---- Payment dialog ----
  const [openPay, setOpenPay] = useState(false);
  const [payRow, setPayRow] = useState<any>(null);
  const [pay, setPay] = useState<any>({ amount: '', method: 'CASH', reference: '' });

  function startPay(row: any) {
    setPayRow(row);
    setPay({ amount: String(row.due ?? ''), method: 'CASH', reference: '' });
    setOpenPay(true);
  }
  async function collect() {
    if (!payRow) return;
    try {
      const res = await api.post(`/fees/${payRow.id}/pay`, {
        amount: pay.amount ? Number(pay.amount) : 0,
        method: pay.method,
        reference: pay.reference,
      });
      const { receiptNo, paymentId } = res.data || {};
      toast(`Receipt ${receiptNo}`);
      setOpenPay(false);
      refetch();
      if (paymentId && confirm(`Download receipt ${receiptNo}?`)) {
        try { await downloadFile(`/pdf/receipt/${paymentId}`, `${receiptNo}.pdf`); }
        catch (e) { toast(apiError(e), 'error'); }
      }
    } catch (e) { toast(apiError(e), 'error'); }
  }

  async function remove(id: number) {
    if (!confirm('Delete invoice?')) return;
    try { await api.delete(`/fees/${id}`); toast('Deleted'); refetch(); }
    catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    {
      key: 'student', header: 'Student', render: (r) => (
        <div>
          <div className="font-medium text-slate-800">{r.studentName}</div>
          <div className="text-xs text-slate-500">{r.className}</div>
        </div>
      ),
    },
    { key: 'title', header: 'Fee', render: (r) => r.title },
    { key: 'total', header: 'Total', render: (r) => inr(r.total) },
    { key: 'paid', header: 'Paid', render: (r) => inr(r.paid) },
    { key: 'due', header: 'Due', render: (r) => inr(r.due) },
    { key: 'status', header: 'Status', render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
    {
      key: 'a', header: '', render: (r) => (
        <div className="flex gap-1">
          {r.status !== 'PAID' && <Button size="sm" variant="outline" onClick={() => startPay(r)}>Collect</Button>}
          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
        </div>
      ),
    },
  ];

  return (<div>
    <PageHeader title="Fees" subtitle="Invoices & collections" actions={<Button onClick={startNew}>+ New Invoice</Button>} />

    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Total Billed</div>
        <div className="text-2xl font-bold text-slate-800">{inr(summary?.billed || 0)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Collected</div>
        <div className="text-2xl font-bold text-green-600">{inr(summary?.collected || 0)}</div>
      </CardContent></Card>
      <Card><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Outstanding</div>
        <div className="text-2xl font-bold text-red-600">{inr(summary?.due || 0)}</div>
      </CardContent></Card>
    </div>

    <div className="mb-4 flex gap-3">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
        <option value="">All Statuses</option>
        <option value="PENDING">Pending</option>
        <option value="PARTIAL">Partial</option>
        <option value="PAID">Paid</option>
      </Select>
    </div>

    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    {/* New invoice */}
    <Dialog open={openNew} onOpenChange={setOpenNew}>
      <DialogContent title="New Invoice" footer={<><Button variant="secondary" onClick={() => setOpenNew(false)}>Cancel</Button><Button onClick={createInvoice}>Create</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Student">
            <Select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })}>
              <option value="">Select student</option>
              {(students || []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.admissionNo}) — {s.className}</option>)}
            </Select>
          </Field>
          <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Session"><Input value={form.sessionLabel} onChange={(e) => setForm({ ...form, sessionLabel: e.target.value })} /></Field>
          <Field label="Due Date"><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Discount"><Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></Field>
          <Field label="Fine"><Input type="number" value={form.fine} onChange={(e) => setForm({ ...form, fine: e.target.value })} /></Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-600">Line Items</div>
            <Button size="sm" variant="outline" onClick={addItem}>+ Add Item</Button>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <div className="col-span-5"><Input placeholder="Description" value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} /></div>
                <div className="col-span-3"><Input type="number" placeholder="Amount" value={it.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} /></div>
                <div className="col-span-3">
                  <Select value={it.categoryId} onChange={(e) => updateItem(i, { categoryId: e.target.value })}>
                    <option value="">Category</option>
                    {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <Button size="icon" variant="ghost" className="text-red-600" disabled={items.length === 1} onClick={() => removeItem(i)}>×</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Payment */}
    <Dialog open={openPay} onOpenChange={setOpenPay}>
      <DialogContent title="Collect Payment" footer={<><Button variant="secondary" onClick={() => setOpenPay(false)}>Cancel</Button><Button onClick={collect}>Collect</Button></>}>
        {payRow && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 text-sm text-slate-500">{payRow.studentName} — {payRow.title} (Due {inr(payRow.due)})</div>
            <Field label="Amount"><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <Field label="Method">
              <Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </Select>
            </Field>
            <div className="col-span-2"><Field label="Reference"><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  </div>);
}
