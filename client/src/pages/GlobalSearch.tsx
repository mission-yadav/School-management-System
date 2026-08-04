import { useEffect, useState } from 'react';
import api, { apiError } from '@/lib/api';
import { PageHeader, Loading, EmptyState } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';

const TYPE_ICONS: Record<string, string> = {
  student: '🎓',
  teacher: '👩‍🏫',
  parent: '👪',
  receipt: '🧾',
  certificate: '📜',
  book: '📚',
  vehicle: '🚌',
};

export default function GlobalSearch() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(query)}`);
        if (!cancelled) setResults(data?.results || []);
      } catch (err) {
        if (!cancelled) {
          setResults([]);
          toast({ title: 'Search failed', description: apiError(err), variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Global Search" subtitle="Find students, staff, receipts and more" />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search everything…"
        className="text-lg"
      />

      {q.trim().length < 1 ? (
        <EmptyState title="Start typing" description="Search across all records in the system." />
      ) : loading ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState title="No results" description={`Nothing matched “${q}”.`} />
      ) : (
        <div className="space-y-3">
          {results.map((r: any) => (
            <Card key={`${r.type}-${r.id}`}>
              <CardContent className="flex items-center gap-4 py-4">
                <span className="text-2xl">{TYPE_ICONS[r.type] || '🔍'}</span>
                <div className="flex-1">
                  <div className="font-medium">{r.label}</div>
                  {r.sublabel && <div className="text-sm text-muted-foreground">{r.sublabel}</div>}
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
