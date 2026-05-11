import { daysUntil } from '@/lib/dates';

export type ContractStatus = 'active' | 'expiring' | 'expired';
export type InsuranceStatus = 'active' | 'expired' | 'missing';
export type GenericStatus = ContractStatus | InsuranceStatus | 'info';

export const EXPIRY_WINDOW_DAYS = 60;

export function contractStatusFromDates(endDate: string | null | undefined): ContractStatus {
  const days = daysUntil(endDate);
  if (days === null) return 'expired';
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WINDOW_DAYS) return 'expiring';
  return 'active';
}

export function insuranceStatusFromDates(endDate: string | null | undefined): InsuranceStatus {
  const days = daysUntil(endDate);
  if (days === null) return 'missing';
  if (days < 0) return 'expired';
  return 'active';
}

export const statusLabels: Record<GenericStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Missing',
  info: 'Info',
};
