import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {(actions || children) && <div className="flex items-center gap-2">{actions}{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="py-16 text-center text-sm text-slate-400">{label}</div>;
}

export function EmptyState({ title, message, description, children }: { title?: string; message?: string; description?: string; children?: ReactNode }) {
  return (
    <div className="py-16 text-center text-sm text-slate-400">
      {title && <div className="mb-1 font-medium text-slate-500">{title}</div>}
      {message}{description}
      {children}
    </div>
  );
}
