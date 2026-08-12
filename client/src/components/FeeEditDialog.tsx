import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { inr } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

/** Edit the student's running fee ledger: previous dues (carried forward, warning-gated),
 *  month-wise tuition + heading charges, Fine, and the Free & Transport toggles. */
export function FeeEditDialog({ open, studentId, onClose, onSaved }: {
  open: boolean; invoiceId?: number | null; studentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<{ year: number; month: number }>({ year: 0, month: 0 });
  const [monthly, setMonthly] = useState<any[]>([]);      // current + future months
  const [prevItems, setPrevItems] = useState<any[]>([]);  // original prior-month items (before current)
  const [prevDues, setPrevDues] = useState('');           // editable consolidated previous dues
  const [prevUnlocked, setPrevUnlocked] = useState(false);
  const [previousPaid, setPreviousPaid] = useState('');   // carried-forward opening payment
  const [paidUnlocked, setPaidUnlocked] = useState(false);
  const [warn, setWarn] = useState<null | 'dues' | 'paid'>(null);
  const [headings, setHeadings] = useState<any[]>([]);
  const [fine, setFine] = useState('');
  const [feeFree, setFeeFree] = useState(false);
  const [usesTransport, setUsesTransport] = useState(false);
  const [transportFee, setTransportFee] = useState('');

  useEffect(() => {
    if (!open || !studentId) return;
    setLoading(true);
    setPrevUnlocked(false); setPaidUnlocked(false); setWarn(null);
    api.get(`/fees/ledger/${studentId}`).then(({ data }) => {
      const { year, month } = data.session;
      setSession({ year, month });
      const all = data.monthly.map((m: any) => ({ ...m, amount: String(m.amount) }));
      // A consolidated "Previous Dues" line is always previous, whatever month it's stored at.
      const isPrev = (m: any) => m.description === 'Previous Dues' || m.bsYear < year || (m.bsYear === year && m.bsMonth < month);
      const prev = all.filter(isPrev);
      setPrevItems(prev);
      setPrevDues(String(prev.reduce((a: number, m: any) => a + Number(m.amount || 0), 0)));
      setMonthly(all.filter((m: any) => !isPrev(m)));
      setHeadings(data.headings.map((h: any) => ({ ...h, amount: String(h.amount) })));
      setFine(data.fine ? String(data.fine) : '');
      setPreviousPaid(data.previousPaid ? String(data.previousPaid) : '');
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

  const prevLabel = prevItems.length ? `Up to ${prevItems[prevItems.length - 1].label}` : 'Opening balance';
  const gross = Number(prevDues || 0)
    + monthly.reduce((a, m) => a + Number(m.amount || 0), 0)
    + headings.reduce((a, h) => a + Number(h.amount || 0), 0);
  const grand = gross + Number(fine || 0);

  function buildPrevPayload() {
    const origSum = prevItems.reduce((a, m) => a + Number(m.amount || 0), 0);
    const val = Number(prevDues || 0);
    const edited = Math.abs(val - origSum) > 0.001;
    const hasConsolidated = prevItems.some((m) => m.description === 'Previous Dues');
    // Keep the month-wise breakdown only while it's untouched and not already consolidated;
    // once edited or a "Previous Dues" line exists, collapse everything into one clean line
    // (this also merges any duplicate "Previous Dues" lines).
    if (!edited && !hasConsolidated) {
      return prevItems.map((m) => ({ bsYear: m.bsYear, bsMonth: m.bsMonth, description: m.description, amount: Number(m.amount || 0) }));
    }
    if (val === 0) return []; // cleared
    // Store one "Previous Dues" line strictly before the current billing month.
    const bsMonth = session.month === 1 ? 12 : session.month - 1;
    const bsYear = session.month === 1 ? session.year - 1 : session.year;
    return [{ bsYear, bsMonth, description: 'Previous Dues', amount: val }];
  }

  async function save() {
    try {
      await api.put(`/students/${studentId}`, { feeFree, usesTransport, transportFee: transportFee === '' ? null : Number(transportFee) });
      const monthlyPayload = [
        ...buildPrevPayload(),
        ...monthly.map((m) => ({ bsYear: m.bsYear, bsMonth: m.bsMonth, description: m.description, amount: Number(m.amount || 0) })),
      ];
      await api.put(`/fees/ledger/${studentId}`, {
        monthly: monthlyPayload,
        headings: headings.filter((h) => (h.description || h.label)).map((h) => ({ description: h.description || h.label, amount: Number(h.amount || 0) })),
        discount: 0, fine: Number(fine || 0), previousPaid: Number(previousPaid || 0),
      });
      toast('Fees updated'); onSaved(); onClose();
    } catch (e) { toast(apiError(e), 'error'); }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent
          className="max-w-2xl"
          title="Edit Fees"
          footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save Changes</Button></>}
        >
          {loading ? <Loading label="Loading fees…" /> : (
            <div className="space-y-4">
              {/* previous dues — carried forward, editing gated behind a warning */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-600">Previous Dues <span className="text-slate-400">(carried forward)</span></div>
                  {prevUnlocked
                    ? <span className="text-xs font-medium text-amber-600">Editing enabled</span>
                    : <Button size="sm" variant="outline" onClick={() => setWarn('dues')}>Edit</Button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-slate-600">{prevLabel}</span>
                  <Input type="number" value={prevDues} onChange={(e) => setPrevDues(e.target.value)} disabled={!prevUnlocked} />
                </div>
                {prevUnlocked && (
                  <p className="mt-2 text-xs text-amber-700">
                    Changing this overwrites the month-wise history for earlier months and directly affects the outstanding balance.
                  </p>
                )}
              </div>

              {/* previous paid — carried-forward opening payment, editing gated behind a warning */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-600">Previous Paid <span className="text-slate-400">(carried forward)</span></div>
                  {paidUnlocked
                    ? <span className="text-xs font-medium text-emerald-600">Editing enabled</span>
                    : <Button size="sm" variant="outline" onClick={() => setWarn('paid')}>Edit</Button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-slate-600">Opening paid</span>
                  <Input type="number" value={previousPaid} onChange={(e) => setPreviousPaid(e.target.value)} disabled={!paidUnlocked} />
                </div>
                {paidUnlocked && (
                  <p className="mt-2 text-xs text-emerald-700">
                    Records money already received before this ledger. It counts toward Paid and reduces the balance — it is not a printed receipt.
                  </p>
                )}
              </div>

              {/* month-wise tuition (current onward) */}
              <div>
                <div className="mb-2 text-sm font-medium text-slate-600">Monthly Tuition (auto-added each month)</div>
                <div className="grid grid-cols-2 gap-2">
                  {monthly.map((m, i) => (
                    <div key={m.id ?? i} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-sm text-slate-600">{m.label}</span>
                      <Input type="number" value={m.amount} onChange={(e) => setM(i, e.target.value)} />
                    </div>
                  ))}
                  {monthly.length === 0 && <div className="text-sm text-slate-400">No current month yet.</div>}
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

      {/* warning before unlocking a carried-forward field */}
      <Dialog open={!!warn} onOpenChange={(o) => { if (!o) setWarn(null); }}>
        <DialogContent
          className="max-w-md"
          title={warn === 'paid' ? 'Edit Previous Paid?' : 'Edit Previous Dues?'}
          footer={<>
            <Button variant="secondary" onClick={() => setWarn(null)}>Cancel</Button>
            <Button
              className={warn === 'paid' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}
              onClick={() => { if (warn === 'paid') setPaidUnlocked(true); else setPrevUnlocked(true); setWarn(null); }}
            >Yes, edit</Button>
          </>}
        >
          {warn === 'paid' ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-emerald-700">⚠ You are about to edit carried-forward Previous Paid.</p>
              <p>This is money treated as already received before this ledger began. Changing it directly increases or decreases the student's Paid total and the balance due.</p>
              <p>Only proceed to record a genuine opening/advance payment or correct one.</p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-600">
              <p className="font-medium text-amber-700">⚠ You are about to edit carried-forward Previous Dues.</p>
              <p>This is the consolidated balance from earlier months. Changing it overwrites the month-wise history for those months and directly changes the student's outstanding total.</p>
              <p>Only proceed to correct an opening balance or a historical dues figure.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
