import { Download } from 'lucide-react';
import { useFetch } from '@/lib/useFetch';
import { usePdfViewer } from '@/components/PdfViewer';
import { formatBS } from '@/lib/nepaliDate';
import { PageHeader, Loading } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/** Accounting-style amount: negatives in parentheses. */
function acct(n: number) {
  const v = Math.abs(Math.round(n)).toLocaleString('en-IN');
  return n < 0 ? `(${v})` : v;
}

function Row({ label, value, bold, indent, color }: { label: string; value: number; bold?: boolean; indent?: boolean; color?: string }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
      <span className={indent ? 'pl-4' : ''} style={color ? { color } : undefined}>{label}</span>
      <span className={`tabular-nums ${bold ? '' : ''}`} style={color ? { color } : undefined}>{acct(value)}</span>
    </div>
  );
}

export default function AuditReport() {
  const { data, loading } = useFetch<any>('/reports/audit');
  const openPdf = usePdfViewer();
  if (loading || !data) return <Loading />;

  const ie = data.incomeExpenditure;
  const bs = data.balanceSheet;
  const surplus = ie.surplus;

  return (
    <div>
      <PageHeader
        title="Audit Report"
        subtitle={`NFRS · As on ${formatBS(data.generatedAt)} · All figures in ${data.currency}`}
        actions={<Button onClick={() => openPdf({ url: '/pdf/audit', filename: 'audit-report.pdf', title: 'Audit Report' })}><Download className="size-4" /> View PDF</Button>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Income & Expenditure */}
        <Card>
          <CardHeader><CardTitle>Income &amp; Expenditure Statement</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Income</div>
            {ie.income.map((l: any) => <Row key={l.heading} label={l.heading} value={l.amount} indent />)}
            {ie.discounts > 0 && <Row label="Less: Discounts / Concessions" value={-ie.discounts} indent color="#b91c1c" />}
            <div className="my-1 border-t border-slate-200" />
            <Row label="Total Income" value={ie.totalIncome} bold />

            <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Expenditure</div>
            {ie.expenditure.map((l: any) => <Row key={l.heading} label={l.heading} value={l.amount} indent />)}
            <div className="my-1 border-t border-slate-200" />
            <Row label="Total Expenditure" value={ie.totalExpenditure} bold />

            <div className={`mt-4 flex items-center justify-between rounded-lg px-4 py-3 font-bold ${surplus >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              <span>{surplus >= 0 ? 'Surplus for the period' : 'Deficit for the period'}</span>
              <span className="tabular-nums">{acct(surplus)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Balance Sheet */}
        <Card>
          <CardHeader><CardTitle>Balance Sheet</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Assets</div>
            {bs.assets.map((l: any) => <Row key={l.heading} label={l.heading} value={l.amount} indent />)}
            <div className="my-1 border-t border-slate-200" />
            <Row label="Total Assets" value={bs.totalAssets} bold />

            <div className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Fund &amp; Liabilities</div>
            {bs.fund.map((l: any) => <Row key={l.heading} label={l.heading} value={l.amount} indent />)}
            {bs.liabilities.map((l: any) => <Row key={l.heading} label={l.heading} value={l.amount} indent />)}
            <div className="my-1 border-t border-slate-200" />
            <Row label="Total Fund &amp; Liabilities" value={bs.totalFundLiabilities} bold />

            <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Prepared on an accrual basis per Nepal Financial Reporting Standards (NFRS).
              Fees Receivable represents outstanding dues; opening fund balance assumed nil.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
