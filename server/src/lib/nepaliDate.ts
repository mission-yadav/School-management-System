// Bikram Sambat (Nepali calendar) formatting for server-side PDFs.
import Pkg from 'nepali-date-converter';

// unwrap the double-wrapped default export to the constructor
let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

/** Convert a Bikram Sambat date string ("2068-12-06") to an AD Date, or null if invalid. */
export function bsToAd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 32) return null;
  try {
    const date = new NepaliDate(y, mo - 1, d).toJsDate(); // month is 0-indexed
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** Format an AD date as a BS date string, e.g. "20 Shrawan 2083". */
export function bsDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '—';
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '—';
    let out = new NepaliDate(date).format('DD MMMM YYYY');
    if (withTime) out += `, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    return out;
  } catch {
    return '—';
  }
}
