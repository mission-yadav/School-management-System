// Bikram Sambat (Nepali calendar) formatting for server-side PDFs.
import Pkg from 'nepali-date-converter';

// unwrap the double-wrapped default export to the constructor
let NepaliDate: any = Pkg;
while (NepaliDate && typeof NepaliDate !== 'function' && NepaliDate.default) NepaliDate = NepaliDate.default;

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
