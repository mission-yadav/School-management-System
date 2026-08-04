import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { SearchModeToggle, type SearchMode as Mode } from '@/components/SearchModeToggle';

const TYPE_ICONS: Record<string, string> = {
  student: '🎓', teacher: '👩‍🏫', parent: '👪', receipt: '🧾',
  certificate: '📜', book: '📚', vehicle: '🚌',
};

const HINTS: Record<Mode, string> = {
  name: 'Search everything by name…',
  iemis: 'Enter an IEMIS student ID…',
};

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

  return (
    <div className="space-y-6">
      <PageHeader title="Global Search" subtitle="Find students, staff, receipts and more" />

      {/* mode toggle: Name / IEMIS */}
      <SearchModeToggle value={mode} onChange={setMode} />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={HINTS[mode]}
        className="text-lg"
        inputMode={mode === 'iemis' ? 'numeric' : 'text'}
      />

      {q.trim().length < 1 ? (
        <EmptyState title="Start typing" description={mode === 'iemis' ? 'Look up a student by their IEMIS ID.' : 'Search across all records in the system.'} />
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState title="No results" description={`Nothing matched “${q}” by ${mode === 'iemis' ? 'IEMIS' : 'Name'}.`} />
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
