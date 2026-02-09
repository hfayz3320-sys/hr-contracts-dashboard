# HR Contracts Dashboard

Standalone cloud-ready project for:
- Arabic RTL + English LTR HR contracts analytics
- Excel/CSV import and cleaning pipeline
- Shared backend storage so all devices see the same imported Excel/PDF data
- Data quality checks and export
- Interactive dashboards and employee table
- PDF attachment mapping by `SourceFile`

Company label:
- EN: `Mid Arabia for Contracting`
- AR: `الأوسط العربية للمقاولات`

## Tech Stack
- React + Vite
- TailwindCSS (base setup) + custom CSS theme
- Recharts
- SheetJS (`xlsx`)
- Zustand (persisted UI state)
- JSZip
- Day.js
- Node.js + Express API (shared dataset/PDF storage)

## Project Structure
- `src/App.jsx`: app wiring, import/export handlers, routing between pages
- `src/components/`: sidebar, toolbar, employee modal
- `src/pages/`: Executive, Talent, Risk, Compensation, Data Quality, Employees
- `src/utils/cleaning.js`: normalization, parsing, derived fields, validations
- `src/utils/persistence.js`: local IndexedDB cache
- `src/utils/remoteStorage.js`: shared API save/load for dataset and PDFs
- `server/index.js`: API server for shared storage (`server/storage`)
- `public/data/sample.xlsx`: demo file to test dashboard immediately
- `public/assets/logo.png`: logo

## Run Shared (PC + Mobile)
1. Install Node.js 18+.
2. Install dependencies:
```bash
npm install
```
3. Start UI + API together:
```bash
npm run dev:all
```
Or on Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-shared.ps1
```
4. Open from PC browser:
- `http://127.0.0.1:5173`
5. Open from mobile (same Wi-Fi):
- `http://<YOUR-PC-IP>:5173`

Use `ipconfig` on Windows to get `<YOUR-PC-IP>`.

## Run One-Port Production (Recommended for stable sharing)
```bash
npm run serve:shared
```
Or on Windows PowerShell:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-anywhere.ps1
```
Custom storage path (for cloud-sync folders):
```powershell
powershell -ExecutionPolicy Bypass -File .\start-anywhere.ps1 -StorageDir "C:\Users\user\OneDrive\HRContractsDashboardStorage"
```
Then open from any device on the same network:
- `http://<YOUR-PC-IP>:8787`

## OneDrive / Cloud Sync Mapping
Yes, you can map dashboard data to OneDrive (or Dropbox/Google Drive desktop folder) so it syncs to cloud automatically.

Windows OneDrive quick start:
```powershell
powershell -ExecutionPolicy Bypass -File .\start-onedrive.ps1
```

What gets synced:
- `latest-dataset.json` (imported Excel/CSV cleaned data)
- `pdfs/*.pdf` (uploaded contracts)

Notes:
- Keep one active server writing to the storage folder to avoid sync conflicts.
- Other devices can read the same data by opening the dashboard URL.
- For true always-on internet sharing without your PC running, deploy backend on a cloud host (not only synced folder).

## Access From Outside Your Network
- Keep server running on your PC (`npm run serve:shared`).
- Publish port `8787` using:
  - Router port-forwarding, or
  - A secure tunnel service (for example Cloudflare Tunnel or Tailscale Funnel).
- Share the public URL. The same Excel/PDF data will load from `server/storage`.

## Build
```bash
npm run build
```
Output is generated in `dist/`.

## API Server
- Default API URL in local dev is proxied to `http://127.0.0.1:8787`.
- Shared files are saved in:
  - `server/storage/latest-dataset.json`
  - `server/storage/pdfs/*.pdf`
- If you deploy frontend separately, set:
  - `VITE_API_BASE=http://<SERVER-IP-OR-DOMAIN>:8787`

## Import and Data Pipeline
### Excel/CSV Import
- Click `Import Excel File`.
- Supports `.xlsx`, `.xls`, `.csv`.
- Pipeline performs:
  - header canonicalization
  - date/number/boolean parsing
  - nationality/profession normalization
  - derived fields (`Age`, `ContractDaysRemaining`, `ContractStatus`, risk band)
  - validations (date logic, IBAN, email, mobile, ID expiry, duration mismatch)
  - save to shared API storage so all devices load the same dataset

### PDF Import
- Upload PDFs directly, ZIP, or PDF folder.
- PDFs are uploaded to shared API storage and become available on all devices.
- Matching is attempted against `SourceFile` and filename variants.
- Employee detail modal opens mapped PDF when available.

### Data Persistence
- Shared source of truth is API storage (`server/storage`).
- Browser IndexedDB is used as local cache fallback.
- `Reset Data` clears local cache and shared API storage.

### Export
- `Download Cleaned.xlsx`
- Data Quality page: `Export Quality CSV`
- Employees page: filtered CSV/Excel exports

## Logo
- Current logo is saved in `public/assets/logo.png`.
- Replace this file if you want a newer version.

## Sample Data
- Included file: `public/data/sample.xlsx`
- Use the `Use Sample Data` button to load instantly.
