import { useMemo, useState } from 'react';
import { ChevronRight, Wallet } from 'lucide-react';
import { useFetch } from '@/lib/useFetch';
import { usePdfViewer } from '@/components/PdfViewer';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { inr } from '@/lib/utils';

type Row = {
  id: number; paidAt: string; amount: number; method: string;
  studentId: number; studentName: string; className: string | null;
  bsYear: number; bsMonth: number; bsMonthName: string; bsDay: number; dateLabel: string;
};

export default function CollectionRecords() {
  const openPdf = usePdfViewer();
  const { data, loading } = useFetch<Row[]>('/collections');
  const rows = data || [];

  const [q, setQ] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState<number | null>(null);

  // search filters the whole dataset so totals at every level reflect it
  const base = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.studentName.toLowerCase().includes(s) || (r.className || '').toLowerCase().includes(s));
  }, [rows, q]);

  const years = useMemo(() => {
    const m = new Map<number, { count: number; total: number }>();
    for (const r of base) { const g = m.get(r.bsYear) || { count: 0, total: 0 }; g.count++; g.total += r.amount; m.set(r.bsYear, g); }
    return [...m.entries()].map(([y, v]) => ({ year: y, ...v })).sort((a, b) => b.year - a.year);
  }, [base]);

  const months = useMemo(() => {
    if (year == null) return [];
    const m = new Map<number, { count: number; total: number; name: string }>();
    for (const r of base) if (r.bsYear === year) { const g = m.get(r.bsMonth) || { count: 0, total: 0, name: r.bsMonthName }; g.count++; g.total += r.amount; m.set(r.bsMonth, g); }
    return [...m.entries()].map(([mo, v]) => ({ month: mo, ...v })).sort((a, b) => b.month - a.month);
  }, [base, year]);

  const days = useMemo(() => {
    if (year == null || month == null) return [];
    const m = new Map<number, { count: number; total: number; label: string }>();
    for (const r of base) if (r.bsYear === year && r.bsMonth === month) { const g = m.get(r.bsDay) || { count: 0, total: 0, label: r.dateLabel }; g.count++; g.total += r.amount; m.set(r.bsDay, g); }
    return [...m.entries()].map(([d, v]) => ({ day: d, ...v })).sort((a, b) => b.day - a.day);
  }, [base, year, month]);

  const detail = useMemo(() => {
    if (year == null || month == null || day == null) return [];
    return base
      .filter((r) => r.bsYear === year && r.bsMonth === month && r.bsDay === day)
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [base, year, month, day]);

  const level = day != null ? 'detail' : month != null ? 'days' : year != null ? 'months' : 'years';
  const monthName = months.find((m) => m.month === month)?.name || (rows.find((r) => r.bsMonth === month)?.bsMonthName ?? '');
  const dayLabel = detail[0]?.dateLabel || days.find((d) => d.day === day)?.label || '';

  const scopeTotal =
    level === 'detail' ? detail.reduce((a, r) => a + r.amount, 0)
    : level === 'days' ? days.reduce((a, d) => a + d.total, 0)
    : level === 'months' ? months.reduce((a, m) => a + m.total, 0)
    : years.reduce((a, y) => a + y.total, 0);
  const scopeCount =
    level === 'detail' ? detail.length
    : level === 'days' ? days.reduce((a, d) => a + d.count, 0)
    : level === 'months' ? months.reduce((a, m) => a + m.count, 0)
    : years.reduce((a, y) => a + y.count, 0);

  const goYears = () => { setYear(null); setMonth(null); setDay(null); };
  const goYear = (y: number) => { setYear(y); setMonth(null); setDay(null); };
  const goMonth = (mo: number) => { setMonth(mo); setDay(null); };

  const crumb = (label: string, onClick?: () => void, active = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={active ? 'font-semibold text-slate-900' : onClick ? 'text-[#262081] hover:underline' : 'text-slate-500'}
    >
      {label}
    </button>
  );

  return (
    <div>
      <PageHeader title="Collection Record" subtitle="Payment collections by year, month and day — with viewable receipts" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Card className="flex-1 min-w-[220px]">
          <CardContent className="flex items-center gap-3 py-4">
            <div className="grid size-10 place-items-center rounded-xl bg-[#262081]/10 text-[#262081]"><Wallet className="size-5" /></div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Collected {level !== 'years' ? '(this view)' : '(all time)'}</div>
              <div className="text-xl font-semibold text-slate-900">{inr(scopeTotal)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="py-4">
            <div className="text-xs uppercase tracking-wide text-slate-500"># Collections</div>
            <div className="text-xl font-semibold text-slate-900">{scopeCount.toLocaleString('en-IN')}</div>
          </CardContent>
        </Card>
        <div className="min-w-[220px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or class…" />
        </div>
      </div>

      {/* breadcrumb */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        {crumb('All Years', level !== 'years' ? goYears : undefined, level === 'years')}
        {year != null && (<><ChevronRight className="size-4 text-slate-400" />{crumb(`BS ${year}`, level !== 'months' ? () => goYear(year) : undefined, level === 'months')}</>)}
        {month != null && (<><ChevronRight className="size-4 text-slate-400" />{crumb(`${monthName} ${year}`, level !== 'days' ? () => goMonth(month) : undefined, level === 'days')}</>)}
        {day != null && (<><ChevronRight className="size-4 text-slate-400" />{crumb(dayLabel, undefined, true)}</>)}
      </div>

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <EmptyState title="No collections yet" description="Fee payments will appear here as they are recorded." />
      ) : level === 'years' ? (
        <Table>
          <THead><TR><TH>Year (BS)</TH><TH className="text-right">Amount Collected</TH><TH></TH></TR></THead>
          <TBody>
            {years.map((y) => (
              <TR key={y.year} className="cursor-pointer" onClick={() => goYear(y.year)}>
                <TD className="font-medium text-slate-900">BS {y.year}</TD>
                <TD className="text-right font-medium">{inr(y.total)}</TD>
                <TD className="text-right"><ChevronRight className="size-4 text-slate-400" /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : level === 'months' ? (
        <Table>
          <THead><TR><TH>Month</TH><TH className="text-right">Amount Collected</TH><TH></TH></TR></THead>
          <TBody>
            {months.map((m) => (
              <TR key={m.month} className="cursor-pointer" onClick={() => goMonth(m.month)}>
                <TD className="font-medium text-slate-900">{m.name} {year}</TD>
                <TD className="text-right font-medium">{inr(m.total)}</TD>
                <TD className="text-right"><ChevronRight className="size-4 text-slate-400" /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : level === 'days' ? (
        <Table>
          <THead><TR><TH>Date</TH><TH className="text-right">Amount Collected</TH><TH></TH></TR></THead>
          <TBody>
            {days.map((d) => (
              <TR key={d.day} className="cursor-pointer" onClick={() => setDay(d.day)}>
                <TD className="font-medium text-slate-900">{d.label}</TD>
                <TD className="text-right font-medium">{inr(d.total)}</TD>
                <TD className="text-right"><ChevronRight className="size-4 text-slate-400" /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <Table>
          <THead><TR><TH>SN</TH><TH>Date</TH><TH>Name</TH><TH>Class</TH><TH className="text-right">Amount Collected</TH><TH className="text-right">Receipt</TH></TR></THead>
          <TBody>
            {detail.map((r, i) => (
              <TR key={r.id}>
                <TD className="text-slate-500">{i + 1}</TD>
                <TD>{r.dateLabel}</TD>
                <TD className="font-medium text-slate-900">{r.studentName}</TD>
                <TD>{r.className || '—'}</TD>
                <TD className="text-right font-medium">{inr(r.amount)}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openPdf({ url: `/pdf/receipt/${r.id}`, filename: `receipt-${r.studentName.replace(/\s+/g, '-')}.pdf`, title: `Fee Receipt — ${r.studentName}` })}
                  >
                    View Receipt
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
