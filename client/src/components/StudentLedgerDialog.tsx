import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { inr } from '@/lib/utils';
import { formatBS } from '@/lib/nepaliDate';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Loading } from '@/components/PageHeader';
import { useToast } from '@/components/ui/toast';

export interface LedgerPreview { url: string; filename: string; title: string; }

/** Full fee ledger for a student: previous dues, annual/monthly breakdown, payment history. */
export function StudentLedgerDialog({ open, studentId, onClose, onPreview }: {
  open: boolean; studentId: number | null; onClose: () => void; onPreview: (p: LedgerPreview) => void;
}) {
  const toast = useToast();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!open || !studentId) { setData(null); return; }
    setData(null);
    api.get(`/fees/ledger/${studentId}`).then(({ data }) => setData(data))
      .catch((e) => { toast(apiError(e), 'error'); onClose(); });
    // eslint-disable-next-line
  }, [open, studentId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-3xl"
        title="Student Fee Ledger"
        footer={data?.payments?.length ? <Button variant="outline" onClick={() => onPreview({ url: `/pdf/receipt/invoice/${data.invoices[data.invoices.length - 1].id}`, filename: 'receipt.pdf', title: 'Fee Receipt' })}>Latest Receipt</Button> : undefined}
      >
        {!data ? <Loading label="Loading ledger…" /> : (
          <div className="space-y-5">
            {/* header */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-slate-800">{data.student.name}</span>
              {data.student.feeFree && <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">FREE</span>}
              {data.student.usesTransport && <Badge variant="blue">Transport</Badge>}
              <span className="text-sm text-slate-500">IEMIS {data.student.iemis || '—'} · {data.student.className || '—'}</span>
            </div>

            {/* summary — previous/overall dues */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Total Billed</div><div className="text-lg font-bold text-slate-800">{inr(data.totals.billed)}</div></div>
              <div className="rounded-lg bg-green-50 p-3"><div className="text-xs text-slate-500">Total Paid</div><div className="text-lg font-bold text-green-600">{inr(data.totals.paid)}</div></div>
              <div className="rounded-lg bg-red-50 p-3"><div className="text-xs text-slate-500">Dues (incl. previous)</div><div className="text-lg font-bold text-red-600">{inr(data.totals.due)}</div></div>
            </div>

            {/* fee breakdown per bill */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-600">Fee Breakdown</div>
              {data.invoices.length === 0 ? <div className="text-sm text-slate-400">No bills yet.</div> : (
                <div className="space-y-3">
                  {data.invoices.map((inv: any) => (
                    <div key={inv.id} className="rounded-lg border border-slate-200">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                        <div className="text-sm font-medium text-slate-800">{inv.title}{inv.sessionLabel ? ` · ${inv.sessionLabel}` : ''}</div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>{formatBS(inv.createdAt)}</span>
                          <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                        </div>
                      </div>
                      <div className="px-3 py-2">
                        {inv.items.map((it: any, i: number) => (
                          <div key={i} className="flex justify-between py-0.5 text-sm text-slate-600">
                            <span>{it.description}</span><span className="tabular-nums">{inr(it.amount)}</span>
                          </div>
                        ))}
                        {inv.discount > 0 && <div className="flex justify-between py-0.5 text-sm text-red-600"><span>Less</span><span>- {inr(inv.discount)}</span></div>}
                        {inv.fine > 0 && <div className="flex justify-between py-0.5 text-sm text-slate-600"><span>Fine</span><span>{inr(inv.fine)}</span></div>}
                        <div className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-sm font-semibold">
                          <span>Total {inr(inv.total)} · Paid {inr(inv.paid)}</span>
                          <span className={inv.due > 0 ? 'text-red-600' : 'text-green-600'}>Due {inr(inv.due)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* payment history */}
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-600">Payment History</div>
              {data.payments.length === 0 ? <div className="text-sm text-slate-400">No payments recorded.</div> : (
                <Table>
                  <THead><TR className="hover:bg-transparent"><TH>Date</TH><TH>Receipt No</TH><TH>For</TH><TH>Mode</TH><TH className="text-right">Amount</TH><TH></TH></TR></THead>
                  <TBody>
                    {data.payments.map((p: any) => (
                      <TR key={p.id}>
                        <TD>{formatBS(p.paidAt)}</TD>
                        <TD className="font-mono text-xs">{p.receiptNo}</TD>
                        <TD className="text-xs text-slate-500">{p.invoiceTitle}</TD>
                        <TD>{p.method}</TD>
                        <TD className="text-right">{inr(p.amount)}</TD>
                        <TD><Button size="sm" variant="ghost" onClick={() => onPreview({ url: `/pdf/receipt/${p.id}`, filename: `${p.receiptNo}.pdf`, title: 'Fee Receipt' })}>Receipt</Button></TD>
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
