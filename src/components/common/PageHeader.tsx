/**
 * Back-compat shim — the real implementation moved to
 * `@/components/ui-foundation/PageHeader` in A5.0. Existing callers keep
 * working without import-path changes; new callers should import from the
 * foundation directly.
 */
export { PageHeader } from '@/components/ui-foundation/PageHeader';
export type { PageHeaderProps, BreadcrumbItem } from '@/components/ui-foundation/PageHeader';
