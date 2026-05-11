# Contract-HR — Clean Claude Handoff

This folder is a CLEAN source handoff only.

Excluded on purpose:
- `.git/`
- `node_modules/`
- `Data/`
- `.import-tmp/`
- `backups/`
- `dist/`
- raw PDF/XLSX/CSV/ZIP files
- `.env.local`

Important current production issue to fix first:
- Browser `/api/*` returns 401 after login.
- Fix Cloudflare Access / Pages Function proxy headers before adding features.
- Do not apply insurance backfill until browser auth is green.

Safe commands:
```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Production build guard:
- `.env.production` is included with `VITE_API_BASE_URL=` so Vite uses same-origin `/api/*`.
- Never bake `http://localhost:8787` into a production bundle.

Do not commit or upload PII files.
