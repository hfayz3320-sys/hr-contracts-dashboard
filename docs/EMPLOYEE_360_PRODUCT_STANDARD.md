# Employee 360 Product Standard

> **Status**: non-negotiable acceptance standard for the MID HR Contracts
> Dashboard V2. Every PR, every screen, every endpoint, every import is
> evaluated against this document. Drift = reject.
>
> **Owner**: HR product lead.
> **Last revised**: 2026-05-11 (Phase 4A, post-A2 backend foundation).

---

## 0. The core rule

The system's center is the **Employee 360 profile**, identified by the
employee's **Iqama / IdentityNumber**.

Every contract, insurance policy, document, HR transaction, import
correction, review action, and audit event MUST be traceable back to an
Employee 360 profile **where an employee match exists**. Where a row
cannot yet be matched (raw import, low-confidence parse), it must be
routed to the Review Queue with the missing-link reason recorded — not
quietly stored as orphaned.

This is the standard. Everything below is how it gets enforced.

---

## 1. Employee Master

The single source of truth for "who is this person."

Required identity & relationships on the Employee record:

| Field / relation              | Rule |
|-------------------------------|------|
| `identityNumber` (Iqama)      | PRIMARY match key. Unique per active employee. Validated shape. Never used as a foreign key on its own — `employees.id` is the FK target — but it IS the human identity. |
| `employeeNumberHistory[]`     | History-only. A person may carry multiple employee numbers across re-hires / mergers. Exactly one entry MAY have `to == null` (currently open). Never used as a primary match. |
| `fullName`, `fullNameArabic`  | Both supported. Arabic is first-class, not an afterthought. |
| `dateOfBirth`, `nationality`, `hireDate` | Required for data-quality "clean" status. Missing any → surfaced in Data Quality. |
| Job: `department`, `jobTitle`, site, project, sponsor, legal_entity | Site/project/sponsor/legal_entity ship in Phase 4B (`0006_employee_profile_extension.sql`). Required for HR ops, not extraction-derived. |
| **contracts**                 | 0..N. Versioned. Each anchored to a source PDF + sourceFileId. |
| **insurance policies**        | 0..N. Status computed read-time (Phase 3C-2). Group plans share `policyNumber`; `memberNumber` disambiguates. |
| **documents**                 | 0..N. Partial UNIQUE INDEX `(employee_id, type) WHERE is_current = 1`. Read-time `computedStatus`. |
| **HR transactions**           | 0..N. Idempotency 200/409/null contract. Type as free TEXT (zod-enforced). |
| **audit trail**               | Append-only. Every mutation writes a row. |
| **dataQuality**               | Read-time `EmployeeDataQualityReport`. Issues + `reviewItemIds[]`. |

**Hard rules**

- `employees.identityNumber` is the only primary match key. EmployeeNumber
  is HISTORY ONLY.
- No row in any related table may be **silently deleted**. Soft delete
  (`status='archived'`, `is_current=0`) is the only acceptable mutation.
- Identity changes (`identityNumber` PATCH) are audited with redacted
  before/after (`12…34 → 56…78`).

---

## 2. Employee Profile (UI)

The canonical full-page route is **`/employees/:id`**.

This page IS the product. Tables on the list pages are entry points; the
profile is the work surface.

### Required tabs (in order)

1. **Summary** — KPI strip (current iqama status, active contract status,
   insurance status, data-quality score), today's actionable items,
   recent activity, quick actions.
2. **Personal Info** — name, Arabic name, DOB, nationality, contact
   info (mobile, email), redacted Iqama with reveal-on-click for admin.
3. **Job Info** — department, job title, site, project, sponsor, legal
   entity, hire date, employee number (current + history table).
4. **Contracts** — versioned list with status, dates, days-remaining,
   template, data-quality flag, link to PDF (R2-streamed); inline
   actions: View · Edit · Re-link · Send to Review · Archive.
5. **Medical Insurance** — policies with computed status, member number,
   class, dates; inline actions: View · Edit · Re-link · Archive.
6. **Documents** — current docs grouped by type (iqama, passport, visa,
   work permit, etc.) with expiry chips; history table below. Actions:
   Add · Upload · Set current · Archive.
7. **Transactions** — chronological life ledger (flight tickets, iqama
   renewals, vacation, warnings, salary adjustments, …). Filter by type
   and status. Add Transaction button.
8. **Audit Trail** — full append-only timeline of every action against
   this employee + their relations.
9. **Data Quality** — itemised issue list with severity and resolution
   hints; deep links to the row that triggered each issue.

### Drawer vs. full page

- Drawer (`<Sheet>` triggered from list rows) is **quick-view only**: a
  Summary mini-card + one-click Open Full Profile.
- Drawer must never duplicate the work surface. If a screen exists in
  the profile, the drawer links to it; the drawer does not re-implement
  it.

### Routing

```
/employees                     — list, drawer for quick-view
/employees/:id                 — profile (default: Summary tab)
/employees/:id/contracts       — deep link to a tab; URL is shareable
/employees/:id/documents/:docId — deep link to a single document
```

URL state is the source of truth (tab, filters, sub-row). Reloading must
restore the same view.

---

## 3. Contracts Module

A contract is the **work agreement** between an employee and the company.
Source of truth is the signed PDF.

### Lifecycle states (computed at read-time, see Phase 3D + 4A)

```
active · expiring · expired · unmatched · unknown_template · review_required
```

- `active` / `expiring` / `expired`: derived from `startDate`, `endDate`,
  today, and the `dataQualityIssue` flag. Stored `status` column is
  NEVER the UI truth.
- `unmatched`: no employee link. Routed to Review Queue with reason
  `unmatched_contract`.
- `unknown_template`: parser did not recognise the contract template
  family. Routed to Review with `low_confidence_extraction`.
- `review_required`: `dataQualityIssue` is set (`duration_negative`,
  `duration_over_3_years`, `duration_under_30_days`, etc.).

### Required behaviour

| Capability | Detail |
|-----------|--------|
| Version history | Multiple PDFs over time per `(employee, contractType)`. `version`, `versionOf`. Older versions remain visible. |
| Source PDF reference | Every row has `fileHash` → R2 object. PDF view is admin-gated, streamed via signed URL. |
| Extraction confidence | `extractionConfidence ∈ [0,1]` from the parser. Below threshold → review_required. |
| Link / unlink employee | Admin can re-link a contract to a different employee (audited, reason captured). Unlink moves to `unmatched`. |
| Manual add | Admin can create a contract from a PDF upload + form. Same code path as imports. |
| Bulk link / archive | Multi-select on the list → bulk action bar. Bulk archive writes one audit row per affected entity AND a summary row for the batch. |
| Audit every action | create / patch / link / unlink / archive / restore all hit `audit_events`. |

### Anti-rules

- **Never** show a green "Active" pill on a contract that has a
  `dataQualityIssue`. Replace with the orange Review badge.
- Never trust the stored `status` column for KPIs.

---

## 4. Medical Insurance Module

A medical policy is the **benefit** linked to an employee. Bupa is the
current provider; the module is provider-pluggable.

### Required states

```
active · expired · missing       (policyStatus, computed read-time)
linked · unmatched               (linkStatus, separate axis)
```

`policyStatus` and `linkStatus` are independent — a policy can be
`expired` AND `linked`. Both are derived from authoritative inputs at
read time; neither is read from a stored column.

### Status computation — non-negotiable

1. **Insurance status is computed at read time.** Every consumer (list
   endpoints, detail endpoints, dashboards, KPIs) derives it on the
   fly from `(identityNumber, policyNumber, startDate, endDate, today)`
   plus the disclosed-fallback rule below.
2. **Stored `insurance_policies.status` is never UI truth.** It is a
   historical workflow snapshot (from import or last manual edit).
   Phase 3C-2 made the worker stop trusting it; no future code may
   re-trust it.
3. **Worker/API and SQL/debug-counts must use equivalent logic.** The
   TypeScript helper (`computeInsuranceStatus`) and the SQL predicates
   in `/api/debug/counts` MUST agree on the same partition. A drift
   between them is a P0 bug. Tests assert that on a fixed fixture the
   two paths return identical bucket counts.
4. **`startDate + 1 year` fallback is allowed only when the source
   has no explicit `endDate`,** and the UI MUST disclose that the
   end date was inferred — e.g. a `(estimated)` tag on the date and a
   tooltip "End date inferred per CCHI default; source export had no
   explicit expiry." Rows whose source DID provide an `endDate` use
   the explicit value; the fallback never overrides supplied data.

### Required fields

| Field | Note |
|-------|------|
| `policyNumber` | Group policies share one across many employees. |
| `memberNumber` (BupaID) | Disambiguates the individual within the group. Required for group plans. |
| `class` | Bupa class designator (used for tier comparison). |
| `startDate` | Required. Missing → `missing`. |
| `endDate` | Optional. When null AND no source-provided expiry exists, the inferred-fallback rule above applies; the UI discloses the inference. |
| `provider` | Today: Bupa. Pluggable for future providers. |
| `employee_id` | Nullable; null → unmatched. Resolution path goes through the Review Queue. |
| `sourceFileId` | The Bupa export the row came from. |

### Required behaviour

- Read-time status recalculation: every read path emits the computed
  value through `computeInsuranceStatus()` (worker) or the equivalent
  SQL predicate (debug counts). No path reads `status` from the column.
- Bulk link: multi-select unmatched rows → pick employee → write
  link audit rows.
- Missing-data checks: dashboard surfaces `missing_policy_number`,
  `missing_member_number`, `missing_start_date` counters.
- Import traceability: each row carries `sourceFileId` → R2 object → the
  import job that wrote it.
- Fallback disclosure: any row whose `endDate` was inferred (not
  source-supplied) renders with a visible "(estimated)" marker in
  every surface (list, drawer, profile tab, dashboard tooltip).

### Anti-rules

- Never report a policy as `missing` just because the employee link is
  unmatched. Use `linkStatus` for that. `missing` is reserved for
  rows missing critical policy fields.

---

## 5. Documents

Documents belong to **employee profiles**. They are not standalone.

### Types (D1 CHECK enum — extending requires a migration, by intent)

```
iqama · passport · visa · work_permit · contract_pdf · insurance_card
medical_certificate · driving_license · other
```

### Required fields

| Field | Rule |
|-------|------|
| `type` | Strict enum (above). |
| `docNumber` | Optional. NOT in any uniqueness rule (NULL would falsely duplicate). |
| `issuedAt`, `expiresAt` | ISO date. `expiresAt` drives expiry KPIs and the read-time `computedStatus`. |
| `isCurrent` | `0/1`. Partial UNIQUE INDEX `(employee_id, type) WHERE is_current=1` enforces "one current per type." History is unlimited. |
| `status` | Stored workflow state set by HR or import (`active`/`expired`/`archived`/`review_required`). Workflow snapshot only. |
| `computedStatus` | READ-TIME truth. Priority: `archived → review_required → expired → active`. UI / KPIs MUST consume this, not `status`. |
| `reviewRequired`, `reviewReason` | Independent of `status`. Either manual flag OR missing required fields per type. |
| `verifiedAt`, `verifiedBy` | Manual verification audit. |
| `extractionConfidence` | Set by the parser. |
| `sourceFileId` | R2 anchor (the uploaded scan / PDF). |
| `metadata` | JSON-stringified type-specific extras (issuing country, visa class, …). |

### Required-field matrix (drives `computedStatus = review_required`)

| Type | Required (else review) |
|------|------------------------|
| iqama / passport / visa / driving_license | `docNumber`, `expiresAt` |
| work_permit | `expiresAt` |
| contract_pdf | `sourceFileId` |
| insurance_card | `docNumber` |
| medical_certificate | `issuedAt` |
| other | (none) |

### Required behaviour

- Creating a new current doc of a type **must demote** the previous
  current to `is_current=0` automatically (route layer). Admin sees a
  toast: "Previous Iqama archived; new one is now current."
- Soft delete = archive = `status='archived'` + `is_current=0`. No hard
  delete.
- Audit every transition (created · patched · archived · verified ·
  superseded).

---

## 6. HR Transactions

A generic life-ledger entry for everything that happens to an employee
beyond the contract/insurance/document axes.

### Canonical types (zod enum at the API boundary; D1 column is free TEXT)

```
flight_ticket · iqama_renewal · visa · exit_re_entry · vacation
salary_adjustment · allowance_change · warning · document_request
contract_renewal_request · insurance_update · training · transfer
promotion · termination · medical_claim · other
```

New types ship as a one-PR code change (zod + per-type payload schema).
No D1 migration required for new types. Tests cover the full canonical
list so a typo fails CI.

### Required fields

| Field | Rule |
|-------|------|
| `type` | Free TEXT in D1; zod-enforced enum at API. |
| `status` | `requested · approved · rejected · in_progress · completed · cancelled`. |
| `title` | Human-readable label visible in lists. |
| `effectiveDate`, `endDate` | Window-style transactions (vacation, exit-re-entry) set both. |
| `amount`, `currency` | Optional. Filled when transaction has financial impact. |
| `refNumber` | External reference (PNR, claim number). |
| `payload` | JSON-stringified per-type structured body. Validated by `payloadSchemaForType(type)`. |
| `payloadSchemaVersion` | Bumped when payload contract changes incompatibly. Forward-compatible read path. |
| `sourceFileId` | Optional R2 anchor (ticket scan, signed approval). |
| `reviewRequired`, `reviewReason` | Manual triage flag. |
| `idempotencyKey` | Optional, UNIQUE when non-null. Contract: 200 on retry / 409 on diff / null = always new. |
| Audit columns | `created_at/by`, `updated_at/by`. |

### Idempotency — non-negotiable contract

```
null key                       → always create a new row
same key + same canonical body → 200 with the existing row
same key + different body      → 409 Conflict, stored row UNCHANGED
```

"Canonical body" is defined by `employeeTransactionIdempotencyEqualityKeys`
in `shared/api-contract.ts`. The list is the single source of truth;
the worker imports it. `metadata`, `createdBy/At`, `updatedBy/At`, and
the key itself are excluded. Defaults (`status='requested'`,
`payloadSchemaVersion=1`, `reviewRequired=false`) are applied via a
shared helper before BOTH canonicalisation AND insert.

### Audit & traceability

Every transaction creation, patch, status transition, and (future)
cancellation writes an `audit_events` row with `target = transactionId`.
The 360 Audit Trail tab surfaces these in chronological order.

---

## 7. Review Queue / Data Quality Center

Triage, **not just a list**. The Review Queue is where unmatchable rows,
low-confidence parses, and data-quality issues converge for HR to
resolve.

### Must support

| Capability | Detail |
|-----------|--------|
| Reason grouping | Side panel groups items by reason: `missing_identity`, `duplicate_identity`, `conflicting_employee_number`, `unmatched_contract`, `unmatched_insurance`, `low_confidence_extraction`, `missing_contract_fields`. |
| Confidence | Each item shows the parser confidence (when applicable). Sorted by confidence asc within a group. |
| Employee picker | Admin can search and assign an employee inline (Iqama, name, employee number). |
| Approve / Reject / Dismiss | Three terminal actions. Approve writes corrected fields back to the source row + audit. Reject closes with mandatory reason. Dismiss marks "not an issue" with audit. |
| Bulk actions | Bulk approve (only when target row is high-confidence + has clean employee match). Bulk dismiss. Bulk link to employee. |
| Correction form | For partial / wrong extractions, edit fields inline before approve. |
| Redacted source snippet | When the row was parsed from a PDF, show the redacted source snippet (first 200 chars around the extraction window) so the reviewer sees what the parser saw. |
| Audit trail per item | Every action on a review item is audited, including the actor and the resolution payload. |

### Anti-rules

- **Never** silently auto-resolve a review item without an actor row in
  `audit_events`.
- **Never** approve a low-confidence row without an admin click. No
  background auto-promotion.

---

## 8. Import & Source Traceability

Every committed row in the system must trace back to a source file in
R2.

### Required per-import metadata

| Field | Rule |
|-------|------|
| `sourceFileId` | sha256 of the uploaded file. Anchored in `source_files`. |
| R2 key + R2 status | The object in `hr-contracts-private-v2`. Worker confirms presence before commit. |
| Adapter / parser version | The exact code version that interpreted the file. Future re-parses can re-run against a newer version. |
| Counts | `created`, `updated`, `skipped`, `review`, `error` — surfaced on the import job summary and the dashboard. |
| Idempotency | Re-running the same file with the same content hash MUST be a no-op (skip count goes up, no duplicates). |
| Rerun safety | Each adapter declares whether it is rerunnable; the import wizard refuses to commit an un-rerunnable file twice without a force flag. |
| Rollback / soft correction | Wherever possible, a committed import can be rolled back via soft-archive (no hard deletes). Where rollback is not feasible, the import declares this and the wizard warns the operator before commit. |

### Required behaviour

- Dry-run first, commit second. Operator sees the would-be counts before
  pressing commit.
- Admin-only PDF imports. xlsx imports follow the same permission model.
- Errors surface with clear file-row context (`row 47: missing Iqama`),
  not generic "import failed."

---

## 9. Users & Permissions

The app sits behind Cloudflare Access (Microsoft Entra ID). Access
controls **who can reach the app at all**. Roles control **what they can
do once inside**.

### Roles

```
admin       — full CRUD, user management, imports, deletes (soft only)
hr_manager  — CRUD on employees / contracts / insurance / documents /
              transactions; imports yes; user management NO
viewer      — read-only across the system
```

### Required enforcement

- **Route guard**: every mutation endpoint goes through `requireAdmin`
  or an explicit role check. Production rejects `X-Dev-Admin-Email`
  hard.
- **Button/action permissions**: UI controls that drive mutations are
  hidden for non-admin / non-hr_manager. Hiding is the secondary
  guard; the server is the primary.
- **Add / deactivate / role-change**: admin-only. Self-deactivate
  blocked (two-admin lockout protection).
- **Audit all permission changes**: `user.created`, `user.role_changed`,
  `user.deactivated`, `user.reactivated` are first-class audit
  actions.

### Anti-rules

- Never grant a permission silently based on email shape, domain, or
  Cloudflare Access alone. Roles in `app_users` are the gate.
- Never expose admin actions behind hidden URLs ("security through
  obscurity"). Always server-checked.

---

## 10. Dashboard

The dashboard is the **control room** — at-a-glance state of the entire
HR operation. Not decorative; every card must be actionable.

### Required cards

| Card | What it shows | Click-through |
|------|---------------|---------------|
| Total Employees | count | → `/employees` |
| Active Employees | `status='active'` count | → `/employees?status=active` |
| Contracts Expiring ≤30 / ≤60 days | count + delta | → `/contracts?expiring=30` |
| Contracts Expired | count | → `/contracts?status=expired` |
| Insurance Missing / Expired | count | → `/insurance?status=missing,expired` |
| Unmatched Documents | count of `linkStatus=unmatched` | → `/review?reason=unmatched_*` |
| Open Review Queue | count | → `/review?status=open` |
| Data Quality issues | count of employees with any DQ issue | → `/employees?dataQuality=issues` |
| Recent Imports | last 5 jobs + status | → `/imports` |

### Required sections

- **Action Required** — top 5 highest-severity items spanning all
  modules (expiring iqamas inside 30 days, expired insurance for
  active employees, low-confidence contracts).
- **Quick Actions** — `Add Employee` · `Import Employees` ·
  `Import Insurance` · `Import Contracts` · `Open Review Queue`.
- **Recent Activity** — last N audit rows, redacted.

### Anti-rules

- Never show fake / placeholder numbers. If a count cannot be computed
  (DB unreachable), show an error state, not a `0`.
- Never show identical numbers across cards without explanation; if two
  cards happen to show the same value, both must derive it from
  independent queries.

---

## Definition of Done

No feature is accepted unless **all** apply:

1. **Employee-centered** — joins, links, and routes anchor on
   `employees.id` (Iqama-anchored). Orphan rows go to the Review Queue,
   not to silent storage.
2. **Audited** — every mutation writes one row to `audit_events`
   with `actor`, `action`, `target`, `status`, optional `details`,
   and (where applicable) `jobId` / `sourceFileId`.
3. **Permission-guarded** — server-side `requireAuth` / `requireAdmin`
   on the endpoint AND a UI affordance that's hidden for the wrong
   role. Production hard-rejects `X-Dev-Admin-Email`.
4. **Source-traceable** — where the feature touches data that
   originated from an upload, the row carries `sourceFileId`. R2
   objects are private; access streams through the worker.
5. **Review/data-quality aware** — feature defines what "incomplete"
   looks like and routes incomplete rows to the Review Queue or
   surfaces them in the Data Quality report. Read-time computation,
   never stored-column trust.
6. **Tested** — unit tests for pure helpers (status compute, idempotency
   hash, data-quality compute), route tests for auth gates +
   validation + happy path + the boundary cases (null vs. empty,
   first vs. retry, partial UNIQUE INDEX semantics). CI is the gate.
7. **Visually production-grade** — Linear / Vercel / Stripe quality.
   No raw `<table>` dumps. Status chips have semantic colour. Lists
   support search, filter (drawer pattern), columns, refresh, add,
   import, export, multi-select with a bulk-action bar. Detail
   experience is the **full profile page**, not the drawer.

If any of the seven items is "not yet" for a PR, the PR is not done.
Annotate the gap explicitly in the PR description, ship the rest only
when the gap is resolved.

---

## Appendix A — non-goals (deliberately out of scope)

- Multi-tenant. The app serves one organisation (MID).
- Real-time push. Updates are pull-based; SSE / WebSockets are out of
  scope until a measured need surfaces.
- External-facing APIs. The worker is reachable only behind Cloudflare
  Access; no public token / OAuth flow.
- LLM-generated commentary or analysis text in the UI. Tools that
  surface counts, expiries, and exceptions are in scope. Tools that
  generate narrative text from sensitive HR data are not — those go
  through a separate review before any rollout.

## Appendix B — glossary

- **360**: the per-employee aggregate view (employee + contracts +
  insurance + documents + transactions + audit + data-quality).
- **Iqama**: Saudi residency permit number. PRIMARY identity in this
  system.
- **CCHI**: Council of Cooperative Health Insurance (Saudi). Drives the
  Bupa policy-window convention.
- **R2**: Cloudflare's object store. All source uploads live there,
  private by default.
- **Read-time computation**: a UI / KPI value derived on every read
  from authoritative inputs, not trusted from a stored column.
- **Soft delete**: `status='archived'` (+ `is_current=0` for documents).
  Never a SQL `DELETE`.

---

## Appendix C — current phase status

Completed:

- **Phase 3A** ✓ data-truth fix (employees/contracts/insurance counts).
- **Phase 3B** ✓ server-side employee joins (`employeeSummary`).
- **Phase 3C-1 / 3C-2** ✓ insurance status backfill + read-time recompute.
- **Phase 3D** ✓ contracts data-quality flag + Dialog a11y; deployed.
- **Phase 4A A1** ✓ Employee 360 schema + types + helpers (committed,
  not migrated).
- **Phase 4A A2** ✓ backend repos + routes + tests for documents /
  transactions / Employee 360 endpoint (uncommitted; migration applied
  to local D1 only, NOT production).

Remaining 4A sub-phases — strict ordering (each gates the next):

- **A3** — migration 0005 release gate. Canary in a non-production D1
  copy, pre-migration backup of production D1, second-admin review of
  the A1+A2 diff, explicit operator approval, then apply
  `0005_employee_360.sql` to production. **No code deploy yet.**
- **A4** — backend deploy. Worker re-deploy carrying the A2 routes,
  AFTER A3 migration succeeds in production. Verification: `/api/health`,
  unchanged 501/328/475 sanity, the new GET-with-empty-arrays-for-360
  paths return 200. Still no UI work.
- **A5** — full Employee Profile UI at `/employees/:id` per Section 2:
  all 9 required tabs, drawer reduced to quick-view, URL state as
  source of truth. Built against the now-live A4 backend.
- **A6** — dashboard / control-room polish per Section 10: every card
  click-through-wired, Action Required + Quick Actions + Recent
  Activity sections, error states that never default to `0`.

Phase 4B (later) — `0006_employee_profile_extension.sql` adds site /
project / sponsor / legal_entity columns to `employees`. Gated on its
own A3-equivalent release flow.

Production migration of `0005_employee_360.sql` (the A3 gate) is
contingent on **all** of:

1. This standard signed off.
2. Second-admin review of the A1 (`87b8a9d`) + A2 diff complete.
3. Pre-migration backup of `hr_contracts_db_v2` captured and
   verifiable.
4. Canary apply against a non-production copy succeeded with the A2
   route tests passing against the canary DB.
5. Explicit operator approval ("apply 0005 to remote").
