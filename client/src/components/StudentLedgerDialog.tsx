import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { inr } from '@/lib/utils';
import { formatBS } from '@/lib/nepaliDate';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

export interface LedgerPreview { url: string; filename: string; title: string; }

/** Group month-wise tuition items by BS year (ascending), months ordered within. */
function monthlyByYear(monthly: any[]) {
  const map = new Map<number, any[]>();
  for (const m of monthly) {
    const y = m.bsYear ?? 0;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(m);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, items]) => ({
      year,
      items: items.sort((a, b) => (a.bsMonth || 0) - (b.bsMonth || 0)),
      total: items.reduce((s, x) => s + Number(x.amount || 0), 0),
    }));
}

/** Running fee ledger: month-wise tuition + heading charges, dues, and payment history. */
export function StudentLedgerDialog({ open, studentId, onClose, onPreview }: {
  open: boolean; studentId: number | null; onClose: () => void; onPreview: (p: LedgerPreview) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    if (!open || !studentId) { setD(null); return; }
    setD(null);
    api.get(`/fees/ledger/${studentId}`).then(({ data }) => setD(data))
      .catch((e) => { toast(apiError(e), 'error'); onClose(); });
    // eslint-disable-next-line
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-3xl"
        title="Student Fee Ledger"
        footer={<>
          <Button variant="outline" onClick={() => d && onPreview({ url: `/pdf/intimation/${d.invoiceId}`, filename: 'intimation.pdf', title: 'Fee Intimation Card' })}>Intimation</Button>
          {d?.payments?.length ? <Button variant="outline" onClick={() => onPreview({ url: `/pdf/receipt/invoice/${d.invoiceId}`, filename: 'receipt.pdf', title: 'Fee Receipt' })}>Full Receipt</Button> : null}
        </>}
      >
        {!d ? <Loading label="Loading ledger…" /> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-800">{d.student.name}</span>
              {d.student.feeFree && <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">FREE</span>}
              {d.student.usesTransport && <Badge variant="blue">Transport</Badge>}
              <span className="text-sm text-slate-500">IEMIS {d.student.iemis || '—'} · {d.student.className || '—'}</span>
              <span className="ml-auto text-sm text-slate-400">As on {d.session.monthName} {d.session.year}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Total Billed</div><div className="text-lg font-bold text-slate-800">{inr(d.totals.billed)}</div></div>
              <div className="rounded-lg bg-green-50 p-3"><div className="text-xs text-slate-500">Total Paid</div><div className="text-lg font-bold text-green-600">{inr(d.totals.paid)}</div></div>
              <div className="rounded-lg bg-red-50 p-3"><div className="text-xs text-slate-500">Dues</div><div className="text-lg font-bold text-red-600">{inr(d.totals.due)}</div></div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* month-wise tuition, grouped by BS year */}
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">Monthly Tuition (year &amp; month wise)</div>
                <div className="rounded-lg border border-slate-200">
                  {monthlyByYear(d.monthly).map((grp) => (
                    <div key={grp.year}>
                      <div className="flex justify-between bg-slate-50 px-3 py-1 text-xs font-semibold text-brand">
                        <span>Year {grp.year}</span><span className="tabular-nums">{inr(grp.total)}</span>
                      </div>
                      {grp.items.map((m: any) => (
                        <div key={m.id} className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-0">
                          <span className="pl-2 text-slate-600">{String(m.label).replace(/\s+\d{4}$/, '')}</span><span className="tabular-nums font-medium">{inr(m.amount)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {d.monthly.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">None</div>}
                </div>
              </div>
              {/* headings */}
              <div>
                <div className="mb-2 text-sm font-semibold text-slate-600">Other Charges</div>
                <div className="rounded-lg border border-slate-200">
                  {d.headings.map((h: any) => (
                    <div key={h.id} className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-0">
                      <span className="text-slate-600">{h.label}</span><span className="tabular-nums font-medium">{inr(h.amount)}</span>
                    </div>
                  ))}
                  {d.discount > 0 && <div className="flex justify-between px-3 py-1.5 text-sm text-red-600"><span>Less</span><span>- {inr(d.discount)}</span></div>}
                  {d.fine > 0 && <div className="flex justify-between px-3 py-1.5 text-sm"><span>Fine</span><span>{inr(d.fine)}</span></div>}
                  {d.headings.length === 0 && !d.discount && !d.fine && <div className="px-3 py-2 text-sm text-slate-400">None</div>}
                </div>
              </div>
            </div>

            {/* payment history */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-600">Payment History</div>
              {d.payments.length === 0 ? <div className="text-sm text-slate-400">No payments recorded.</div> : (
                <Table>
                  <THead><TR className="hover:bg-transparent"><TH>Date</TH><TH>Receipt No</TH><TH>Mode</TH><TH className="text-right">Amount</TH><TH className="text-right">Less</TH><TH></TH></TR></THead>
                  <TBody>
                    {d.payments.map((p: any) => (
                      <TR key={p.id}>
                        <TD>{formatBS(p.paidAt)}</TD>
                        <TD className="font-mono text-xs">{p.receiptNo}</TD>
                        <TD>{p.method}</TD>
                        <TD className="text-right">{inr(p.amount)}</TD>
                        <TD className="text-right text-red-600">{p.less ? inr(p.less) : '—'}</TD>
                        <TD><Button size="sm" variant="ghost" onClick={() => onPreview({ url: `/pdf/receipt/${p.id}`, filename: `${String(p.receiptNo).replace(/\//g, '-')}.pdf`, title: 'Fee Receipt' })}>Receipt</Button></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
