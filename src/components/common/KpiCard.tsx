/**
 * Back-compat shim — A5.0 renamed `KpiCard` to `CountCard` and rebuilt it on
 * `<InteractiveCard>` (clickable + animated count + hover/focus/press).
 * Existing dashboard imports keep working through this re-export.
 */
export { CountCard as KpiCard } from '@/components/ui-foundation/CountCard';
export type { CountCardProps as KpiCardProps } from '@/components/ui-foundation/CountCard';
