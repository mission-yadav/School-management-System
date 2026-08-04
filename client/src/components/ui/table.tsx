import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('bg-slate-50 text-xs uppercase tracking-wide text-slate-500', className)} {...props} />
);
export const TBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />;
export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('border-t border-slate-100 hover:bg-slate-50/60', className)} {...props} />
);
export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('px-4 py-3 font-semibold', className)} {...props} />
);
export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('px-4 py-3 text-slate-700', className)} {...props} />
);

/** Column-driven data table. Accepts either `key`+`render` or `accessor`+`cell`. */
export interface Column<T = any> {
  key?: string;
  accessor?: string | ((row: T) => React.ReactNode);
  header: string;
  render?: (row: T) => React.ReactNode;
  cell?: (row: T) => React.ReactNode;
  className?: string;
}
export function DataTable<T extends { id?: number | string }>(props: {
  columns: Column<T>[]; rows?: T[]; data?: T[]; empty?: string;
}) {
  const { columns, empty = 'No records found.' } = props;
  const rows = props.rows ?? props.data ?? [];
  const field = (c: Column<T>) => c.key ?? (typeof c.accessor === 'string' ? c.accessor : '') ?? '';
  const value = (c: Column<T>, row: T) => {
    if (c.render) return c.render(row);
    if (c.cell) return c.cell(row);
    if (typeof c.accessor === 'function') return c.accessor(row);
    return (row as any)[field(c)];
  };
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          {columns.map((c, i) => <TH key={field(c) || i} className={c.className}>{c.header}</TH>)}
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TR className="hover:bg-transparent">
            <TD colSpan={columns.length} className="py-10 text-center text-slate-400">{empty}</TD>
          </TR>
        ) : (
          rows.map((row, i) => (
            <TR key={(row.id as React.Key) ?? i}>
              {columns.map((c, ci) => <TD key={field(c) || ci} className={c.className}>{value(c, row)}</TD>)}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
