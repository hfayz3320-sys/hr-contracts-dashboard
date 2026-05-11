# HR Contracts API Worker (Phase 2A)

Cloudflare Worker for the HR Contracts Dashboard V2. Uses Hono + D1.

> **Phase 2A:** read endpoints + import dry-run only. `POST /api/imports/commit` returns 501. No Cloudflare deploy yet.

## Local development

From the **repo root** (D:\ai\_PROJECTS\Contract-HR):

```powershell
# 1. Apply schema to local (miniflare) D1
npm run worker:migrate:local

# 2. Optional — seed synthetic data so the FE has something to render
npm run worker:seed:local

# 3. Start worker on http://localhost:8787
npm run worker:dev
```

`wrangler dev --local` uses miniflare to emulate D1. **No Cloudflare account is needed** for Phase 2A. State persists under `.wrangler/state/` (gitignored).

## Smoke test

```powershell
curl http://localhost:8787/api/health
curl http://localhost:8787/api/employees
curl http://localhost:8787/api/contracts
```

## Endpoints

| Method | Path                     | Status            |
| ------ | ------------------------ | ----------------- |
| GET    | `/api/health`            | 200               |
| GET    | `/api/employees`         | 200               |
| GET    | `/api/employees/:id`     | 200 / 404         |
| GET    | `/api/contracts`         | 200               |
| GET    | `/api/insurance`         | 200               |
| GET    | `/api/import-jobs`       | 200               |
| GET    | `/api/review-queue`      | 200               |
| GET    | `/api/audit-events`      | 200               |
| POST   | `/api/imports/dry-run`   | 200               |
| POST   | `/api/imports/commit`    | **501 — Phase 2B** |

## Migrations

- `migrations/0001_initial.sql` — full schema (11 tables + indexes). Production-safe.
- `migrations/seed-local.sql` — synthetic seed data; **never run against production**.

## Hard rules (Phase 2A)

- `identity_number` (Iqama) is the primary match key on `employees` (UNIQUE).
- `employee_number` lives in `employee_number_history` only — never on `employees` itself.
- Imports are UPSERT-by-identity, not replace.
- The dry-run endpoint computes `create | update | skip | review | error` per row but never mutates target tables.
- No real PDF/XLSX parsing yet. The dry-run endpoint accepts already-parsed JSON rows.
- No R2, no real file uploads.
- No Cloudflare deploy. `database_id` in `wrangler.toml` is a placeholder.
