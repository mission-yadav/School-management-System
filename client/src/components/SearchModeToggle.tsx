import { cn } from '@/lib/utils';

export type SearchMode = 'name' | 'iemis';

const MODES: { key: SearchMode; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'iemis', label: 'IEMIS' },
];

/** Two-option segmented toggle for student search: by Name or by IEMIS. */
export function SearchModeToggle({
  value, onChange, className,
}: { value: SearchMode; onChange: (m: SearchMode) => void; className?: string }) {
  return (
    <div className={cn('inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1', className)}>
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={cn(
            'rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === m.key ? 'bg-brand text-white' : 'text-slate-500 hover:text-slate-700'
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export const searchPlaceholder = (mode: SearchMode) =>
  mode === 'iemis' ? 'Search by IEMIS ID…' : 'Search by name…';
