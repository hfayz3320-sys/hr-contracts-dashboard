# Phase 2 — Browser test plan

`FEATURE_FLAGS.newImports` is **OFF** by default and must remain off in production
until this test passes. Routes are mounted unconditionally so a tester can flip
the flag at runtime via localStorage; no rebuild needed.

---

## Setup (per browser session)

```bash
# Terminal — start dev server
cd D:\ai\_PROJECTS\hr-contracts-dashboard-copy
npm run dev
```

Open the dev server URL (Vite prints it — typically `http://localhost:5173`).

In the browser DevTools console:

```js
localStorage.setItem('feature.newImports', 'true');
window.location.reload();
```

The four new routes (`/v3/imports`, `/v3/review-queue`, `/v3/persons`,
`/v3/persons/:id`) are now active. Remove the override with
`localStorage.removeItem('feature.newImports')` to restore the default.

---

## Test 1 — Employee Master Excel import

Goal: verify the EM preview-first flow + commit + persistence.

1. Navigate to `/v3/imports`.
2. In the **Employee Master (Excel)** tile, pick the real HR export:
   `_contract_lab/employee_master_import_test/inputs/بيانات الموظفين.xlsx`
3. Confirm the preview panel shows:
   - Total rows: **509**
   - New persons: **499**
   - Updated / Unchanged: **0** (first import)
   - EmpNo history: **499**
   - Invalid identity: **2**
   - Missing identity: **8**
4. Click **Commit import**. Wait for the green "✓ Imported" message.
5. Open DevTools → Application → IndexedDB → `hr-contracts-dashboard-local-db`.
   Verify these stores were populated:
   - `persons`: 499 records
   - `employeeMasterSnapshots`: 499 records
   - `employeeNumberHistory`: 499 records
   - `importAuditLog`: 499 records
   - `reviewQueue`: 10 records (2 invalid + 8 missing)
   - `importJobs`: 1 record (status: completed)

**Acceptance:** counts match the v2 audit (`employee_contract_link_audit_v2_identity_model.json`).

---

## Test 2 — Contract PDF import

Goal: verify PDF extraction + identity-centric routing + EmpNo history.

1. After Test 1 succeeds, stay on `/v3/imports`.
2. In the **Contract PDFs** tile, use the folder picker to select the entire
   `public/data/contracts/` directory (437 PDFs). Or use a smaller batch first
   (e.g. 10 PDFs) for a quicker round-trip.
3. Wait for "Extracting N PDF(s)…" to finish (~30s for all 437 in Chromium).
4. Confirm the preview panel shows for the full set:
   - Total: **437**
   - Matched person: **337**
   - Contract-only: **86**
   - EmpNo history: **177** (93 divergent + 84 first-seen)
   - Invalid identity: **0**
   - Missing identity: **14**
   - Extraction errors: **0**
5. Click **Commit import**. Wait for "✓ Imported".
6. Verify IndexedDB:
   - `persons`: now 585 (499 + 86 ContractOnly)
   - `contractRecords`: 423 (437 − 14 unlinked)
   - `employeeNumberHistory`: increased by 177
   - `importAuditLog`: +423 entries
   - `reviewQueue`: +14 items (all CRITICAL: MissingIdentity)

**Acceptance:** counts match the Phase 1 PDF dry-run report.

---

## Test 3 — Review Queue resolution

1. Navigate to `/v3/review-queue`.
2. Verify the priority bar shows `CRITICAL: 24` (10 from EM + 14 from PDF).
3. Click the **Missing Identity** tab → see 22 rows (8 EM + 14 PDF).
4. Click **Resolve** on one row. Refresh — row should disappear from the list,
   `CRITICAL` count drops by 1.
5. Click **Dismiss** on another row. Same expected behaviour.

---

## Test 4 — Person profile

1. Navigate to `/v3/persons`. Page lists 585 persons.
2. Filter by an Iqama you know exists (e.g. `2588780672` — AAFAQ AHMED).
   Click the IdentityNumber link.
3. Confirm the profile shows:
   - Header: name, identityNumber, idType, nationality.
   - **Master snapshot** tab: EM fields populated.
   - **Contracts** tab: 1 contract row with version, status, dates, salary.
   - **EmpNo history** tab: ≥ 1 entry per source. If EM EmpNo ≠ contract EmpNo,
     a yellow warning bar appears noting it's history, not a conflict.
   - **Audit log** tab: at minimum a Person create + ContractRecord create entry.
   - **Review** tab: empty for clean records.
4. For a person with a Name mismatch (Arabic visual-order ambiguity), confirm
   the blue "ℹ Name mismatch warning" surfaces showing `canonicalName` (from EM)
   vs `rawExtractedName` (from PDF), with a clear explanation that this is a
   display-only flag.

---

## Test 5 — Re-import (idempotency)

1. Re-upload the same EM Excel file. Preview should show:
   - New: **0**
   - Updated: **0** (same data — nothing changed)
   - Unchanged: **499**
2. Re-upload one of the PDFs already imported. Preview should show:
   - Duplicate contract: **1** (same Person + ContractNumber + dates).
   - The duplicate is sent to the Review Queue as `AmbiguousMatch / MEDIUM`.

---

## Acceptance — what must hold before flipping the flag

- [ ] All 5 tests pass.
- [ ] No console errors during preview or commit.
- [ ] IndexedDB store counts match expected.
- [ ] Legacy stores (`employees`, `contracts`) untouched (verify via DevTools).
- [ ] No UI freeze when extracting all 437 PDFs (chunked progress is acceptable).
- [ ] `npm run build` continues to pass.

When all of the above are verified, flip the flag:

```js
// src/utils/featureFlags.js
const DEFAULTS = Object.freeze({
  newImports: true,    // ← change to true
});
```

…and re-run `npm run build`. **Phase 2 is complete only after this flag flip is
explicitly approved.**

---

## Quick teardown / re-run

To wipe Phase 1+2 state for a clean re-run:

```js
indexedDB.deleteDatabase('hr-contracts-dashboard-local-db');
window.location.reload();
```

This removes both legacy and v3 stores (the schema upgrades will recreate them
empty on next load).
