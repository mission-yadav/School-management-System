import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

const TYPE_ICONS: Record<string, string> = {
  student: '🎓', teacher: '👩‍🏫', parent: '👪', receipt: '🧾',
  certificate: '📜', book: '📚', vehicle: '🚌',
};

type Mode = 'name' | 'iemis';
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'name', label: 'Name', hint: 'Search everything by name…' },
  { key: 'iemis', label: 'IEMIS', hint: 'Enter an IEMIS student ID…' },
];

export default function GlobalSearch() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('name');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?by=${mode}&q=${encodeURIComponent(query)}`);
        if (!cancelled) setResults(data?.results || []);
      } catch (err) {
        if (!cancelled) { setResults([]); toast({ title: 'Search failed', description: apiError(err), variant: 'destructive' }); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [q, mode]);

  function openResult(r: any) {
    if (r.type === 'student') navigate(`/students/${r.id}`);
  }

  const activeMode = MODES.find((m) => m.key === mode)!;

  return (
    <div className="space-y-6">
      <PageHeader title="Global Search" subtitle="Find students, staff, receipts and more" />

      {/* mode toggle: Name / IEMIS */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
              mode === m.key ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={activeMode.hint}
        className="text-lg"
        inputMode={mode === 'iemis' ? 'numeric' : 'text'}
      />

      {q.trim().length < 1 ? (
        <EmptyState title="Start typing" description={mode === 'iemis' ? 'Look up a student by their IEMIS ID.' : 'Search across all records in the system.'} />
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState title="No results" description={`Nothing matched “${q}” by ${activeMode.label}.`} />
      ) : (
        <div className="space-y-3">
          {results.map((r: any) => (
            <Card
              key={`${r.type}-${r.id}`}
              className={r.type === 'student' ? 'cursor-pointer transition-colors hover:border-brand-200' : ''}
              onClick={() => openResult(r)}
            >
              <CardContent className="flex items-center gap-4 py-4">
                <span className="text-2xl">{TYPE_ICONS[r.type] || '🔍'}</span>
                <div className="flex-1">
                  <div className="font-medium text-slate-800">{r.label}</div>
                  {r.sublabel && <div className="text-sm text-slate-500">{r.sublabel}</div>}
                </div>
                <Badge>{r.type}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
