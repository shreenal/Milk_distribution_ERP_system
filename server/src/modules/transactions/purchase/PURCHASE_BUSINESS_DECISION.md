# Purchase Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/purchase/` (controller, service, repository, builder, DTOs, `services/*`, constants, util), plus the purchase types and the shared pieces it uses: `PurchaseVarianceCalculator` and the dairy-tray conversion in `TrayCalculationService`.
**Purpose:** Binding business requirements. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 7 (Open Items).
**Rule for changes:** Any behavior change needs a new or amended decision ID, approved by the business owner, before code changes.

Decision IDs `PD-1` to `PD-54` are the 54 approved decisions, numbered as approved. `PD-55` onward record harmonizations with the other modules, the answers given to the open questions, and the audit rulings (PD-63 to PD-69).
**Reference pattern:** Vehicle Allocation (VA) is the design framework (PD-17). Purchase-specific rules take precedence (PD-18).

---

## 1. Glossary

| Term | Meaning |
|---|---|
| Purchase paper | `purchase_paper`: one header per order paper, created on the first changing save (or by a zero-allocation sign-off). Its `updated_at` is the concurrency token. |
| Entry | `purchase_entry`: one saved purchase decision for session + vehicle + distributor + category + product. |
| Cell | One product in one vehicle/session row of a grid. |
| Untracked | A cell with no saved entry. The pre-filled allocation value is only a suggestion. |
| Confirmed zero | A saved entry with `purchasedQty = 0`. |
| Frozen | Rate, product link, gatepass date and order-unit snapshot kept from the first save of an entry. |
| Orphan | A saved entry that cannot be drawn in any grid cell. |
| Stale | A saved entry whose allocation snapshot (id/quantity) differs from the current allocation. Rows with no snapshot at all are never stale. |

---

## 2. Decisions PD-1 to PD-54

### 2.1 Zero quantities and entity validation
- **PD-1** Zero quantities bypass only the quantity-versus-allocation check (PD-63). They must still pass entity checks: product, vehicle and distributor exist, and (for a new row) an active distributor-product link exists. A saved row keeps its frozen link (PD-21), so the link check applies to new rows only.
- **PD-2** An invalid identifier is a 400. Ids are bounded 1 to 2147483647, so an oversized id is a 400, never a database error.
- **PD-3** A zero entry is neither automatically kept nor dropped. The defined rule (answer 1): a zero for a cell that was never allocated and never saved is ignored and returned in `ignoredEntries[]` (reason `NOT_ALLOCATED_AND_NOT_SAVED`). A zero for a cell that is allocated is stored as a confirmed zero.
- **PD-4** A zero or positive entry that targets a saved cell whose allocation was removed or changed is a 400 `Allocation modified or removed: <row>`. The client echoes `sourceAllocationId` and `sourceAllocatedQty` (the allocation it saw); they are required for an already-saved cell and are compared with the current allocation.

### 2.2 Deletion guardrails
- **PD-5** Ordinary deletion is by `deletedEntryIds[]`. Every id must belong to this paper (else 400).
- **PD-6** Hidden, unrendered or orphaned entries are never deleted because they are absent from the payload. Nothing in the save deletes by omission.
- **PD-7** Orphans are returned by GET in `orphanedEntries[]` (with entry id, names, quantity, rate, amount) for an Unassigned / Legacy drawer.
- **PD-8** Orphans must be resolved before morning submit: the submission gate fails while any orphan exists. Resolution means deleting it with `deletedEntryIds` (answer 6).
- **PD-9** `entries: []` is rejected (400) when the paper has saved entries, unless `deletedEntryIds`, `purgeAll` or `reevaluateTrays` is sent. With nothing saved, an empty save is a no-op.
- **PD-10** `purgeAll: true` requires: ADMIN role (403 otherwise), `purgeScope: "PAPER"` (the only scope, the entire paper), the current `expectedUpdatedAt`, and none of `entries`, `deletedEntryIds` or `reevaluateTrays` in the same request (PD-69). It deletes every entry of the paper, orphans included.
- **PD-11** Row deletion and bulk purge are separate operations. A request that both saves and deletes the same entry is a 400.

### 2.3 Concurrency, versioning and identity
- **PD-12** `expectedUpdatedAt` is required on every write. Explicit `null` is accepted only while no purchase paper exists. Omitted is 400, malformed is 400, mismatch is 409. The first save inserts the header with a plain insert (a concurrent first save gets 409).
- **PD-13** Deletions, purge, tray re-evaluation, rate recalculation and sign-off all use the same token check.
- **PD-14** The database already enforces `UNIQUE (purchase_paper_id, delivery_session, vehicle_id, product_link_id)`. Because `(distributor_id, product_id)` maps one-to-one to a link and category follows the product, this is equivalent to, and stricter than, the proposed wider key. **No new index is added** (see Open Item O-1).
- **PD-15** `prisma/migrations/.../diagnostics.sql` checks for duplicates under the wide key and for inconsistent rows before anything is enforced. Expected result: no rows.
- **PD-16** Application identity `vehicle_distributor_category_product_session` (`buildPurchaseKey`) and the database identity are equivalent.

### 2.4 Consistency with Vehicle Allocation
- **PD-17** Followed: `{ message, details[] }` errors, serializable transaction with retry, token returned on save, no-op saves do not move the token, names instead of ids in messages, 404 for a missing paper.
- **PD-18** Not followed where Purchase differs: Purchase is a partial upsert with explicit deletes (VA is a full snapshot); rates and links are frozen; there is no per-session lock.
- **PD-19** Everything the save triggers (Dairy Trays recalculation) runs inside the same transaction and rebuilds from current state, so a serialization retry cannot duplicate it. Log lines are written after commit for the same reason.

### 2.5 Rate freezing and recalculation
- **PD-20** Ordinary saves keep an existing entry's rate, order-unit snapshot and gatepass date. Only quantity, amount and the allocation snapshot change.
- **PD-21** Ordinary saves keep an existing entry's product link.
- **PD-22** Every cell carries `meta.rateType`: `FROZEN` for saved entries, `LIVE` for unsaved pre-filled defaults (all statuses).
- **PD-23** `POST /purchases/:paperId/recalculate-rates`: ADMIN only, REOPENED papers only, whole paper, requires `expectedUpdatedAt` and a trimmed non-empty `reason`. Refreshes link, rate, gatepass date, `units_per_order_unit`, `pricing_quantity`, `pricing_unit` and the amount.
- **PD-24** All-or-nothing: if any entry has no active link, no rate or no order-unit configuration, the whole request fails (400 with every problem listed) and nothing changes. If nothing differs, the token does not move.
- **PD-25** No audit table. Every changed entry is logged through the server logger: `action`, `userId`, `paperId`, `reason`, `oldValues`, `newValues` (written after commit).
- **PD-26** The gatepass date is an IST calendar day. A rate is valid when its `effective_from` falls on or before that IST day and its `effective_to` is empty or falls on or after it, comparing each stored timestamp with the IST day bounds (never with a UTC midnight instant). `PREVIOUS_DAY` uses `addDaysUtc(saleDate, -1)`, independent of the server timezone. The policy itself is defined in PD-67.

### 2.6 Quantity precision and trays
- **PD-27** A new or changed purchased quantity must have at most 2 decimal places; more is rejected, never rounded. An unchanged echo of a stored legacy value is tolerated.
- **PD-28** Dairy trays: purchased quantities are summed per vehicle + session + tray type and rounded once, half-up (same rule as Client Trays CT-6.4). Billing does not use this rounding.
A zero purchase produces a calculation key with 0 trays; whether Dairy Trays stores a row for it is decided by Dairy Trays DT-7.1. (This is the note requested by Dairy Trays DT-7.5.)
- **PD-29** The validated quantity is the one used for the amount and stored. Trays follow PD-28.

### 2.7 Financial metadata and taxes
- **PD-30** `units_per_order_unit` is physical packaging only. `pricing_quantity` is the only value used in money calculations.
- **PD-31** GET returns `taxExclusive: true` and `gstApplied: false`.
- **PD-32** Amounts are tax-exclusive. No GST is calculated on purchases.

### 2.8 Tray classification
- **PD-33** An existing entry keeps its tray type on ordinary saves. An entry whose tray type is empty is resolved once from the current rules and the result is stored.
- **PD-34** `reevaluateTrays: true` on the save endpoint (ADMIN only) re-resolves the tray type of every saved entry from the current rules.
- **PD-35** Re-evaluations are logged (entry id, old and new tray type, user, reason). No audit table.

### 2.9 Submission gates and fulfillment
- **PD-36** Completeness (a saved decision for every allocation) is separate from fulfillment.
- **PD-37** Morning submit (and re-finalize of a reopened paper) fails while any stale entry exists. Entries without a snapshot are exempt.
- **PD-38** A paper with no allocation needs `POST /purchases/:paperId/sign-off-zero-allocation` before submit. It records `signed_off_at` and `signed_off_by` on the purchase paper (creating the header). If allocations exist afterwards the sign-off is ignored and the normal completeness rules apply. Full rules: PD-66.
- **PD-39** Null, blank or omitted quantity = untracked / no entry. Explicit `0` = confirmed zero. Cells report `meta.tracked`.
- **PD-40** Each saved cell carries `fulfillmentPercentage` (purchased / allocated × 100).
- **PD-41** A shortfall classed CRITICAL (more than 20% below allocation) sets `shortfallWarning` on the cell, `hasCriticalShortfall` on the screen and `shortfallWarnings[]` on the save response. It never blocks. An optional `shortfallComment` can be sent on save (logged, not stored).
- **PD-42** A confirmed zero satisfies completeness while still reporting a CRITICAL shortfall.

### 2.10 Variance and totals
- **PD-43** Variance always carries `status` (`MATCHED`, `SHORTFALL`, `SURPLUS`) and `signedVariancePercentage`; the absolute percentage is never shown alone. `SURPLUS` follows PD-63.
- **PD-44** A positive purchase with no allocation is `UNPLANNED_ALLOCATION`, percentage `null`, severity `CRITICAL`.
- **PD-45** `estimatedTotalAmount` = sum of pre-filled defaults of cells that are not saved. `persistedTotalAmount` = sum of saved entries (response level includes orphans). The old `totalAmount` is removed.
- **PD-46** The two totals are never combined or presented as one.

### 2.11 Workflow flags, grid and API
- **PD-47** `morningAllocationPending` = morning order demand > 0 AND no active morning allocation rows.
- **PD-48** A missing link, rate or order-unit configuration never fails GET. The cell reports `meta.rateStatus: "MISSING_CONFIGURATION"` with `meta.rateIssue` (`NO_ACTIVE_LINK`, `NO_RATE`, `NO_ORDER_UNIT`), and rate/amount are `null`. On save, a **new zero** entry with missing configuration is not stored and is returned in `ignoredEntries[]` (reason `MISSING_CONFIGURATION`); a new **positive** entry with missing configuration is a 400.
- **PD-49** The grid is built from orders and allocations together.
- **PD-50** Columns = products with positive order demand across both sessions (VA-3.3), plus any product that has an active allocation, so every allocation has a cell.
- **PD-51** A vehicle row appears in a brand's grid only when it has an active allocation for that brand.
- **PD-52** Writes outside NIGHT_SUBMITTED and REOPENED are rejected by the backend (400).
- **PD-53** The frontend binds input controls to `workflow.editable`.
- **PD-54** The submission gate reports everything at once: all missing allocations, stale entries, orphans and the sign-off requirement, as `{ message, missing[], stale[], orphans[], zeroAllocationSignOffRequired, details[] }`. An entry appears in at most one of `stale[]` and `orphans[]` (PD-68).

---

## 3. Harmonizations (approved)

| ID | Rule |
|---|---|
| PD-55 | A missing paper is 404 (was 400). |
| PD-56 | Errors are `{ message, details[] }`; messages use names, not ids. |
| PD-57 | Save returns `{ success, changed, purchasePaperUpdatedAt, deletedEntryIds, ignoredEntries, shortfallWarnings }`. A no-op save returns the current token unchanged; a stale token is still 409. |
| PD-58 | The token is moved with the clock-safe `touchIfTokenMatches`, like the other modules. |
| PD-59 | `confirmDeletions` is removed. Sending it is rejected as an unknown field. |
| PD-60 | `purchasedQty` blank = null. Other fields: unknown properties are rejected. |
| PD-61 | `GET` no longer fails when no allocation exists; it returns an empty grid plus `zeroAllocation { noAllocations, signedOffAt, signOffRequired }`. |
| PD-62 | Audit by server log, not by table (answer 1). |

### 3.1 Audit rulings

| ID | Rule |
|---|---|
| PD-63 | **Purchase cap.** A positive `purchasedQty` may never exceed the cell's current allocated quantity: 400 `<row>: purchased quantity X exceeds allocated quantity Y`. Zero is exempt (PD-1). `SURPLUS` (PD-43) is therefore never produced by a save. It can appear only on an already-saved entry whose allocation was lowered afterwards (the entry is then also stale, PD-37) or on a legacy row. It clears when the user re-saves within the current allocation. |
| PD-64 | **Dairy Trays contract.** A `dairy_tray_paper` header must exist for every paper by the time morning submit runs. It is ensured (a) when a paper is generated, and (b) by every successful zero-allocation sign-off, including the idempotent repeat call, in the same transaction. The Dairy Trays submit gate still fails with `Dairy tray tracking has not been generated for this paper` if the header is somehow missing. |
| PD-65 | **Morning allocation overlap (designed behavior).** In NIGHT_SUBMITTED both purchases and the MORNING allocation are editable (VA-2.1). A MORNING purchase saved earlier becomes stale (`stale: true`, PD-37) if the morning allocation then changes, and blocks submit until the user re-saves against the new allocation. NIGHT purchases cannot be made stale this way, because the NIGHT allocation locks when night is submitted. |
| PD-66 | **Zero-allocation sign-off rules.** Allowed only while purchases are editable (PD-52). Rejected with 400 if any allocation > 0 exists at sign-off time. Requires the current token like every write (PD-13), so a repeat call with a stale token is 409. Idempotent: if already signed off, returns `changed: false` with the current token. Not revocable: no endpoint removes a sign-off. If allocations appear later, the sign-off no longer counts and normal completeness applies (PD-38). Who may sign off remains Open Item O-2. |
| PD-67 | **Gatepass date policy.** `master_brand.gatepass_date_policy` is `SAME_DAY` (default) or `PREVIOUS_DAY`. It decides which IST calendar day a new entry's purchase rate is looked up on: the sale date, or the day before it (PD-26). The resulting `gatepass_date` is frozen on the entry (PD-20). A later change to the brand's policy does not affect saved entries; it applies only to new entries and to an admin rate recalculation (PD-23), which re-resolves the date. |
| PD-68 | **No double reporting.** An orphan (PD-6, PD-7) is never also listed as stale in the submission gate; staleness against a missing allocation is redundant. The entry is reported under `orphans[]` only and is resolved by deletion (PD-8). Stale entries that still have a grid cell are listed under `stale[]` as before. |
| PD-69 | **`purgeAll` is exclusive.** `purgeAll: true` cannot be combined with `entries`, `deletedEntryIds` or `reevaluateTrays`. Any mixed payload is a 400 `purgeAll cannot be combined with entries, deletedEntryIds or reevaluateTrays...`. Other combinations (for example `reevaluateTrays` with `entries`) are unchanged. |

---

## 4. HTTP conventions

| Situation | Status |
|---|---|
| Validation, wrong status, rule rejection, missing configuration on a positive new entry, gate not ready | 400 |
| Paper not found | 404 |
| Stale or missing-match token, retry exhausted, first-save race | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

Throttles: save 10/min, sign-off 10/min, recalculate-rates 5/min per user.

## 5. Endpoints

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /purchases/:paperId` | EMPLOYEE | Build the screen |
| `POST /purchases/:paperId` | EMPLOYEE (`purgeAll`, `reevaluateTrays`: ADMIN) | Save, explicit delete, purge, tray re-evaluation |
| `POST /purchases/:paperId/recalculate-rates` | ADMIN | PD-23 |
| `POST /purchases/:paperId/sign-off-zero-allocation` | EMPLOYEE | PD-38, PD-66 |

### 5.1 Reference data Purchase depends on

| Field | Values | Used for |
|---|---|---|
| `master_brand.gatepass_date_policy` | `SAME_DAY` (default), `PREVIOUS_DAY` | Which IST day a new entry's purchase rate is resolved on (PD-26, PD-67). |

## 6. Schema change

`purchase_paper.signed_off_at TIMESTAMP(3) NULL`, `purchase_paper.signed_off_by INT NULL` (FK `users.id`, ON DELETE SET NULL).
`master_brand.gatepass_date_policy` (`GatepassDatePolicy`, default `SAME_DAY`) is existing reference data, documented in 5.1.

## 7. Open items (not decided; behavior below is an assumption to confirm)

| ID | Item | Current behavior |
|---|---|---|
| O-1 | PD-14 asks for a wider unique index, which is weaker than the existing one. | No index added. |
| O-2 | Who may sign off a zero-allocation paper. | EMPLOYEE (admins pass). |
| O-3 | `shortfallComment` storage. | Logged only; there is no column. |
| O-4 | Estimated total covers unsaved cells only. | As PD-45. |
| O-5 | A new zero entry with missing rate/configuration cannot be stored (rate column is mandatory). | Returned in `ignoredEntries[]`. |
| O-6 | Stale gate also runs on re-finalize of a reopened paper (the same validator). | As implemented. |
| O-7 | Tray re-evaluation allowed in any editable status (NIGHT_SUBMITTED, REOPENED). | As implemented. |
| O-8 | Rate recalculation does not recalculate dairy trays (rates do not affect tray counts). | As implemented. |
| O-9 | Dairy Trays balance guard. | Resolved. Dairy Trays DT-6.5 and DT-10.1 refuse (409) any Purchase write that would leave a stored return above its balance, and the Purchase write is rolled back. On a REOPENED paper later papers are checked too; on NIGHT_SUBMITTED only the current paper is checked, and later papers pick the change up at finalization (DT-10.2). |