import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Same helper as the web CRM: merge class lists, last conflicting utility wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
