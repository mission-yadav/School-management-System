// Bikram Sambat (Nepali calendar) helpers. Storage stays Gregorian (AD);
// these format AD dates into BS for display.
import Pkg from 'nepali-date-converter';

// The package double-wraps its default export under Node/bundler interop — unwrap to the constructor.
let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra',
];

function toND(d: string | Date | number | null | undefined): any | null {
  if (!d) return null;
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return null;
    return new NepaliDate(date);
  } catch {
    return null;
  }
}

/** "20 Shrawan 2083" (append weekday with withWeekday) */
export function formatBS(d: string | Date | number | null | undefined, opts?: { withWeekday?: boolean; withTime?: boolean }): string {
  const nd = toND(d);
  if (!nd) return '—';
  let out = nd.format(opts?.withWeekday ? 'ddd, DD MMMM YYYY' : 'DD MMMM YYYY');
  if (opts?.withTime && d) {
    const t = new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    out += `, ${t}`;
  }
  return out;
}

/** Compact BS: "2083-04-20" */
export function formatBSShort(d: string | Date | number | null | undefined): string {
  const nd = toND(d);
  return nd ? nd.format('YYYY-MM-DD') : '—';
}

/** Convert a Gregorian 'YYYY-MM' month key to a BS month label, e.g. "Shrawan 2083". */
export function bsMonthLabel(ymKey: string): string {
  if (!ymKey || !ymKey.includes('-')) return ymKey;
  const [y, m] = ymKey.split('-').map(Number);
  const nd = toND(new Date(y, (m || 1) - 1, 15));
  if (!nd) return ymKey;
  const bs = nd.getBS();
  return `${BS_MONTHS[bs.month]} ${bs.year}`;
}

/** Today in BS (for headers etc.) */
export function todayBS(): string {
  return formatBS(new Date());
}
