import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { inr } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

type Item = { description: string; amount: string };

/** Edit an invoice's fee line items + Less/Fine/Due, and the student's Free & Transport flags. */
export function FeeEditDialog({ open, invoiceId, studentId, onClose, onSaved }: {
  open: boolean; invoiceId: number | null; studentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [less, setLess] = useState('');
  const [fine, setFine] = useState('');
  const [feeFree, setFeeFree] = useState(false);
  const [usesTransport, setUsesTransport] = useState(false);
  const [transportFee, setTransportFee] = useState('');

  useEffect(() => {
    if (!open || !invoiceId || !studentId) return;
    setLoading(true);
    Promise.all([api.get(`/fees/${invoiceId}`), api.get(`/students/${studentId}`)])
      .then(([inv, stu]) => {
        const i = inv.data, s = stu.data;
        setTitle(i.title || '');
        setDueDate(i.dueDate ? String(i.dueDate).slice(0, 10) : '');
        setItems((i.items || []).map((it: any) => ({ description: it.description, amount: String(it.amount) })));
        setLess(i.discount ? String(i.discount) : '');
        setFine(i.fine ? String(i.fine) : '');
        setFeeFree(!!s.feeFree);
        setUsesTransport(!!s.usesTransport);
        setTransportFee(s.transportFee != null ? String(s.transportFee) : '');
      })
      .catch((e) => toast(apiError(e), 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [open, invoiceId, studentId]);

  const setItem = (idx: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const addItem = () => setItems((xs) => [...xs, { description: '', amount: '' }]);
  const removeItem = (idx: number) => setItems((xs) => xs.filter((_, i) => i !== idx));

  const gross = items.reduce((a, x) => a + Number(x.amount || 0), 0);
  const grand = gross + Number(fine || 0) - Number(less || 0);

  async function save() {
    try {
      await api.put(`/students/${studentId}`, {
        feeFree, usesTransport, transportFee: transportFee === '' ? null : Number(transportFee),
      });
      await api.put(`/fees/${invoiceId}`, {
        title, dueDate, discount: Number(less || 0), fine: Number(fine || 0),
        items: items.filter((x) => x.description).map((x) => ({ description: x.description, amount: Number(x.amount || 0) })),
      });
      toast('Fees updated'); onSaved(); onClose();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-2xl"
        title="Edit Fees"
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save Changes</Button></>}
      >
        {loading ? <Loading label="Loading fees…" /> : (
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bill Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Due Date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
            </div>

            <div className="mt-4 mb-2 flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">Fee Items</div>
              <Button size="sm" variant="outline" onClick={addItem}>+ Add Fee</Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-7"><Input placeholder="Description" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} /></div>
                  <div className="col-span-4"><Input type="number" placeholder="Amount" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} /></div>
                  <div className="col-span-1 flex items-center justify-center">
                    <Button size="icon" variant="ghost" className="text-red-600" onClick={() => removeItem(i)}>×</Button>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-slate-400">No fee items. Add one above.</div>}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Less (deduction)"><Input type="number" value={less} onChange={(e) => setLess(e.target.value)} /></Field>
              <Field label="Fine"><Input type="number" value={fine} onChange={(e) => setFine(e.target.value)} /></Field>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-medium text-slate-600">Options</div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={feeFree} onChange={(e) => setFeeFree(e.target.checked)} className="size-4 accent-[#262081]" />
                Free — waive monthly tuition fee (future bills)
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={usesTransport} onChange={(e) => setUsesTransport(e.target.checked)} className="size-4 accent-[#262081]" />
                  Uses transport service
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Transport fee</span>
                  <Input type="number" className="w-28" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} disabled={!usesTransport} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-4 text-sm">
              <span className="text-slate-500">Sub Total: <b className="text-slate-700">{inr(gross)}</b></span>
              <div className="rounded-lg bg-brand-50 px-4 py-2 text-right">
                <div className="text-xs text-brand">Grand Total</div>
                <div className="text-lg font-bold text-brand">{inr(grand)}</div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
