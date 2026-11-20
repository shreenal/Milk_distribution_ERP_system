# Vehicle Allocation Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/vehicle-allocation/` only (controller, service, repository, builder, DTOs, `services/*`, constants, util), plus the allocation types in `types/vehicle-allocation.types.ts` and the Vehicle Allocation frontend feature (page, hooks, status component; see Section 14).
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. Section 15 records the implementation policies already resolved.
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`VA-n`) are stable. Cite them in code comments, PRs and reviews. "Business decision #n" refers to the numbered list of decisions approved by the business owner (#1 to #30); Section 16 maps them to VA IDs. "Q-n" refers to the open questions of the behavioral specification discovery (`vehicle-allocation-behavioral-spec.md`), all resolved in Section 15.

Where a rule is marked **(interpretation)** the business owner approved the outcome but not the exact mechanism; the approved mechanism is recorded in Section 15.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Order paper | One per business day. |
| Session | `NIGHT` or `MORNING`. Each order sheet inherits its group's delivery session. Allocation is planned separately per session. |
| Required quantity | Sum of `ordered_qty` (never delivered quantity) of all order lines of the session, per distributor + category + product. The distributor is the one frozen on the order line. |
| Grid | One table per distributor + category + brand. Columns are products, rows are vehicles. |
| Allocation paper | `vehicle_allocation_paper`: one header per order paper and session. Its `updated_at` is the concurrency token. Created on the first changing save. |
| Allocation row | `vehicle_allocation`: one stored quantity for vehicle + distributor + category + product (+ session via the paper). Only quantities greater than 0 are stored (sparse). |
| Snapshot | `required_qty_at_save` on an allocation row: the required quantity of its product at the moment it was last saved. |
| Concurrency token | `vehicle_allocation_paper.updated_at`, exposed as `vehicleAllocationPaperUpdatedAt`, sent back as `expectedUpdatedAt`. |
| Full snapshot save | A save describes the complete intended allocation of one session. |
| Explicit deletion | A payload entry whose `allocatedQty` is 0 (or blank). |
| Omission | A stored row whose key does not appear in the payload at all. |
| Stale | An allocation that no longer matches the current valid state (Section 6). |
| Anomaly | Stored evidence (`vehicle_allocation_anomaly`) of an invalid allocation row that was removed. |
| Flagged / Reconciled | The two stored states of an anomaly. |
| Coverage | Allocated total equals required total within 0.005 (VA-8.2). |

---

## 1. Access and Roles

**VA-1.1** All Vehicle Allocation endpoints require login (JWT) and the `EMPLOYEE` role. `ADMIN` also passes via the role hierarchy. No endpoint is admin-only. *(Business decision #27.)*

**VA-1.2 Administrators cannot bypass any rule (binding).** Vehicle, distributor, quantity, concurrency, deletion and submission rules apply identically to every role. There is no admin-only code path in this module. *(#27.)*

**VA-1.3** Save and reconcile are each throttled to 10 requests per minute per user. View uses the global limit. Exceeding a limit returns 429. This backend rate limit is the hard enforcement; the frontend batching guidance is in Section 14.1. *(#29.)*

**VA-1.4 No per-paper or per-group scoping (binding, as implemented).** Any employee (and any admin) may view and edit the allocation of any paper and session. There is no per-group authorization in Vehicle Allocation (same as Orders OD-1.3 and Client Trays CT-1.4). *(Q15.)*

---

## 2. Workflow: what can be done at each paper status

**VA-2.1 Status matrix (binding):**

| Paper status | View | Save / reconcile NIGHT | Save / reconcile MORNING |
|---|---|---|---|
| DRAFT | Yes | Yes | Yes |
| NIGHT_SUBMITTED | Yes | No | Yes |
| MORNING_SUBMITTED | Yes | No | No |
| FINALIZED | Yes | No | No |
| REOPENED | Yes | No | No |

*(Business decisions #15, #17. Changed: MORNING is now editable during DRAFT.)*

**VA-2.2 Session isolation (binding).** The two sessions are independent records. Submitting night locks NIGHT only; a MORNING plan saved earlier is preserved untouched and remains editable until morning is submitted. A status change never discards or invalidates the other session's saved plan. *(#17.)*

**VA-2.3 Workflow error feedback (binding).** A write rejected because the paper status no longer allows the requested session returns HTTP 400 with a message that names the status, names the session(s) currently open for editing (or says none is), and tells the user to refresh the allocation data. Example: `The NIGHT allocation can no longer be edited because the paper is now NIGHT_SUBMITTED. The session currently open for editing is MORNING. Refresh the allocation data and try again.` *(#20.)*

**VA-2.4 REOPENED never edits allocations (binding).** Reopening corrects delivery results only. Both sessions stay read-only. *(#15.)*

---

## 3. Grid View (`GET /vehicle-allocations/:paperId/vehicle-allocations?session=`)

**VA-3.1** Missing paper returns **404** `Order paper not found`. `session` must be `NIGHT` or `MORNING` (else 400). *(#21.)*

**VA-3.2 What the grid shows.** One grid per distributor + category + brand with positive required demand. Columns: Brand, Product Group, Product Type, then size label (NON_MILK adds a Packaging Type level). Rows: one per active vehicle. Cells show the saved quantity or 0. `totals` holds the required quantity per product (`product_<id>`), rounded to 2 decimals.

**VA-3.3 Zero-demand products are hidden (binding).** A product whose total required quantity is 0 (no order lines with a positive quantity) is not a column, not a required key and not part of coverage. A product with positive demand always appears. *(#14, #30.)*

**VA-3.4 Response blocks:**
- `workflow` `{ status, editable }`. `editable` follows VA-2.1 for the requested session.
- `allocations` grids (as above).
- `groupSummaries`: reference view of what each delivery group ordered, grouped by brand. Unchanged, **including** its zero-demand columns and its Packaging Type level for milk; VA-3.3 and OD-3.7 do not apply to it. *(#23, Q9.)*
- `vehicleAllocationPaperUpdatedAt`: the token, `null` until the first changing save.
- `completion` `{ isComplete, lines[] }`: one line per product with required, allocated and `isComplete`. This is what the UI uses to distinguish incomplete from submission-ready. *(#18.)*
- `staleAllocations[]`: stored rows that are currently stale or invalid (VA-6). Drives the warning badge. *(#4.)*
- `anomalies[]`: stored FLAGGED evidence of rows already removed (VA-7). Drives the same badge. *(#5.)*
- `submission` `{ ready, coverageComplete, hasUnresolvedAnomalies, hasDistributorConflict }`.

**VA-3.5 Saved rows that are invalid are not drawn in the grid** (inactive vehicle, product no longer required from that distributor, link no longer active). They are listed in `staleAllocations` instead, so they are never silently hidden. They also do not count towards coverage (VA-8.2).

**VA-3.6 Vehicle order is deterministic (binding).** Active vehicles are sorted by `vehicle_name` ascending (vehicles without a name last), then by `id`. The same vehicle set always renders in the same order. *(#22.)*

**VA-3.7** The view is read-only. It never writes, never advances the token and never cleans up. *(Cleanup is a write and follows VA-9.)*

**VA-3.8 Deactivated products keep their demand (binding).** A product that is deactivated in master data but still has positive demand in the session's orders remains required, stays a grid column, counts in coverage and can be allocated and submitted. Product active status never changes what is required; only order demand and the distributor link do (VA-6.1, VA-8.2).

---

## 4. Input Validation Rules (save request)

Body: `{ session, allocations: [{ vehicleId, distributorId, category, productId, allocatedQty }], expectedUpdatedAt, confirmDeletions? }`

**VA-4.1 Quantity (binding).** A JSON number from 0 to 10,000 with **at most 2 decimal places**. `5`, `5.5`, `5.25` are valid. `5.255` is **rejected** (400), never rounded. Strings (`"5"`), NaN, Infinity and negatives are rejected. Blank (`""`) and `null` are accepted and mean 0. **An omitted `allocatedQty` is rejected (400), it is not read as 0** *(Q11)*. The 10,000 limit applies to each cell; the total required for a product across clients has no cap of its own. A product required above 10,000 is therefore spread over several vehicles. This is accepted while no real paper approaches it *(Q8)*. Checked at the API boundary, before the transaction. *(#9, #7.)*

**VA-4.2 Identifiers.** `vehicleId`, `distributorId`, `productId` are integers 1 to 2147483647. `category` must be `MILK` or `NON_MILK`. `session` must be `NIGHT` or `MORNING`.

**VA-4.3 Array and extra fields.** `allocations` has at most 5,000 items. **An empty array is valid in shape** (VA-5.13). Unknown extra fields are rejected (400).

**VA-4.4 `expectedUpdatedAt` is required** on every write (VA-9.2). `confirmDeletions` is optional boolean.

**VA-4.5 Capacity is not validated (binding).** The system does not compare allocations with vehicle capacity and has no capacity-based restriction anywhere. Employees are responsible for respecting capacity manually. *(#3.)*

**VA-4.6 Validation order.** Shape and precision checks (VA-4.1 to VA-4.4) run before the transaction. All business checks run inside the transaction and before any write.

**VA-4.7 Unwritten rules recorded as binding (Q14).**
- The `:paperId` URL segment is digits only, 1 to 2147483647 (else 400 `Invalid id`); leading zeros are read as the number (`007` is 7).
- Shape validation (VA-4.6) comes before the paper lookup: an invalid body for a paper that does not exist is 400, not 404.
- When a stored row is invalid for more than one reason, the reason recorded is the first of: `VEHICLE_INACTIVE`, `NOT_REQUIRED`, `LINK_INACTIVE`.

---

## 5. Save (`POST /vehicle-allocations/:paperId/vehicle-allocations`)

**VA-5.1 Full snapshot (binding).** A save is the complete intended allocation for the session. Rows absent from the request are treated as potential deletions (VA-5.4). *(#8.)*

**VA-5.2 Atomic.** The whole save is one serializable transaction. If anything fails, nothing is saved. On a database serialization conflict the system makes at most 3 total attempts, then returns 409 `Your request conflicted with another update and could not be completed. Please retry.` Retries never skip the token check and never apply the user's intent to newer data (the retried attempt re-reads and re-checks the token). A transaction that exceeds its time limit (10 s) saves nothing and also returns 409 `The request took too long and nothing was saved. Please retry.` This is accepted as is, the same as Orders OD-6.2 and Client Trays CT-5.2; it is revisited only if real papers approach the limit (VA-13.2). The same applies to reconcile. *(#28, Q5.)*

**VA-5.3 Order of checks inside the transaction:** paper exists (404) → session editable (400, VA-2.3) → token (409, VA-9) → duplicates (400) → vehicle references (400) → distributor and product references (400) → distributor-product links (400) → required (400) → one distributor per vehicle per category (400) → deletion confirmation (400) → write.

**VA-5.4 Deletions (binding).**
- **Explicit deletion:** an entry with quantity 0 or blank for a stored row removes it. **No confirmation.** *(#7.)*
- **Omission:** a stored row whose key is not in the payload at all is rejected with 400 `droppedAllocations` (vehicle, distributor, category and product **names**, quantity) and the current token, unless `confirmDeletions: true` is sent. A missing row cannot by itself establish intent. *(#7, #8.)*
- **An empty `allocations` array is not a confirmation (binding).** When rows are stored, an empty snapshot omits every one of them and is answered with `droppedAllocations` like any other omission. Only `confirmDeletions: true` removes them. *(Q4.)*
- Invalid stored rows (VA-6.1) are not counted as omissions: they are cleaned automatically (VA-6.3).
- A zero entry for a row that does not exist is a no-op.

**VA-5.5 A confirmation is bound to a data version (binding).** The confirmed save carries `expectedUpdatedAt` and is checked like any other save. If the allocation changed after the user saw the list, the token no longer matches and the save is a 409. A stale confirmation is never applied to changed data. *(#7, #8.)*

**VA-5.6 Only quantities greater than 0 are stored** (sparse). Zero and blank are the same as no row. *(#7.)*

**VA-5.7 Link validation only for quantity > 0 (binding).** The distributor must have an **active** product link, checked only for rows with quantity > 0. Zero and blank entries are exempt. *(#11.)* Error: `<Distributor> does not have an active link to <Product>`. All offending rows are listed in `details`.

**VA-5.8 References are validated before saving (binding).** Every `vehicleId`, `distributorId` and `productId` in the payload must exist, **for every entry including zero** (otherwise 400 `Vehicle <id> does not exist`, `Distributor <id> does not exist` or `Product <id> does not exist`, all listed in `details`). This follows Purchase PD-1. A vehicle with a **positive** quantity must also be active (otherwise 400 `Vehicle "<name>" is inactive and cannot receive allocations`). A 0 entry on an inactive vehicle is allowed, so the employee can clear it. A database foreign-key failure must never surface as 500. *(#2, #16, interpretation: zero on inactive; Q10: entity checks for zero.)*

**VA-5.9 Required check (binding).** Every row with quantity > 0 must match a distributor + category + product that is currently required (positive demand) in this session's orders. Error names distributor, category and product.

**VA-5.10 One distributor per vehicle per category per session (binding).** Among rows with quantity > 0, a vehicle cannot take the same category from two distributors in a session. Zero and blank entries are exempt from this check, as they are from VA-5.7. The reason is the dairy gatepass: each vehicle's gatepass identifies a single distributor. The rule applies to each category independently: a vehicle may take milk from one distributor and non-milk from another. The message names the vehicle, category and distributors. *(#10.)*

**VA-5.11 Duplicates.** The same vehicle + distributor + category + product more than once in one request is rejected (400), even with 0. The message uses names.

**VA-5.12 Incomplete work can be saved (binding).** Under- and over-allocation are accepted at save. Completeness is enforced only at submission (Section 8). The UI shows completion from `completion` and `submission`. *(#18.)*

**VA-5.13 Empty snapshots (binding).** An empty `allocations` array is valid while the session is editable. With nothing stored it is a no-op (VA-5.15). With rows stored it needs `confirmDeletions: true` (VA-5.4). An empty allocation passes submission only if the session has no positive demand (VA-8.2). *(#13, Q4.)*

**VA-5.14 What is written.** Each stored row gets its quantity and the snapshot `required_qty_at_save` (the product's required quantity at save time). Changes are applied by diff (delete, update, insert), not by delete-all.

**VA-5.15 No-op save.** If the rows, snapshots and anomaly states are all unchanged, nothing is written, the token is **not** advanced and the response is `changed: false` with the current token (null if never saved). A stale token is still 409 for a no-op.

**VA-5.16 Response (binding):** `{ success, changed, vehicleAllocationPaperUpdatedAt, flaggedAnomalies, reconciledAnomalies }`. `vehicleAllocationPaperUpdatedAt` is the NEW token when something changed, so the frontend can save again without reloading the grid. The HTTP status is 200 (VA-10), including for a no-op. *(#12, Q1.)*

**VA-5.17 Inactive distributors do not block allocation (binding, intentional).** Following the Orders rule (OD-8.8), a distributor's own active status is never checked by this module. Allocation and submission are allowed for an inactive distributor as long as the product has positive required demand (VA-5.9) and the distributor has an **active product link** (VA-5.7). `LINK_INACTIVE` (VA-6.1) is the correct and sufficient boundary; no separate distributor-status check exists or may be added. (An unknown distributor id is a different case and is rejected, VA-5.8.)

---

## 6. Stale Allocations

**VA-6.1 What is stale (binding, interpretation).** A stored row is stale when, compared with the CURRENT orders and master data of its session:
1. its vehicle is inactive (`VEHICLE_INACTIVE`), or
2. its distributor + category + product is no longer required (`NOT_REQUIRED`, includes demand that dropped to 0 or moved to another distributor), or
3. its distributor no longer has an active product link (`LINK_INACTIVE`), or
4. its product's required quantity differs from the snapshot taken when the row was saved (`REQUIREMENT_CHANGED`, tolerance 0.005).
Reasons 1 to 3 make the row **invalid**. Reason 4 leaves the row valid but stale. Rows saved before snapshots existed (snapshot is empty) are never judged under reason 4 until their next save. *(#4, #5, #25.)*

**VA-6.2 Visible until reconciled (binding).** Stale rows appear in `staleAllocations` of every grid view, and flagged evidence appears in `anomalies`, until they are reconciled. The UI shows a warning badge. *(#4.)*

**VA-6.3 Invalid rows do not persist (binding).** An invalid row is removed transactionally by the next save or reconcile (VA-5, VA-7.4), after its evidence is stored (VA-7.1). It never stays as an active allocation. *(#5, #25.)*

**VA-6.4 REQUIREMENT_CHANGED is not auto-corrected.** The module never changes a quantity on the employee's behalf. The row stays until the employee reviews and saves; saving refreshes the snapshot and clears this condition. Coverage (VA-8.2) still has to hold. *(interpretation.)*

**VA-6.5 Consequence to know.** If a distributor-product link is deactivated after an allocation was saved, the row is removed and cannot be re-created until the link is reactivated in master data (VA-5.7). Master data must not be changed while a paper is being worked on, as with tray rules.

**VA-6.6 Staleness is detected live (binding).** Requirement shifts in Orders are caught only by the staleness detection of VA-6.1 (on view, save, reconcile and submission). No push or background job reacts to order changes (Section 15, item 4).

---

## 7. Anomaly Lifecycle and Reconcile

**VA-7.1 Evidence is kept separately from the row (binding).** When an invalid row is removed, one `vehicle_allocation_anomaly` record is stored per cell (paper + vehicle + distributor + category + product) with the removed quantity, reason, `flagged_at` and status `FLAGGED`. The record exists even though the allocation row is deleted. Re-flagging the same cell updates the same record (VA-7.6). *(#5, #25.)* This is warning evidence, not an audit trail (VA-12.1).

**VA-7.2 Lifecycle: Stale → Flagged → Reconciled.**
- Stale: detected live (VA-6.1).
- Flagged: row removed, evidence stored with status FLAGGED.
- Reconciled: a **later** write (save or reconcile) leaves that distributor + category + product either no longer required, or fully allocated (coverage within 0.005). Status becomes `RECONCILED` with `reconciled_at`. *(#5, interpretation.)*

**VA-7.3 An anomaly is never reconciled in the same transaction that flagged it (binding),** so the employee always gets at least one view of the warning. This includes a cell that already had a FLAGGED anomaly and is found invalid again: it is flagged again and stays FLAGGED in that transaction, even if its product is no longer required or is covered. For a product that is simply no longer required this means one extra save or reconcile call after the flag. *(Q3.)*

**VA-7.4 `POST /vehicle-allocations/:paperId/vehicle-allocations/reconcile` (binding).** Body `{ session, expectedUpdatedAt }`. Removes invalid rows (storing evidence), closes resolved flags, and changes **no quantities**. It follows the same status, session and token rules as save (VA-2, VA-9) and advances and returns the token only if something changed (otherwise `changed: false`). With no allocation paper yet there is nothing to reconcile. The HTTP status is 200. *(#24, #5, Q1.)*

**VA-7.5 Submission rejects unresolved anomalies (VA-8.3).** Any FLAGGED anomaly, any invalid row and any stale row blocks submission.

**VA-7.6 RECONCILED anomalies are kept until the same cell is flagged again (binding, amended).** A `RECONCILED` anomaly is never purged by the module; it stays as historical warning evidence and does not block submission. There is one record per cell (VA-7.1). If the same cell becomes invalid again, that record is reused: it becomes `FLAGGED` again with the new removed quantity, reason and `flagged_at`, and its `reconciled_at` is cleared. The earlier reconciled episode of that cell is therefore not kept as a separate record. This is accepted: the evidence is warning data, not an audit trail (VA-12.1). A record is also removed by cascade when its parent allocation paper is deleted (VA-11.2). Only `FLAGGED` anomalies appear in `anomalies[]` and block submission. *(Q2.)*

**VA-7.7 Locked sessions cannot reconcile (binding).** Once a session locks under VA-2.1 (for example NIGHT after NIGHT_SUBMITTED), reconcile is rejected exactly like save (VA-2.3). Existing `RECONCILED` evidence of a locked session stays frozen. The UI therefore does not offer Reconcile for a locked session (VA-14.6); a stale or invalid warning on a locked session stays visible as information. *(Q7.)*

---

## 8. Submission Gates (called by the paper's night / morning submit)

**VA-8.1 Two independent layers, both always evaluated, reported together (binding).** A failure returns 400 with `message`, `coverage[]`, `integrity[]` and `details[]` (both lists). Passing one layer never excuses the other. *(#6.)*

**VA-8.2 Layer 1: quantity coverage.** Every product with positive required demand must have allocated total equal to required within **0.005** (under- and over-allocation both fail). Zero-demand products are excluded. A session with no positive demand passes with an empty allocation. **Invalid stored rows (VA-6.1 reasons 1 to 3) do not count towards the allocated total**, in the gate exactly as in the grid view and `completion`, so the view and the gate always report the same coverage. The same rows are reported by Layer 2. *(#6, #9, #13, #30, Q17.)*

**VA-8.3 Layer 2: data integrity.** Rejected if the session has any of: invalid stored rows, stale stored rows, FLAGGED anomalies, or a vehicle with one category from several distributors. Each unresolved FLAGGED anomaly is listed in `integrity[]` with the words `It is still unresolved`, so the user can see that a Reconcile (or a save) is the next step. Paper readiness does not add a separate `requiredActions` hint for it. *(#6, #25, Q12.)*

**VA-8.4 Which session.** Night submit checks NIGHT. Morning submit checks MORNING. Neither touches the other session's data. *(#17.)*

**VA-8.5 Messages are readable (binding).** Messages use distributor, category and product **names**, with required and allocated quantities. Raw ids appear only for an entity that no longer exists. *(#19.)*

---

## 9. Concurrency Token

**VA-9.1** The token is `vehicle_allocation_paper.updated_at`, one per order paper and session. It is returned on the grid view and on every save and reconcile response.

**VA-9.2 Mandatory (binding).** `expectedUpdatedAt` is required on **every** write (save, reconcile).
- **Omitted → always 400.** It is never treated as null.
- **Explicit `null`** is accepted only while **no allocation paper exists** for that paper and session. If one exists, `null` is a 409. The first save is atomic: it inserts the header (never an upsert), so two concurrent first saves cannot both succeed; the loser gets 409 (or is retried and then gets 409).
- **A value** must be ISO-8601. Any parseable ISO-8601 string is accepted (a full timestamp is what the API returns); a well-formed value that differs from the current token is 409, an unparseable one is 400 `Invalid expectedUpdatedAt`. *(Q6.)*
- A stale or missing-match token is rejected. There is no unchecked write path. *(#1, #24.)*

**VA-9.3 Stale response.** 409 `Vehicle allocation data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.`

**VA-9.4 Atomic compare-and-advance.** An existing token is advanced with a conditional update (`updated_at` must still equal the expected value). The token is advanced inside the same transaction as the data, so a failed write rolls the token back. *(#24.)*

**VA-9.5 Every changing write advances the token once,** including cleanup (VA-7.4) and anomaly reconciliation. No write path bypasses it.

**VA-9.6 Token scope (binding).** The token guards edits of the allocation itself only. It does not change when order requirements change. A requirement shift in Orders is caught by staleness detection (VA-6.1 reason 4 and VA-6.6), not by the token.

**VA-9.7 Lost response (binding, as implemented).** If a save or reconcile succeeded but its response never reached the client, a retry with the old token returns 409. There is no idempotency key. The user reloads and re-checks. An identical payload sent with the NEW token is a safe no-op (VA-5.15). Same as Orders OD-12.9 and Client Trays CT-9.6. *(Q6.)*

---

## 10. HTTP Status Conventions

| Situation | Status |
|---|---|
| Successful save or reconcile, including one that changed nothing | 200 |
| Format/validation errors, wrong paper status, session not editable, unknown or inactive vehicle, unknown distributor or product, missing link, not required, duplicate, distributor split, deletion needs confirmation, submission not ready | 400 |
| Order paper not found | 404 |
| Stale token, first-save race, serialization retry exhausted, transaction timeout (VA-5.2) | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

*(Missing paper is now 404, #21. Success is 200, Q1.)*

---

## 11. Data Model

**VA-11.1** `vehicle_allocation` gains `required_qty_at_save Decimal(10,2)?` (the snapshot, VA-5.14).

**VA-11.2** New table `vehicle_allocation_anomaly` and enums `VehicleAllocationAnomalyReason` (`VEHICLE_INACTIVE`, `NOT_REQUIRED`, `LINK_INACTIVE`) and `VehicleAllocationAnomalyStatus` (`FLAGGED`, `RECONCILED`). Unique on paper + vehicle + distributor + category + product. Deleted with its allocation paper.

**VA-11.3 Shared workflow rule.** `WorkflowStateService.isActiveExecutionSession` returns true for both sessions in DRAFT (VA-2.1). This is the only change outside the module folder besides the schema.

---

## 12. Audit

**VA-12.1 Audit trail unchanged (binding).** No audit trail is added. Anomaly records are warning evidence for the UI and are not a history of who changed what. The concurrency token is not an audit history. *(#26.)*

---

## 13. Out of Scope (explicit) and Downstream Policy

- Vehicle capacity validation (VA-4.5).
- Changing Orders, Purchase or the shared summary builders. Purchase keeps reading allocations as before.
- Changing the group summary structure (Section 15, item 1).

**VA-13.1 Purchase synchronization policy (binding, existing behavior ratified).** Downstream Purchase entries tied to modified or removed vehicle allocations automatically inherit orphaned/stale status based on allocation deltas, maintaining data synchronization. This status is derived by the Purchase module at read time from the allocation data; this module does not write to Purchase.

**VA-13.2 Cost of requirement loading (binding, operational).** Every view, save, reconcile and submission gate loads all order items of the paper, and a save updates changed rows one query at a time, inside the 10 s transaction. Nothing changes now. Before go-live the view, a save with a large payload and the submit gate are measured on the largest real paper; if they approach the transaction limit, the remedy (batching the updates, narrowing the order-item read to the session) is decided then as a new decision. *(Q13.)*

---

## 14. Frontend Contract Summary

1. Load the grid. Keep `vehicleAllocationPaperUpdatedAt`. Send `null` only if it is `null`.
2. Show a warning badge if `staleAllocations` or `anomalies` is non-empty; show completion from `completion`/`submission`.
3. Save the whole session in one request. Send `0` for cells the user cleared. Never leave a stored row out unless the user chose to remove it; if the server answers `droppedAllocations`, ask the user, then resend with `confirmDeletions: true` and the same token.
4. Replace the local token with `vehicleAllocationPaperUpdatedAt` from the response.
5. **Reload rules after a failed write (binding, UI, VA-14.5):** (a) 409 stale token, first-save race or exhausted serialization retries: the allocation changed, so the frontend discards the unsaved edits and reloads; (b) 409 `took too long and nothing was saved`: nothing changed, so the edits are kept and no reload happens; (c) 400: the edits are kept and the message and its `details` are shown as a list. The allocation query is not refetched on window focus or on reconnect, so the token cannot change under unsaved edits. It refetches on mount and after a successful write. *(Q5, Q6.)*
6. **Reconcile (binding, UI, VA-14.6):** offer "Reconcile" only when the session is editable, an invalid row or a FLAGGED anomaly is shown, and there are no unsaved edits. For a locked session the warning stays visible and no action is offered (VA-7.7). *(Q7.)*

### 14.1 Frontend Technical Guidelines

These are client-side recommendations. They are not business rules; the hard enforcement is the backend 429 rate limit (VA-1.3).

- Because a save is a whole-session snapshot, send one save per user action batch, not one per cell, so normal editing stays within the 10 saves per minute limit.

---

## 15. Resolved Architectural Implementations

The following policies record how decisions that did not specify a mechanism are implemented. Each has been confirmed by the business owner and is binding.

1. **Group summaries (#23, Q9).** Group summaries remain grouped by brand only and are left unchanged, including zero-demand columns and the packaging level for milk.
2. **Stale definition (VA-6.1).** Staleness consists of the four conditions in VA-6.1. Vehicle capacity changes are deliberately excluded.
3. **Reconciliation timing (VA-7.2, VA-7.3).** An anomaly is reconciled automatically on a subsequent save or reconcile once its product is covered or no longer required, never in the transaction that flagged it. No manual dismiss action exists.
4. **Cleanup trigger.** Invalid rows are removed on the next user-initiated save or reconcile of the session. Orders and master-data changes do not trigger cleanup.
5. **Zero on an inactive vehicle (VA-5.8).** A zero entry is accepted so planners can clear allocations stranded on deactivated vehicles.
6. **Link deactivated after allocation (VA-6.5).** The allocation is removed, anomaly evidence is stored, and re-creation is blocked until master data is corrected.
7. **REQUIREMENT_CHANGED (VA-6.4).** Cleared by the planner re-saving; the system never corrects quantities automatically.
8. **Both sessions editable in DRAFT (VA-2.1).** Implemented in the shared workflow service without dependence on the former sequential gate.
9. **Inactive distributors (VA-5.17).** Not a blocking condition, consistent with OD-8.8; the active product link is the sufficient boundary.
10. **Deactivated products with demand (VA-3.8).** Remain required and submittable.
11. **Token scope (VA-9.6).** The concurrency token guards allocation edits only; requirement shifts are caught by staleness detection.
12. **Reconciled anomalies (VA-7.6).** Kept as warning evidence until the same cell is flagged again, which reuses the one record.
13. **Locked sessions (VA-7.7).** Reconcile is locked with save; reconciled evidence stays frozen.
14. **Zero and blank entries (VA-5.10).** Exempt from the distributor split check.
15. **Purchase synchronization (VA-13.1).** Purchase entries inherit orphaned/stale status from allocation deltas.

### Resolved questions (behavioral specification Q1 to Q17)

| Question | Decision | Where it is now |
|---|---|---|
| Q1 Success status | 200 for save and reconcile, as Orders and Client Trays | VA-10, VA-5.16, VA-7.4 |
| Q2 Re-flag of a reconciled cell | One record per cell is reused; earlier reconciled episode is not kept separately (no schema change) | VA-7.1, VA-7.6 |
| Q3 Flag and reconcile in one transaction | A cell flagged in the transaction is never reconciled in it | VA-7.3 |
| Q4 Empty snapshot over stored rows | Not a confirmation; needs `confirmDeletions` | VA-5.4, VA-5.13 |
| Q5 Timeout 409 and frontend reload | 409 kept; edits kept on timeout, reload on every other "changed" 409; no refetch on focus or reconnect | VA-5.2, VA-14.5 |
| Q6 Token format, lost response | Any parseable ISO-8601; retry with the old token is 409 | VA-9.2, VA-9.7 |
| Q7 Locked session and Reconcile | Reconcile hidden when not editable; warning stays visible | VA-7.7, VA-14.6 |
| Q8 10,000 cap per cell | Kept, not blocking | VA-4.1 |
| Q9 `groupSummaries` | Unchanged | VA-3.4, Section 15 item 1 |
| Q10 Zero-entry entity checks | Unknown distributor and product ids rejected for every entry | VA-5.8 |
| Q11 Omitted `allocatedQty` | 400, not read as 0 | VA-4.1 |
| Q12 Clearing anomalies before submit | A second write stays required; gate message names each unresolved anomaly; no readiness hint | VA-8.3, VA-7.3 |
| Q13 Scale | Kept; measure before go-live | VA-13.2 |
| Q14 Unwritten rules | Recorded as binding | VA-4.7 |
| Q15 Who may edit | Any employee, any paper | VA-1.4 |
| Q16 Dead code | Left in place for a separate cleanup: `getOrCreateVehicleAllocationPaper` (an upsert that would break VA-9.2 if wired), `deleteVehicleAllocations`, `createVehicleAllocations`, `getProductLink` | none |
| Q17 View vs gate coverage | Invalid rows excluded from coverage in both | VA-3.5, VA-8.2 |

---

## 16. Change Log (this version)

| ID | Type | Summary |
|---|---|---|
| VA-9.2, 9.4, 9.5 | Changed | Token mandatory on every write; null only before the first save; first save atomic (#1, #24) |
| VA-5.8 | Changed | Vehicle references validated; unknown/inactive rejected as 400, never 500 (#2, #16) |
| VA-4.5 | Decided | Capacity not validated (#3) |
| VA-6.1 to 6.4 | New | Stale detection and warning data (#4, #25) |
| VA-6.3, 7.1 to 7.4 | New | Cleanup with preserved evidence, Stale → Flagged → Reconciled, reconcile endpoint (#5, #24, #25) |
| VA-8.1 to 8.3 | Changed | Dual-layer submission validation (#6) |
| VA-5.4 | Changed | Explicit zero deletes without confirmation; omissions need confirmation bound to the token (#7, #8) |
| VA-5.1 | Kept | Full snapshot saves (#8) |
| VA-4.1 | Changed | 2-decimal maximum, rejected not rounded; tolerance 0.005 kept (#9) |
| VA-5.10 | Kept | One distributor per vehicle per category (#10) |
| VA-5.7 | Kept | Links validated only for quantity > 0 (#11) |
| VA-5.16 | Changed | Save returns the new token (#12) |
| VA-5.13, 8.2 | Decided | Empty snapshots allowed; pass only with zero demand (#13) |
| VA-3.3 | Changed | Zero-demand products hidden and excluded from coverage (#14, #30) |
| VA-2.4 | Kept | REOPENED never edits allocations (#15) |
| VA-2.1, 2.2 | Changed | Both sessions editable in DRAFT; NIGHT locks on night submit, MORNING preserved (#17) |
| VA-5.12, 3.4 | Changed | Incomplete saves allowed; completion indicators and submission gate (#18) |
| VA-8.5 | Changed | Messages use names, quantities and category, not ids (#19) |
| VA-2.3 | Changed | Workflow-specific session error replaces the session-mismatch message (#20) |
| VA-3.1, 10 | Changed | Missing paper is 404 (#21) |
| VA-3.6 | Changed | Deterministic vehicle order (#22) |
| VA-12.1 | Kept | Audit trail unchanged (#26) |
| VA-1.2 | Decided | Admins cannot bypass rules (#27) |
| VA-5.2 | Kept | Retry policy, max 3 attempts (#28) |
| VA-1.3 | Kept | 10 saves per minute (#29); frontend batching note moved to Section 14.1 |
| VA-5.17 | Decided | Inactive distributors do not block allocation or submission; link is the boundary (OD-8.8) |
| VA-3.8 | Decided | Deactivated products with demand stay required and submittable |
| VA-9.6, 6.6 | Decided | Token guards allocation edits only; requirement shifts caught by staleness detection |
| VA-7.6, 7.7 | Decided | Reconciled anomalies kept; locked sessions cannot reconcile |
| VA-5.10 | Clarified | Zero/blank entries exempt from distributor split check |
| VA-13.1 | Decided | Purchase entries inherit orphaned/stale status from allocation deltas |
| Section 15 | Changed | "Open Items" renamed "Resolved Architectural Implementations", rewritten as formal policy |
| Section 14.1 | New | Frontend Technical Guidelines |
| VA-10, 5.16, 7.4 | Changed (code) | Save and reconcile return 200 instead of 201 (Q1) |
| VA-7.3 | Changed (code) | A cell flagged again in the same transaction is no longer reconciled in it (Q3, spec D-2) |
| VA-7.1, 7.6 | Amended (doc) | Re-flag reuses the cell's single record; earlier reconciled episode not kept separately (Q2, spec D-3) |
| VA-5.4, 5.13 | Clarified | Empty snapshot over stored rows needs `confirmDeletions` (Q4, spec D-6) |
| VA-5.2, 10, 14.5 | Documented / Changed (UI) | Timeout 409 kept; frontend keeps edits on timeout and reloads on other "changed" 409; no refetch on focus or reconnect (Q5) |
| VA-9.2, 9.7 | Documented | Any parseable ISO-8601 token; lost-response retry is 409 (Q6, spec D-13) |
| VA-7.7, 14.6 | Documented | Reconcile not offered on a locked session; the frontend already did this (Q7, spec D-7) |
| VA-4.1, 3.4, 13.2 | Documented | 10,000 cap per cell kept; `groupSummaries` unchanged; scale measured before go-live; omitted `allocatedQty` stays 400 (Q8, Q9, Q11, Q13) |
| VA-5.8, 5.3 | Changed (code) | Unknown distributor and product ids rejected for every entry, zero included (Q10, spec D-10) |
| VA-8.2, 3.5 | Changed (code) | Submission gate ignores invalid rows in coverage, as the view does (Q17, spec D-4) |
| VA-8.3 | Documented | Gate lists each unresolved anomaly; no separate readiness hint (Q12, spec D-14) |
| VA-4.7, 1.4 | New | Unwritten rules recorded; no per-group scoping (Q14, Q15) |