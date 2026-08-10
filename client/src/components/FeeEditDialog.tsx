import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { inr } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

/** Edit the student's running fee ledger: month-wise tuition + heading charges (all editable),
 *  Less/Fine, and the Free & Transport toggles. */
export function FeeEditDialog({ open, studentId, onClose, onSaved }: {
  open: boolean; invoiceId?: number | null; studentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [monthly, setMonthly] = useState<any[]>([]);
  const [headings, setHeadings] = useState<any[]>([]);
  const [fine, setFine] = useState('');
  const [feeFree, setFeeFree] = useState(false);
  const [usesTransport, setUsesTransport] = useState(false);
  const [transportFee, setTransportFee] = useState('');

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    api.get(`/fees/ledger/${studentId}`).then(({ data }) => {
      setMonthly(data.monthly.map((m: any) => ({ ...m, amount: String(m.amount) })));
      setHeadings(data.headings.map((h: any) => ({ ...h, amount: String(h.amount) })));
      setFine(data.fine ? String(data.fine) : '');
      setFeeFree(!!data.student.feeFree);
      setUsesTransport(!!data.student.usesTransport);
      setTransportFee(data.student.transportFee != null ? String(data.student.transportFee) : '');
    }).catch((e) => toast(apiError(e), 'error')).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, [open, studentId]);

  const setM = (i: number, v: string) => setMonthly((xs) => xs.map((x, idx) => (idx === i ? { ...x, amount: v } : x)));
  const setH = (i: number, patch: any) => setHeadings((xs) => xs.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addH = () => setHeadings((xs) => [...xs, { label: '', description: '', amount: '' }]);
  const removeH = (i: number) => setHeadings((xs) => xs.filter((_, idx) => idx !== i));

  const gross = monthly.reduce((a, m) => a + Number(m.amount || 0), 0) + headings.reduce((a, h) => a + Number(h.amount || 0), 0);
  const grand = gross + Number(fine || 0);

  async function save() {
    try {
      await api.put(`/students/${studentId}`, { feeFree, usesTransport, transportFee: transportFee === '' ? null : Number(transportFee) });
      await api.put(`/fees/ledger/${studentId}`, {
        monthly: monthly.map((m) => ({ bsYear: m.bsYear, bsMonth: m.bsMonth, description: m.description, amount: Number(m.amount || 0) })),
        headings: headings.filter((h) => (h.description || h.label)).map((h) => ({ description: h.description || h.label, amount: Number(h.amount || 0) })),
        discount: 0, fine: Number(fine || 0),
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
          <div className="space-y-4">
            {/* month-wise tuition */}
            <div>
              <div className="mb-2 text-sm font-medium text-slate-600">Monthly Tuition (auto-added each month)</div>
              <div className="grid grid-cols-2 gap-2">
                {monthly.map((m, i) => (
                  <div key={m.id ?? i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-slate-600">{m.label}</span>
                    <Input type="number" value={m.amount} onChange={(e) => setM(i, e.target.value)} />
                  </div>
                ))}
                {monthly.length === 0 && <div className="text-sm text-slate-400">No months yet.</div>}
              </div>
            </div>

            {/* headings */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-600">Other Charges</div>
                <Button size="sm" variant="outline" onClick={addH}>+ Add Charge</Button>
              </div>
              <div className="space-y-2">
                {headings.map((h, i) => (
                  <div key={h.id ?? i} className="grid grid-cols-12 gap-2">
                    <div className="col-span-7"><Input placeholder="Description" value={h.description ?? h.label ?? ''} onChange={(e) => setH(i, { description: e.target.value, label: e.target.value })} /></div>
                    <div className="col-span-4"><Input type="number" placeholder="Amount" value={h.amount} onChange={(e) => setH(i, { amount: e.target.value })} /></div>
                    <div className="col-span-1 flex items-center justify-center"><Button size="icon" variant="ghost" className="text-red-600" onClick={() => removeH(i)}>×</Button></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fine / Late Fee"><Input type="number" value={fine} onChange={(e) => setFine(e.target.value)} /></Field>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-medium text-slate-600">Options</div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={feeFree} onChange={(e) => setFeeFree(e.target.checked)} className="size-4 accent-[#262081]" />
                Free — waive monthly tuition for upcoming months
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={usesTransport} onChange={(e) => setUsesTransport(e.target.checked)} className="size-4 accent-[#262081]" />
                  Uses transport service
                </label>
                <div className="flex items-center gap-2"><span className="text-sm text-slate-500">Transport fee</span>
                  <Input type="number" className="w-28" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} disabled={!usesTransport} /></div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 text-sm">
              <span className="text-slate-500">Sub Total: <b className="text-slate-700">{inr(gross)}</b></span>
              <div className="rounded-lg bg-brand-50 px-4 py-2 text-right"><div className="text-xs text-brand">Grand Total</div><div className="text-lg font-bold text-brand">{inr(grand)}</div></div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
