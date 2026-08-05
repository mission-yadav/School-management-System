import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { formatBS } from './nepaliDate';

export const inr = (n: number | null | undefined) => '₹' + Number(n || 0).toLocaleString('en-IN');

/** Dates are displayed in the Nepali (Bikram Sambat) calendar throughout the app. */
export function formatDate(d: string | Date | null | undefined) {
  return formatBS(d);
}
