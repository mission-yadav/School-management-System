import { useState } from 'react';
import api, { apiError } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { inr } from '@/lib/utils';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input, Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';

export default function Expenses() {
  const toast = useToast();
  const [month, setMonth] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (categoryId) params.set('categoryId', categoryId);
  const qs = params.toString();
  const url = `/expenses${qs ? `?${qs}` : ''}`;

  const { data, loading, refetch } = useFetch<any[]>(url, [month, categoryId]);
  const { data: summary } = useFetch<any>('/expenses/summary', [month, categoryId]);
  const { data: categories, refetch: refetchCats } = useFetch<any[]>('/expenses/categories');
  const { data: vendors } = useFetch<any[]>('/expenses/vendors');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: '', amount: '', date: '', method: 'CASH', note: '', categoryId: '', vendorId: '' });
  const [newCat, setNewCat] = useState('');

  function startNew() {
    setForm({ title: '', amount: '', date: '', method: 'CASH', note: '', categoryId: '', vendorId: '' });
    setNewCat('');
    setOpen(true);
  }
  async function save() {
    try {
      await api.post('/expenses', {
        title: form.title,
        amount: form.amount ? Number(form.amount) : 0,
        date: form.date,
        method: form.method,
        note: form.note,
        categoryId: form.categoryId ? Number(form.categoryId) : undefined,
        vendorId: form.vendorId ? Number(form.vendorId) : undefined,
      });
      toast('Expense added'); setOpen(false); refetch();
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function addCategory() {
    if (!newCat.trim()) return;
    try {
      const res = await api.post('/expenses/categories', { name: newCat.trim() });
      toast('Category added'); setNewCat('');
      await refetchCats();
      if (res.data?.id) setForm((f: any) => ({ ...f, categoryId: String(res.data.id) }));
    } catch (e) { toast(apiError(e), 'error'); }
  }
  async function remove(id: number) {
    if (!confirm('Delete expense?')) return;
    try { await api.delete(`/expenses/${id}`); toast('Deleted'); refetch(); }
    catch (e) { toast(apiError(e), 'error'); }
  }

  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', render: (r) => (r.date ? new Date(r.date).toLocaleDateString() : '—') },
    { key: 'title', header: 'Title', render: (r) => r.title },
    { key: 'categoryName', header: 'Category', render: (r) => r.categoryName || '—' },
    { key: 'vendorName', header: 'Vendor', render: (r) => r.vendorName || '—' },
    { key: 'method', header: 'Method', render: (r) => r.method },
    { key: 'amount', header: 'Amount', render: (r) => inr(r.amount) },
    {
      key: 'a', header: '', render: (r) => (
        <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(r.id)}>Delete</Button>
      ),
    },
  ];

  return (<div>
    <PageHeader title="Expenses" subtitle="Track school spending" actions={<Button onClick={startNew}>+ Add Expense</Button>} />

    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <Card className="md:col-span-1"><CardContent className="pt-5">
        <div className="text-sm text-slate-500">Total</div>
        <div className="text-2xl font-bold text-slate-800">{inr(summary?.total || 0)}</div>
      </CardContent></Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle>By Category</CardTitle></CardHeader>
        <CardContent>
          {(summary?.byCategory || []).length === 0 ? (
            <div className="text-sm text-slate-400">No data.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {(summary?.byCategory || []).map((c: any, i: number) => (
                <li key={i} className="flex justify-between">
                  <span className="text-slate-600">{c.category || '—'}</span>
                  <span className="font-medium text-slate-800">{inr(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>

    <div className="mb-4 flex flex-wrap gap-3">
      <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48" />
      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48">
        <option value="">All Categories</option>
        {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
    </div>

    {loading ? <Loading /> : <DataTable columns={columns} rows={data || []} />}

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Add Expense" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field></div>
          <Field label="Amount"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Method">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="CASH">Cash</option>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Select category</option>
              {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Vendor">
            <Select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}>
              <option value="">None</option>
              {(vendors || []).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <div className="col-span-2"><Field label="Note"><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field></div>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-sm font-medium text-slate-600">Add Category</div>
          <div className="flex gap-2">
            <Input placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <Button variant="outline" onClick={addCategory}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>);
}
