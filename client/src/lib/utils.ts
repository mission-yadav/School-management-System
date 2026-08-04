import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const inr = (n: number | null | undefined) => '₹' + Number(n || 0).toLocaleString('en-IN');

export function formatDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', opts || { day: '2-digit', month: 'short', year: 'numeric' });
}
