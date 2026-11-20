# Purchase Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/purchase/` (controller, service, repository, builder, DTOs, `services/*`, constants, util), plus the purchase types and the shared pieces it uses: `PurchaseVarianceCalculator` and the dairy-tray conversion in `TrayCalculationService`, and the Purchase frontend feature (page, grid, notices, admin panel, hooks).
**Purpose:** Binding business requirements. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 7 (Open Items).
**Rule for changes:** Any behavior change needs a new or amended decision ID, approved by the business owner, before code changes.

Decision IDs `PD-1` to `PD-54` are the 54 approved decisions, numbered as approved. `PD-55` onward record harmonizations with the other modules, the answers given to the open questions, and the audit rulings (PD-63 to PD-70). `PD-71` onward record the answers to the behavioral specification questions Q1 to Q17 (`purchase-behavioral-spec.md`). Rules amended by those answers are marked **(amended)**.
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
| Orphan | A saved entry that cannot be drawn in any grid cell, **or that has no current allocation** (PD-7, amended). |
| Stale | A saved entry whose allocated quantity snapshot differs from the current allocation quantity (PD-37, amended). Rows with no snapshot at all are never stale. |
| Echo | The `sourceAllocationId` and `sourceAllocatedQty` of the allocation the user saw, sent back on save (PD-4). |

---

## 2. Decisions PD-1 to PD-54

### 2.1 Zero quantities and entity validation
- **PD-1 (amended)** Zero quantities bypass only the quantity-versus-allocation check (PD-63). They must still pass entity checks: product, vehicle and distributor exist (else 400, PD-2). An active distributor-product link is required for a new row **with a positive quantity** (else 400). A new row with a zero quantity and no active link is not stored and is returned in `ignoredEntries[]` (PD-48). A saved row keeps its frozen link (PD-21), so the link check applies to new rows only. *(Q2: resolves the former conflict between PD-1 and PD-48.)*
- **PD-2** An invalid identifier is a 400. Ids are bounded 1 to 2147483647, so an oversized id is a 400, never a database error.
- **PD-3 (amended)** A zero entry is neither automatically kept nor dropped. A zero for a cell that was never allocated and never saved is ignored and returned in `ignoredEntries[]` (reason `NOT_ALLOCATED_AND_NOT_SAVED`), whether or not a link exists. A zero for an allocated cell with an active link is stored as a confirmed zero. A zero for an allocated cell with no link, no rate or no order unit is not stored and is returned with reason `MISSING_CONFIGURATION` (PD-48).
- **PD-4 (amended)** The client echoes `sourceAllocationId` and `sourceAllocatedQty` (the allocation it saw) for **every entry whose cell has a current allocation**, saved or not (else 400 `...must be sent back exactly as loaded`). They are compared with the current allocation; a difference is a 400 `Allocation modified or removed: <row>`. A zero or positive entry that targets a saved cell whose allocation was removed is the same 400. *(Q3: the echo was mandatory only for saved cells. It is now mandatory for every allocated cell, so an allocation changed in Vehicle Allocation since the screen was loaded is always detected.)*

### 2.2 Deletion guardrails
- **PD-5** Ordinary deletion is by `deletedEntryIds[]`. Every id must belong to this paper (else 400).
- **PD-6** Hidden, unrendered or orphaned entries are never deleted because they are absent from the payload. Nothing in the save deletes by omission.
- **PD-7 (amended)** Orphans are returned by GET in `orphanedEntries[]` (with entry id, names, quantity, rate, amount) for an Unassigned / Legacy drawer. An entry is an orphan when it has no grid cell, or when no current allocation exists for it. An orphan is never drawn in a cell and carries no variance. *(Q4: an entry whose allocation was removed used to stay drawn and stale, with no stated way out.)*
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
- **PD-23** `POST /purchases/:paperId/recalculate-rates`: ADMIN only, REOPENED papers only, whole paper, requires `expectedUpdatedAt` and a trimmed non-empty `reason`. Refreshes link, rate, gatepass date, `units_per_order_unit`, `pricing_quantity`, `pricing_unit` and the amount. It includes orphan entries (Q13 of the spec: an orphan with a deactivated link or missing rate fails the whole request, PD-24; it is removed by deletion first).
- **PD-24** All-or-nothing: if any entry has no active link, no rate or no order-unit configuration, the whole request fails (400 with every problem listed) and nothing changes. If nothing differs, the token does not move.
- **PD-25** No audit table. Every changed entry is logged through the server logger: `action`, `userId`, `paperId`, `reason`, `oldValues`, `newValues` (written after commit).
- **PD-26** The gatepass date is an IST calendar day. A rate is valid when its `effective_from` falls on or before that IST day and its `effective_to` is empty or falls on or after it, comparing each stored timestamp with the IST day bounds (never with a UTC midnight instant). `PREVIOUS_DAY` uses `addDaysUtc(saleDate, -1)`, independent of the server timezone. The policy itself is defined in PD-67.

### 2.6 Quantity precision and trays
- **PD-27 (clarified)** A new or changed purchased quantity must have at most 2 decimal places; more is rejected, never rounded. An unchanged echo of a stored legacy value is tolerated. Because that tolerance needs the stored value, the rule is checked inside the transaction, after the status and token checks and the allocation checks (so a stale token is reported as 409 before a precision error). *(Spec Q11.)*
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
- **PD-37 (amended)** Morning submit (and re-finalize of a reopened paper) fails while any stale entry exists. An entry is stale when its saved allocated **quantity** differs from the current allocation's quantity. The allocation row's id is not compared: a row removed (0) and re-added with the same quantity does not make the entry stale. An entry whose allocation no longer exists is an orphan (PD-7), not stale (PD-68). Entries without a snapshot are exempt. *(Q15.)*
- **PD-38** A paper with no allocation needs `POST /purchases/:paperId/sign-off-zero-allocation` before submit. It records `signed_off_at` and `signed_off_by` on the purchase paper (creating the header). If allocations exist afterwards the sign-off is ignored and the normal completeness rules apply. Full rules: PD-66.
- **PD-39** Null, blank or omitted quantity = untracked / no entry. Explicit `0` = confirmed zero. Cells report `meta.tracked`.
- **PD-40** Each saved cell carries `fulfillmentPercentage` (purchased / allocated x 100).
- **PD-41 (amended)** A shortfall classed CRITICAL (more than 20% below allocation) sets `shortfallWarning` on the cell, `hasCriticalShortfall` on the screen and `shortfallWarnings[]` on the save response. It never blocks. An optional `shortfallComment` can be sent on save (logged, not stored). On save, `shortfallWarnings[]` and the critical-shortfall log line cover only the entries that request actually stores or changes: not entries left out (`ignoredEntries`), not entries sent back unchanged, and nothing on a no-op save. *(Q12.)*
- **PD-42** A confirmed zero satisfies completeness while still reporting a CRITICAL shortfall.

### 2.10 Variance and totals
- **PD-43** Variance always carries `status` (`MATCHED`, `SHORTFALL`, `SURPLUS`) and `signedVariancePercentage`; the absolute percentage is never shown alone. `SURPLUS` follows PD-63.
- **PD-44 (clarified)** A positive purchase with no allocation is `UNPLANNED_ALLOCATION`, percentage `null`, severity `CRITICAL` in the variance calculator. Since a saved entry with no current allocation is an orphan (PD-7, amended) and carries no variance, this status is no longer produced on the grid; it remains defined for the calculator.
- **PD-45** `estimatedTotalAmount` = sum of pre-filled defaults of cells that are not saved. `persistedTotalAmount` = sum of saved entries (response level includes orphans). The old `totalAmount` is removed.
- **PD-46** The two totals are never combined or presented as one.

### 2.11 Workflow flags, grid and API
- **PD-47** `morningAllocationPending` = morning order demand > 0 AND no active morning allocation rows.
- **PD-48 (amended)** A missing link, rate or order-unit configuration never fails GET. The cell reports `meta.rateStatus: "MISSING_CONFIGURATION"` with `meta.rateIssue` (`NO_ACTIVE_LINK`, `NO_RATE`, `NO_ORDER_UNIT`), and rate/amount are `null`. On save, a **new zero** entry with missing configuration (link, rate or order unit) is not stored and is returned in `ignoredEntries[]` (reason `MISSING_CONFIGURATION`); a new **positive** entry with missing configuration is a 400.
- **PD-49** The grid is built from orders and allocations together.
- **PD-50** Columns = products with positive order demand across both sessions (VA-3.3), plus any product that has an active allocation, so every allocation has a cell.
- **PD-51** A vehicle row appears in a brand's grid only when it has an active allocation for that brand.
- **PD-52** Writes outside NIGHT_SUBMITTED and REOPENED are rejected by the backend (400).
- **PD-53** The frontend binds input controls to `workflow.editable`.
- **PD-54** The submission gate reports everything at once: all missing allocations, stale entries, orphans and the sign-off requirement, as `{ message, missing[], stale[], orphans[], zeroAllocationSignOffRequired, details[] }`. An entry appears in at most one of `stale[]` and `orphans[]` (PD-68). Paper surfaces the gate's `details[]` (and `requiredActions`, PA-7.4); the structured arrays are the gate's own contract.

---

## 3. Harmonizations (approved)

| ID | Rule |
|---|---|
| PD-55 | A missing paper is 404 (was 400). |
| PD-56 | Errors are `{ message, details[] }`; messages use names, not ids. See PD-76 for what is reported together. |
| PD-57 (amended) | Save returns `{ success, changed, purchasePaperUpdatedAt, deletedEntryIds, ignoredEntries, shortfallWarnings }`. A no-op save returns the current token unchanged; a stale token is still 409. `ignoredEntries[].reason` is `NOT_ALLOCATED_AND_NOT_SAVED`, `MISSING_CONFIGURATION` or `UNCHANGED_EXCEEDS_ALLOCATION` (PD-63). Success is HTTP 200 (PD-71). |
| PD-58 | The token is moved with the clock-safe `touchIfTokenMatches`, like the other modules. |
| PD-59 | `confirmDeletions` is removed. Sending it is rejected as an unknown field. |
| PD-60 | `purchasedQty` blank = null. Other fields: unknown properties are rejected. |
| PD-61 (amended) | `GET` no longer fails when no allocation exists; it returns an empty grid plus `zeroAllocation { noAllocations, signedOffAt, signOffRequired }`. `signOffRequired` is true only when there is no allocation, no sign-off recorded **and a sign-off can be recorded now** (`workflow.editable`, PD-66). `noAllocations` is independent of status. *(Q6.)* |
| PD-62 | Audit by server log, not by table (answer 1). |

### 3.1 Audit rulings

| ID | Rule |
|---|---|
| PD-63 (amended) | **Purchase cap.** A positive `purchasedQty` may never exceed the cell's current allocated quantity: 400 `<row>: purchased quantity X exceeds allocated quantity Y`. Zero is exempt (PD-1). **Exception:** a saved entry that is already above its (lowered) allocation and is sent back with its stored quantity unchanged is left as it is, returned in `ignoredEntries[]` with reason `UNCHANGED_EXCEEDS_ALLOCATION`, and does not fail the request; it stays stale and keeps blocking submission (PD-37) until the user lowers it within the allocation. Raising or changing it is still rejected. `SURPLUS` (PD-43) is therefore never produced by a save. It can appear only on an already-saved entry whose allocation was lowered afterwards, or on a legacy row. *(Q5.)* |
| PD-64 | **Dairy Trays contract.** A `dairy_tray_paper` header must exist for every paper by the time morning submit runs. It is ensured (a) when a paper is generated, and (b) by every successful zero-allocation sign-off, including the idempotent repeat call, in the same transaction. The Dairy Trays submit gate still fails with `Dairy tray tracking has not been generated for this paper` if the header is somehow missing. |
| PD-65 | **Morning allocation overlap (designed behavior).** In NIGHT_SUBMITTED both purchases and the MORNING allocation are editable (VA-2.1). A MORNING purchase saved earlier becomes stale (`stale: true`, PD-37) if the morning allocation quantity then changes, and blocks submit until the user re-saves against the new allocation. NIGHT purchases cannot be made stale this way, because the NIGHT allocation locks when night is submitted. |
| PD-66 (amended) | **Zero-allocation sign-off rules.** Allowed only while purchases are editable (PD-52). Rejected with 400 if any allocation > 0 exists at sign-off time. Requires the current token like every write (PD-13), so a repeat call with a stale token is 409. Idempotent: if already signed off, returns `changed: false` with the current token. Not revocable: no endpoint removes a sign-off. If allocations appear later, the sign-off no longer counts and normal completeness applies (PD-38). **If all allocations later disappear again, the recorded sign-off counts again** (it still describes a paper with no allocation); no re-sign-off is required. Any employee may sign off (admins pass). *(Q7, Q9; closes Open Item O-2.)* |
| PD-67 | **Gatepass date policy.** `master_brand.gatepass_date_policy` is `SAME_DAY` (default) or `PREVIOUS_DAY`. It decides which IST calendar day a new entry's purchase rate is looked up on: the sale date, or the day before it (PD-26). The resulting `gatepass_date` is frozen on the entry (PD-20). A later change to the brand's policy does not affect saved entries; it applies only to new entries and to an admin rate recalculation (PD-23), which re-resolves the date. The day does not depend on the delivery session. *(Q14.)* |
| PD-68 | **No double reporting.** An orphan (PD-6, PD-7) is never also listed as stale in the submission gate. The entry is reported under `orphans[]` only and is resolved by deletion (PD-8). Stale entries that still have a cell and an allocation are listed under `stale[]`. |
| PD-69 | **`purgeAll` is exclusive.** `purgeAll: true` cannot be combined with `entries`, `deletedEntryIds` or `reevaluateTrays`. Any mixed payload is a 400 `purgeAll cannot be combined with entries, deletedEntryIds or reevaluateTrays...`. Other combinations (for example `reevaluateTrays` with `entries`) are unchanged. |
| PD-70 | **Sign-off visibility.** Whether a zero-allocation sign-off is still pending (no allocation above 0 and no `signed_off_at`) is exposed to Paper through `PurchaseValidationService.isZeroAllocationSignOffPending`, the same test the submission gate uses for `zeroAllocationSignOffRequired` (PD-54). Paper uses it for readiness warnings and `requiredActions` (PA-19.5). It only reads and changes no behavior of PD-38 or PD-66. The sign-off itself is still possible only while purchases are editable (PD-52), so never in DRAFT. |

### 3.2 Decisions from the behavioral specification (Q1 to Q17)

| ID | Rule |
|---|---|
| PD-71 | **Success status is 200** for save, recalculate-rates and sign-off, including a save that changed nothing, as Orders, Client Trays and Vehicle Allocation. *(Q1.)* |
| PD-72 | **Token format, lost response, timeout, scoping (binding, as the sibling modules).** A token value must be ISO-8601; any parseable value is accepted, a well-formed value that differs from the current token is 409, an unparseable one is 400 `Invalid expectedUpdatedAt`. If a write succeeded but its response never reached the client, a retry with the old token returns 409 (no idempotency key); the same payload sent with the NEW token is a safe no-op. A transaction that exceeds its time limit (10 s) saves nothing and returns 409 `The request took too long and nothing was saved. Please retry.` Any employee (and any admin) may read and write the purchases of any paper; there is no per-group scoping. *(Q8; same as OD-12.9, OD-12.10, OD-6.2, OD-1.3, CT-1.4, VA-1.4.)* |
| PD-73 | **Deleting saved entries (binding, as implemented).** Any employee may delete any saved entry of an editable paper through `deletedEntryIds`, with no confirmation and no mandatory reason. `reason` stays optional and is logged with the user id (PD-25). *(Q10.)* |
| PD-74 | **Request-structure errors are reported alone, before entry validation.** Purge conflicts, the empty-entries guard (PD-9) and unknown `deletedEntryIds` (PD-5) are thrown by themselves. Problems with the entries (unknown ids, links, duplicates, allocation changes, over-allocation, precision) are collected together (PD-56); pricing problems of new positive entries (missing rate or order unit) are collected together and reported after the entry problems are clear. *(Q13.)* |
| PD-75 | **Cost of loading (binding, operational).** GET and every write load all order items of the paper (both sessions) and all allocations, and a save updates changed rows one query at a time, inside a 10 s transaction. Nothing changes now. Before go-live the screen, a save with a large payload and the submit gate are measured on the largest real paper; if they approach the transaction limit, the remedy (batching the updates, narrowing the order-item read) is decided then as a new decision. *(Q16; as VA-13.2, CT-10.9.)* |
| PD-76 | **Unused code is left for a separate cleanup (operational).** The repository methods `findProductLinkRateForDate` and `findPurchaseRateForDistributorProduct` (UTC-midnight semantics that contradict PD-26 and must not be wired), `findVehicles`, `findDistributorProcurementRules`, `findLatestVehicleAllocationPaper`, `findVehicleAllocationPapersForOrderPaper`, `getProductLink`, the `PurchaseCommercialContext` interface and the commented-out token helpers are not used. Unallocated cells keep rate 0 and amount 0 in the response (not null). *(Q17.)* |
| PD-77 | **Frontend reload rules after a failed write (binding, UI).** After a save, orphan removal or purge fails with HTTP 409: (a) a 409 meaning the data changed (stale token, first-save race, exhausted serialization retries) discards the unsaved edits, reloads the data and shows the toast "Purchase data changed"; (b) a 409 `took too long and nothing was saved` changes nothing: the edits are kept, no reload happens and the message is shown; (c) a 409 that carries `details[]` (a dairy return conflict, DT-6.5) also changed nothing: the edits are kept, no reload happens and the message with its details is shown; (d) any other failure (400) keeps the edits and shows the message with its details as a list (PD-56). A retry after (b) or (c) sends the same payload with the same token. The classification reads the response body: the timeout wording (`took too long and nothing was saved`) and the presence of `details[]`. *(Q18; same as OD-12.10, CT-9.7, VA-14.5.)* |
| PD-78 | **Refetch policy of the purchase query (binding, UI).** The purchase query is not refetched on window focus or on reconnect, so the loaded data and its token cannot change under unsaved edits. It loads when the page mounts and is refetched after every successful write and after a 409 of kind (a) in PD-77. The draft keeps the token captured when editing started (PD-12), so even a later refetch would not change what a save is checked against. No other component may mount an observer of the same query key while a draft has unsaved edits. *(Q19; same as OD-12.10, CT-9.7, VA-14.5.)* |

---

## 4. HTTP conventions

| Situation | Status |
|---|---|
| Successful save, sign-off, recalculate-rates, including one that changed nothing | 200 |
| Validation, wrong status, rule rejection, missing configuration on a positive new entry, gate not ready | 400 |
| Paper not found | 404 |
| Stale or missing-match token, retry exhausted, first-save race, transaction timeout (PD-72), dairy return conflict (DT-6.5) | 409 |
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
No schema change comes from the Q1 to Q17 decisions.

## 7. Open items

| ID | Item | Current behavior |
|---|---|---|
| O-1 | PD-14 asks for a wider unique index, which is weaker than the existing one. | No index added. |
| O-3 | `shortfallComment` storage. | Logged only; there is no column. |
| O-4 | Estimated total covers unsaved cells only. | As PD-45. |
| O-5 | A new zero entry with missing rate/configuration cannot be stored (rate column is mandatory). | Returned in `ignoredEntries[]` (PD-48). |
| O-6 | Stale gate also runs on re-finalize of a reopened paper (the same validator). | As implemented. |
| O-7 | Tray re-evaluation allowed in any editable status (NIGHT_SUBMITTED, REOPENED). | As implemented. |
| O-8 | Rate recalculation does not recalculate dairy trays (rates do not affect tray counts). | As implemented. |
| O-9 | Dairy Trays balance guard. | Resolved. Dairy Trays DT-6.5 and DT-10.1 refuse (409) any Purchase write that would leave a stored return above its balance, and the Purchase write is rolled back. On a REOPENED paper later papers are checked too; on NIGHT_SUBMITTED only the current paper is checked, and later papers pick the change up at finalization (DT-10.2). |

Resolved: **O-2** (who may sign off) is decided in PD-66. **O-10** (frontend reload rules and refetch policy) is decided in PD-77 and PD-78.

---

## 8. Change log (Q1 to Q17)

| ID | Type | Summary |
|---|---|---|
| PD-71 | New (code) | Save, recalculate-rates and sign-off return 200 |
| PD-1, PD-3, PD-48 | Amended (code) | A new zero without an active link is ignored (`MISSING_CONFIGURATION`), not a 400; only a positive quantity fails |
| PD-4 | Amended (code) | The allocation echo is mandatory for every allocated cell |
| PD-7, PD-37, PD-44, PD-68 | Amended (code) | An entry with no current allocation is an orphan; stale compares quantity only |
| PD-63, PD-57 | Amended (code) | An unchanged over-allocation entry is left as is and reported (`UNCHANGED_EXCEEDS_ALLOCATION`) instead of failing the save |
| PD-61 | Amended (code) | `signOffRequired` is true only when a sign-off can be recorded now |
| PD-41 | Amended (code) | Shortfall warnings and the log only for stored or changed entries |
| PD-27 | Clarified | Precision is checked inside the transaction because of the legacy-echo tolerance |
| PD-66 | Amended (doc) | A sign-off counts again if allocations disappear; any employee may sign off |
| PD-67 | Clarified | Gatepass day is independent of the session |
| PD-72 to PD-76 | New (doc) | Token and retry rules, scoping, deletion rights, error grouping, scale measurement, unused code |
| PD-77 | New (UI code) | A timeout 409 and a 409 with `details[]` keep the edits and do not reload; other "data changed" 409s discard the draft and reload (Q18) |
| PD-78 | New (UI code) | The purchase query is not refetched on window focus or reconnect (Q19) |

---

## 9. Verification note (test run and frontend decisions)

The Purchase scenario specs were executed (139 passed, 2 todo; the 3 initial failures were test setup defects, see `purchase-behavioral-spec.md` section G). **No decision in this file was changed by the run.** One clarification, no behavior change:

- A missing purchase rate or order-unit configuration (PD-48) can only appear **after** ordering. An order line cannot be saved without a resolvable selling rate (OD-9.4), so the missing-rate states are reached when master data changes after the order and the allocation exist. This is the situation PD-48, PD-23 and PD-24 already describe.

The frontend decisions PD-77 and PD-78 were then implemented (`utils/purchase-conflict.ts`, `PurchasePage.tsx`, `useSavePurchase.ts`, `usePurchase.ts`) and the frontend scenarios were written (`purchase.scenario.ui.spec.tsx`, not yet run).

Open items still open: the scale measurement of PD-75, and the undecided behavior of an entry whose `category` does not match its allocation key (spec scenario PU-105, to be decided and recorded here before a test is written).