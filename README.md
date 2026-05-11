# HR Contracts Dashboard V2

Premium enterprise dashboard for employees, contracts, medical insurance, imports, review queue, and audit. Built with React + TypeScript + Vite + Tailwind + shadcn/ui.

> **Phase 1 = visual shell only.** No backend, no Excel/PDF parsing, no Cloudflare. All data is dev-only mock data.

## Quick start

```powershell
npm install
npm run dev          # http://localhost:5173
```

## Scripts

| Command            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start Vite dev server with HMR                   |
| `npm run build`    | Type-check + production build to `dist/`         |
| `npm run preview`  | Serve `dist/` to test the prod bundle locally    |
| `npm run typecheck`| Run `tsc -b --noEmit`                            |
| `npm run lint`     | ESLint with zero-warning policy                  |

## Project layout

- `src/app/` — Router root, route tree, providers (theme, toaster, env)
- `src/components/ui/` — shadcn/ui primitives (auto-generated; do not hand-edit)
- `src/components/layout/` — AppShell, Sidebar, TopHeader
- `src/components/common/` — DataTable, FilterDrawer, DetailDrawer, KpiCard, StatusBadge, etc.
- `src/features/<module>/` — per-module composition (columns, filters, drawers)
- `src/pages/` — one file per route
- `src/lib/` — small helpers (`cn`, dates, status, route constants, env)
- `src/data/mocks/` — fixture data (DEV-only; tree-shaken from prod)
- `src/data/fixtures.ts` — single import surface, gated by `import.meta.env.DEV`
- `src/types/domain.ts` — domain types mirroring the future D1 schema
- `src/styles/globals.css` — Tailwind layers + design tokens

## Critical security rules

- **Never copy `Data/` into `public/` or `dist/`.** It contains real PDFs and Excel files with PII.
- `Data/` is in `.gitignore` and is never referenced by the build.
- The "Open PDF" buttons are stubs in Phase 1 — no real file access.
- No "Load demo data" affordance ships in production builds.

## Theme

Light by default; toggle in the top header. Choice is persisted to `localStorage["theme"]`.

## Design tokens

Brand uses the deep navy from the MID Arabia logo (`hsl(232, 65%, 22%)`). Status colors (`active`, `expiring`, `expired`, `missing`, `info`) live in their own CSS-variable namespace and are exposed via Tailwind as `bg-status-active`, `text-status-expired-soft`, etc.

## Roadmap

- **Phase 2:** real backend (Cloudflare Workers + D1), authenticated APIs, Excel parsing, UPSERT-by-IdentityNumber import logic, source-file content-hash tracking.
- **Phase 3:** secure private R2 PDF streaming, signed-URL viewer, contract version diffing.
- **Phase 4:** RBAC, audit log persistence, scheduled re-validation jobs.

Future Cloudflare resource names (do not deploy yet):
- Pages: `mid-contracts-dashboard-v2`
- Worker: `hr-contracts-api-v2`
- D1: `hr_contracts_db_v2`
- R2: `hr-contracts-private-v2`
