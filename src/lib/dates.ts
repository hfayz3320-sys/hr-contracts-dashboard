import { format, parseISO, differenceInDays, isValid } from 'date-fns';

function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  const d = typeof input === 'string' ? parseISO(input) : input;
  return isValid(d) ? d : null;
}

export function formatDate(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? format(d, 'dd MMM yyyy') : '—';
}

export function formatDateTime(input: string | Date | null | undefined): string {
  const d = toDate(input);
  return d ? format(d, 'dd MMM yyyy, HH:mm') : '—';
}

export function daysUntil(input: string | Date | null | undefined): number | null {
  const d = toDate(input);
  return d ? differenceInDays(d, new Date()) : null;
}

export function relativeDays(input: string | Date | null | undefined): string {
  const days = daysUntil(input);
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days > 0) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}

// Phase 2: real Umm al-Qura conversion. For now, a stub.
export function formatHijri(_input: string | Date | null | undefined): string {
  return '—';
}
