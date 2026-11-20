# Vehicle Allocation Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Vehicle Allocation (VA) module. No automated tests are included.

## Evidence and Labels

`VEHICLE_ALLOCATION_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its VA-n items are treated as confirmed requirements. The VA code (controller, service, repository, builder, validation, reconciliation, util, constants, DTOs), the shared builders and `OrderItemsRepository`, the Paper, Workflow, Orders, Client Trays and Purchase decision files, `PaperValidationService`, and the two sibling discovery documents (Orders, Client Trays) were used as supporting evidence only.

**Frontend (reviewed in the revision):** `VehicleAllocationPage.tsx`, `VehicleAllocationStatus.tsx`, `useVehicleAllocation.ts`, `useSaveVehicleAllocation.ts`, `useReconcileVehicleAllocation.ts` and `vehicle-allocation.api.ts` were read, so Section C10 is checked against the code. `VehicleAllocationToolbar`, `VehicleAllocationGrid`, `VehicleAllocationSection`, `VehicleAllocationGroupSummary`, the shared `extractErrorMessage` and `getApiErrorStatus` helpers were not reviewed in detail. The first version of this document wrongly said the frontend files were not provided; they were.

**Not available** (each would shrink the Unknowns list): any existing VA tests and issue/bug history, UI mockups, Swagger output, `QueryClient` defaults, the migrations for `vehicle_allocation_anomaly` and `required_qty_at_save`, the Prisma version, and the database collation (affects vehicle ordering).

**Labels:** **[C]** confirmed requirement (VA/PA/PD/OD id). **[O]** observed in code only. **[I]** inferred assumption. **[U]** unknown, needs a decision.

**Impl column (section C):** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. Q-n points to a question in section E (all resolved, see section F). Seam means it can be exercised only with DB seeding or fault injection. FE means the row was checked against the frontend code. Nothing was compiled or run: every Impl cell is a reading of the code. **Impl cells show the state after the revision of section F.**

Scenario ids use the prefix V- (Orders uses S-, Client Trays uses T-).

---

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /vehicle-allocations/:paperId/vehicle-allocations?session=` | EMPLOYEE (ADMIN passes) | global 300/min | Allocation grids per distributor + category + brand, token, completion, stale list, anomalies, submission block, group summaries |
| `POST /vehicle-allocations/:paperId/vehicle-allocations` | EMPLOYEE | 10/min | Full-snapshot save of one session |
| `POST /vehicle-allocations/:paperId/vehicle-allocations/reconcile` | EMPLOYEE | 10/min | Remove invalid rows (keeping evidence) and close resolved anomalies, no quantity change |

**Indirect consumers (no VA endpoint):** Paper night submit calls the NIGHT gate, Paper morning submit calls the MORNING gate (VA-8, PA-6.2, PA-7.2). Paper readiness (PA-19) calls the same collectors. Re-finalize of a REOPENED paper does NOT call the gate (PA-8.3). Purchase reads allocation rows and derives its own stale/orphan state from them (VA-13.1).

### A2. What each paper status allows [C: VA-2.1, 2.2, 2.4]

| Paper status | View | Save / reconcile NIGHT | Save / reconcile MORNING |
| --- | --- | --- | --- |
| DRAFT | Yes | Yes | Yes |
| NIGHT_SUBMITTED | Yes | No (400) | Yes |
| MORNING_SUBMITTED | Yes | No | No |
| FINALIZED | Yes | No | No |
| REOPENED | Yes | No | No |

### A3. Lifecycles

**Allocation row**
1. **Created** by a save with `allocatedQty` > 0 for a currently required distributor + category + product, an active link and an active vehicle. Stores `required_qty_at_save` (the snapshot) [C: VA-5.6, 5.14].
2. **Updated** by a save that changes the quantity or the snapshot (diff, not delete-all) [C: VA-5.14].
3. **Deleted** by an explicit 0, by a confirmed omission, or automatically when invalid [C: VA-5.4, 6.3].
4. **Stale (valid):** snapshot differs from the current required quantity. Stays until the planner re-saves [C: VA-6.4].
5. **Invalid:** vehicle inactive, no longer required, or link inactive. Hidden from the grid, listed in `staleAllocations`, removed by the next save or reconcile [C: VA-3.5, 6.3].

**Anomaly (evidence)**
Stale (live) → Flagged (row removed, evidence stored) → Reconciled (a LATER write finds the product covered or no longer required). Never reconciled in the transaction that flagged it [C: VA-7.2, 7.3]. Reconciled evidence is kept, and reused if the same cell is flagged again [C: VA-7.6, amended].

### A4. Side effects and downstream consumers

- **Concurrency token:** `vehicle_allocation_paper.updated_at`, one per paper + session, created on the first changing save. Advanced once by every changing write, including cleanup and anomaly reconciliation [C: VA-9].
- **Evidence table:** `vehicle_allocation_anomaly`, unique per paper + vehicle + distributor + category + product [C: VA-11.2].
- **Requirement source:** current orders (ordered quantity only, never delivered), read live on every view, save, reconcile and gate [C: glossary, VA-6.6].
- **Consumers:** Paper gates (VA-8), Purchase (VA-13.1), Paper readiness (PA-19). No push or background reaction to Orders changes [C: VA-6.6, 15.4].
- **No audit trail** [C: VA-12.1].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | A save is the complete intended allocation of one session; omission is never silently a deletion | VA-5.1, 5.4 |
| INV-2 | Only quantities > 0 are stored | VA-5.6 |
| INV-3 | Quantity 0 to 10,000, at most 2 decimals, rejected not rounded; blank and null mean 0 | VA-4.1 |
| INV-4 | Required quantity = sum of ORDERED quantity per distributor + category + product of the session | glossary |
| INV-5 | Coverage = allocated equals required within 0.005, both under- and over-allocation fail | VA-8.2 |
| INV-6 | A row may only exist for a currently required product, an active vehicle and an active link; otherwise it is invalid | VA-6.1 |
| INV-7 | One distributor per vehicle per category per session (rows > 0 only) | VA-5.10 |
| INV-8 | Token mandatory on every write; omitted is 400; explicit null only before the first save | VA-9.2 |
| INV-9 | No write path bypasses the token; the token is advanced in the same transaction as the data | VA-9.4, 9.5 |
| INV-10 | A no-op write never advances the token | VA-5.15 |
| INV-11 | Sessions are independent: submitting NIGHT never discards or locks MORNING | VA-2.2 |
| INV-12 | REOPENED never edits allocations; administrators have no bypass | VA-2.4, 1.2 |
| INV-13 | The module never changes a quantity on the employee's behalf | VA-6.4 |
| INV-14 | An anomaly is visible to the employee at least once before it can be reconciled | VA-7.3 |
| INV-15 | Capacity is never validated | VA-4.5 |
| INV-16 | Each write is all-or-nothing, including the token and the anomaly evidence | VA-5.2, 9.4 |

**Security constraints**

- SEC-1: JWT required on all endpoints; an inactive user gets 401 [I, from `JwtStrategy`].
- SEC-2: the role comes from the DB-backed user, never the body [I].
- SEC-3: no endpoint is admin-only and no rule has an admin branch [C: VA-1.1, 1.2].
- SEC-4: unknown body fields are rejected (400) [C: VA-4.3].
- SEC-5: per-user throttle on save and reconcile [C: VA-1.3].
- SEC-6: no per-paper or per-group authorization (any employee, any paper) [I, consistent with PA-1.3, OD-1.3, CT-1.4; **U: Q15**].
- SEC-7: unexpected errors are masked with a request id [I, from PA-11.5].
- SEC-8: employee-facing messages use names, not raw ids, except for entities that no longer exist [C: VA-8.5, 3.x].

---

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Access, administrators, throttling | VA-1.1 to 1.3 |
| Workflow matrix, session isolation, error feedback | VA-2.1 to 2.4 |
| Grid view, zero-demand hiding, deactivated products, vehicle order | VA-3.1 to 3.8 |
| Input validation, capacity | VA-4.1 to 4.6 |
| Save, deletions, confirmation, links, vehicles, required, distributor split, duplicates, no-op, response, inactive distributors | VA-5.1 to 5.17 |
| Stale rules and visibility, invalid rows, live detection | VA-6.1 to 6.6 |
| Anomaly lifecycle and reconcile | VA-7.1 to 7.7 |
| Submission gates | VA-8.1 to 8.5 |
| Concurrency token | VA-9.1 to 9.6 |
| HTTP statuses | VA-10 |
| Data model, workflow rule | VA-11.1 to 11.3 |
| Audit | VA-12.1 |
| Out of scope, Purchase synchronization | VA-13, 13.1 |
| Frontend contract | VA-14, 14.1 |
| Architectural policies | VA-15 items 1 to 15 |
| Cross-module | PA-6.2, 7.2, 8.3, 11.1, 17.4, 19.3, PD-37, PD-65, OD-2.2, OD-7.6 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | `POST` save and reconcile have no `@HttpCode`, so success was 201 (changed to 200 in the revision, VA-10). Orders (DISC-1) and Client Trays (Q5) were changed to 200 | controller |
| O-2 | A transaction timeout (10 s) returns 409 "took too long and nothing was saved". The VA file lists only serialization conflicts | `transaction-runner.ts` |
| O-3 | `allocatedQty` omitted is 400, while `null` and `""` are accepted as 0 (the transform runs only on those two values) | DTO |
| O-4 | DTO validation runs before the transaction, so an invalid body for a missing paper is 400, not 404 | NestJS pipe order |
| O-5 | Duplicates are a business check inside the transaction after the token check (VA-5.3), so a stale token wins over a duplicate (unlike Client Trays CT-4.7) | service |
| O-6 | Vehicle existence is validated for every entry, but distributor and product existence are not validated for entries with quantity 0 | validation service |
| O-7 | When an invalid row has several reasons, precedence is VEHICLE_INACTIVE, then NOT_REQUIRED, then LINK_INACTIVE | `detect` |
| O-8 | `GET` excludes invalid rows from coverage; the submission gate includes them (rows whose vehicle or product is not in the grid fall out anyway; a LINK_INACTIVE row on an active vehicle is counted by the gate) | service vs validation service |
| O-9 | Resolvable anomalies are chosen BEFORE the new flags are written, but reconciled AFTER them, in the same transaction | service ordering |
| O-10 | `upsertAnomaly` overwrites an existing record for the same cell, including a RECONCILED one (status back to FLAGGED, `reconciled_at` cleared, `removed_qty` replaced) | repository |
| O-11 | `groupSummaries` uses `GroupSummaryBuilder`: not filtered for positive demand, and always built with the packaging-type level, including for milk | builder |
| O-12 | `replaceVehicleAllocations` updates changed rows one query at a time; the whole request reads all order items of the paper | repository, `OrderItemsRepository` |
| O-13 | Omission response is `{ message, droppedAllocations, vehicleAllocationPaperUpdatedAt }` with no `details[]` | service |
| O-14 | Dead code: `getOrCreateVehicleAllocationPaper` (an upsert, would violate VA-9.2 if wired), `deleteVehicleAllocations`, `createVehicleAllocations`, `getProductLink`, several `VehicleCapacity*` types | repository, types |
| O-15 | `paperId` must be digits, 1 to 2147483647, else 400 `Invalid id`; the VA file does not state it | `ParseIdPipe` |
| O-16 | The GET and the save each load the whole paper's order items inside a transaction (RepeatableRead and Serializable) | service |

### B3. Inferred (assumptions)

- **I-1:** An inactive user token gets 401 (outside the VA file).
- **I-2:** A double click on Save yields one success and one 409 (the second request carries the old token).
- **I-3:** A save concurrent with a Paper status change has exactly one winner (PA-11.1, the status is read inside the same serializable transaction).
- **I-4:** Save and reconcile throttles are separate counters (per handler).
- **I-5:** A group's `delivery_session` change after paper generation does not move existing sheets (PA-4.2 copies it at generation).
- **I-6:** Marking a sheet no-operation (PA-17) does not change VA demand; the flag is read by nothing else (PA-17.4).
- **I-7:** Unexpected DB errors give a masked 500 with nothing saved, anomaly evidence included.

### B4. Unknowns

See section E.

---

## C. Behavioral Scenario Matrix

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-01 | No, garbage or expired JWT; call view, save, reconcile | 401 | none | VA-1.1 | OK |
| V-02 | Valid EMPLOYEE or ADMIN JWT | Allowed; an admin gets exactly the same rules | none | VA-1.1, 1.2 | OK |
| V-03 | Deactivated user with an unexpired token | 401 | none | I-1 | OK |
| V-04 | 11th save in 60 s by one user; 11th reconcile | 429; another user unaffected; each endpoint has its own counter | none | VA-1.3, I-4 | OK |
| V-05 | `paperId` is `abc`, `0`, `-1`, `2147483648`, `007` | 400 `Invalid id`; `007` read as 7 | none | O-15 | OK (spec silent, Q14) |
| V-06 | Paper does not exist: view, save, reconcile | 404 `Order paper not found` | none | VA-3.1, 10 | OK |
| V-07 | `session` missing or not NIGHT/MORNING, on view (query) and on save/reconcile (body) | 400 | none | VA-3.1, 4.2 | OK |
| V-08 | Unknown extra field at top level or inside an allocation | 400 | none | VA-4.3 | OK |
| V-09 | Successful save or reconcile, including a no-op | HTTP 200 | per scenario | VA-10, 5.16, 7.4 | OK (was D-1) |
| V-10 | Invalid body sent for a paper that does not exist | 400 (shape first) | none | VA-4.6, O-4 | OK |

### C2. Grid view

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-20 | Session has no order lines with quantity > 0 | `allocations` empty; `completion.isComplete` true with no lines; `submission.ready` true; token null | none | VA-3.3, 8.2 | OK |
| V-21 | Positive demand for distributor D, MILK, brand B | One grid per distributor + category + brand; one row per active vehicle; cells 0; `totals.product_<id>` = required, 2 decimals | none | VA-3.2 | OK |
| V-22 | A product whose total required quantity is 0 | Not a column, not a total, not a coverage line | none | VA-3.3 | OK |
| V-23 | Demand exists only in the other session | Not shown for the requested session | none | glossary, VA-8.4 | OK |
| V-24 | Delivered quantity differs from ordered | Requirement still uses ORDERED quantity only | none | glossary | OK |
| V-25 | Same product ordered by clients whose frozen suppliers differ | Separate grids and required quantities per distributor | none | glossary | OK |
| V-26 | Product deactivated in master data but still has demand | Column present, counted in coverage, allocatable, submittable | none | VA-3.8 | OK |
| V-27 | NON_MILK and MILK grids | NON_MILK adds the Packaging Type level; MILK does not. Field names `product_<id>` | none | VA-3.2 | OK |
| V-28 | Vehicles | Active only, by `vehicle_name` ascending, nameless last, then `id`; inactive vehicles are not rows | none | VA-3.6 | OK (collation, U) |
| V-29 | Saved allocation for a valid row | Cell shows the stored quantity, otherwise 0 | none | VA-3.2 | OK |
| V-30 | Stored row: vehicle inactive, or product no longer required, or link inactive | Not drawn; listed in `staleAllocations` with kind INVALID and a message naming vehicle / distributor / product | none (no cleanup) | VA-3.5, 3.7, 6.2 | OK |
| V-31 | Stored row whose snapshot differs from the current required quantity by more than 0.005 | Still drawn; listed in `staleAllocations` with kind REQUIREMENT_CHANGED (from and to quantities) | none | VA-6.1(4) | OK |
| V-32 | Legacy row with no snapshot | Never judged stale | none | VA-6.1 | OK |
| V-33 | FLAGGED anomalies exist | Listed in `anomalies` with removed quantity and `flaggedAt`; RECONCILED ones are not listed | none | VA-3.4, 7.6 | OK |
| V-34 | `submission` block | `ready` = coverage complete AND no stale/invalid/flagged AND no distributor split | none | VA-3.4 | OK |
| V-35 | Any GET | No write, no token change, no cleanup | none | VA-3.7 | OK |
| V-36 | `workflow.editable` for each status and session | Per the A2 matrix | none | VA-2.1, 3.4 | OK |
| V-37 | `groupSummaries` | Grouped by brand, filtered to the session | none | VA-3.4, 15.1 | OK (Q9: unchanged by decision) |
| V-38 | View in MORNING_SUBMITTED, FINALIZED, REOPENED | Works, `editable` false | none | VA-2.1 | OK |

### C3. Save: request validation and token

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-40 | No allocation paper yet; valid payload; `expectedUpdatedAt: null` | Success `changed: true` with the new token | Header created (plain insert); rows written; token set once | VA-9.2, 5.16 | OK |
| V-41 | `expectedUpdatedAt` omitted, on save and on reconcile | 400 | none | VA-9.2, 4.4 | OK |
| V-42 | A token already exists, send `null` | 409 stale | none | VA-9.2 | OK |
| V-43 | Token `abc` | 400 `Invalid expectedUpdatedAt` | none | VA-9.2 | OK |
| V-44 | Token well-formed but different (including date-only) | 409 | none | VA-9.2 | OK (VA-9.2) |
| V-45 | Quantity 5, 5.5, 5.25, 5.00, 10000 | Accepted | stored as given | VA-4.1 | OK |
| V-46 | Quantity 5.255, 10000.01, -1, `"5"` | 400, never rounded | none | VA-4.1 | OK |
| V-47 | Quantity `""` or `null` | Treated as 0 | as a zero entry | VA-4.1 | OK |
| V-48 | Quantity omitted from an entry | 400 (not read as 0) | none | VA-4.1 | OK (was Q11) |
| V-49 | `vehicleId`/`distributorId`/`productId` 0, 1.5, 2147483648; `category` FOO | 400 | none | VA-4.2 | OK |
| V-50 | 5001 allocations | 400 | none | VA-4.3 | OK |
| V-51 | Empty `allocations` array with nothing stored | Valid; no-op; `changed: false`; token null | none | VA-5.13 | OK |
| V-52 | Same vehicle + distributor + category + product twice, even both with 0 | 400 `Duplicate allocation entries...` with `details[]` using names | none | VA-5.11 | OK |
| V-53 | Duplicate entry together with a stale token | 409 (the token is checked before duplicates) | none | VA-5.3, O-5 | OK |
| V-54 | Paper status does not allow the session (for example NIGHT in NIGHT_SUBMITTED), even with a stale token | 400 naming the status, the open session(s) or none, and "refresh" | none | VA-2.3, 5.3 | OK |
| V-55 | DRAFT: save NIGHT and save MORNING | Both accepted | rows per session | VA-2.1 | OK |
| V-56 | REOPENED or MORNING_SUBMITTED or FINALIZED: save or reconcile either session | 400 "No allocation session is open for editing" | none | VA-2.4, 2.3 | OK |

### C4. Save: business rules

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-60 | Entry for a vehicle id that does not exist, any quantity | 400 `Vehicle <id> does not exist` | none | VA-5.8 | OK |
| V-61 | Inactive vehicle, quantity > 0 | 400 `Vehicle "<name>" is inactive and cannot receive allocations` | none | VA-5.8 | OK |
| V-62 | Inactive vehicle, quantity 0 | Accepted (lets the planner clear it) | stored row (if any) deleted | VA-5.8, 15.5 | OK |
| V-63 | Quantity > 0 where the distributor has no active link | 400, every offending row listed in `details` | none | VA-5.7 | OK |
| V-64 | Quantity 0 where there is no link | Accepted | none | VA-5.7 | OK |
| V-65 | Quantity > 0 for a distributor + category + product that is not currently required (wrong category, other distributor, zero demand, other session) | 400 naming distributor, category, product | none | VA-5.9 | OK |
| V-66 | Row has both no link and not required | The link message is returned (link check comes first) | none | VA-5.3 | OK |
| V-67 | One vehicle, same category, two distributors, both quantities > 0 | 400 naming vehicle, category and distributors | none | VA-5.10 | OK |
| V-68 | One vehicle takes MILK from A and NON_MILK from B | Accepted | stored | VA-5.10 | OK |
| V-69 | A second distributor appears only with quantity 0 | Not counted in the split check | none | VA-5.10, 15.14 | OK |
| V-70 | Same vehicle takes MILK from A in NIGHT and from B in MORNING | Accepted (rule is per session) | rows per session | VA-5.10 | OK |
| V-71 | Under-allocation, or over-allocation, saved | Accepted; `completion` shows incomplete | stored | VA-5.12 | OK |
| V-72 | Allocation far above any vehicle capacity | Accepted | stored | VA-4.5 | OK |
| V-73 | Distributor is inactive but has an active link and demand | Allowed | stored | VA-5.17 | OK |
| V-74 | Zero or blank entries | Never stored. Zero for a stored row deletes it with no confirmation. Zero for no row is a no-op | row removed | VA-5.4, 5.6 | OK |
| V-75 | New or changed row | Stores the quantity and `required_qty_at_save` = required quantity now | row written | VA-5.14 | OK |
| V-76 | Identical payload, stored rows, snapshots and anomaly states all unchanged | `changed: false`, current token, nothing written | none | VA-5.15 | OK |
| V-77 | Same, but token stale | 409 | none | VA-5.15 | OK |
| V-78 | Identical payload re-sent after a success, with the NEW token | No-op (`changed: false`) | none | VA-5.15 | OK |
| V-79 | Quantity unchanged but the requirement changed since the save | Counts as a change: snapshot refreshed, stale condition cleared, token advanced | row updated | VA-6.4, 5.15 | OK |
| V-80 | Response shape | `{ success, changed, vehicleAllocationPaperUpdatedAt, flaggedAnomalies, reconciledAnomalies }` | none | VA-5.16 | OK |
| V-81 | Entry with a non-existent distributor or product id and quantity 0 | 400 `Distributor <id> does not exist` / `Product <id> does not exist`, all listed in `details` | none | VA-5.8 | OK (was Q10; changed in code) |
| V-82 | One bad entry among many | Whole request fails, token and evidence rolled back | rollback | VA-5.2 | OK |

### C5. Deletions and confirmation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-90 | A stored valid row is absent from the payload, no `confirmDeletions` | 400 `droppedAllocations` (vehicle, distributor, category, product names, quantity) and the current token | nothing written | VA-5.4 | OK |
| V-91 | Resend with `confirmDeletions: true` and the same token | Rows deleted; token advanced | rows deleted | VA-5.4, 5.5 | OK |
| V-92 | Confirmed resend after another user changed the allocation | 409; the confirmation is never applied to changed data | none | VA-5.5 | OK |
| V-93 | A stored INVALID row is absent from the payload | Not an omission: flagged and removed automatically | anomaly FLAGGED, row deleted | VA-5.4, 6.3 | OK |
| V-94 | Empty `allocations` while rows are stored | Every stored row is an omission: 400 `droppedAllocations` unless `confirmDeletions: true` | none | VA-5.4, 5.13 | OK (was Q4) |
| V-95 | Empty snapshot, confirmed, session has zero demand | All rows removed; the session passes the gate | rows deleted | VA-5.13, 8.2 | OK |
| V-96 | `confirmDeletions: true` when nothing is omitted | No effect | none | I | OK |

### C6. Stale rows, anomalies and reconcile

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-100 | Save while an invalid row exists | Row removed; one anomaly per cell stored with removed quantity, reason, status FLAGGED; `flaggedAnomalies` counts it | token advanced | VA-6.3, 7.1 | OK |
| V-101 | Invalid row with more than one reason | Reason is VEHICLE_INACTIVE, else NOT_REQUIRED, else LINK_INACTIVE | evidence reason | O-7 | OK (VA-4.7) |
| V-102 | An anomaly is flagged in this transaction | It is not reconciled in the same transaction | status FLAGGED | VA-7.3 | OK (was D-2; changed in code) |
| V-103 | A later write leaves that product fully allocated, or no longer required | Anomaly becomes RECONCILED with `reconciled_at`; no longer in `anomalies`; `reconciledAnomalies` counts it | token advanced | VA-7.2 | OK |
| V-104 | A later write that does not resolve it | Stays FLAGGED | none | VA-7.2 | OK |
| V-105 | Reconcile in an editable session with invalid rows | Rows removed with evidence; resolvable flags closed; no quantity changed | token advanced, returned | VA-7.4 | OK |
| V-106 | Reconcile with nothing to do | `changed: false`, current token | none | VA-7.4 | OK |
| V-107 | Reconcile with no allocation paper yet | `changed: false`, token null (null must match; stale is 409) | none | VA-7.4 | OK |
| V-108 | Reconcile in a locked session | 400 workflow message; reconciled evidence stays frozen | none | VA-7.7 | OK |
| V-109 | Reconcile on a REQUIREMENT_CHANGED row | Row untouched; condition remains until the planner saves | none | VA-6.4, 7.4 | OK |
| V-110 | A cell that already has a RECONCILED anomaly is invalid again | The one record of the cell is reused: back to FLAGGED, `reconciled_at` cleared, removed quantity replaced. The earlier reconciled episode is not kept separately | evidence reused | VA-7.1, 7.6 | OK (was D-3; decided in doc) |
| V-111 | A cell has a FLAGGED anomaly, the planner re-adds a row there, and the row becomes invalid with NOT_REQUIRED (or covered) | Flag is written again and stays FLAGGED in this transaction; a later save or reconcile closes it | status FLAGGED | VA-7.3 | OK (was D-2; changed in code) |
| V-112 | RECONCILED anomalies | Kept; removed only by cascade with the allocation paper | none | VA-7.6, 11.2 | OK |
| V-113 | Distributor link deactivated after a save | Row removed with evidence; cannot be re-created until the link is reactivated | anomaly | VA-6.5 | OK |
| V-114 | Save fails after flagging | Evidence rolled back with the rest | rollback | I-7, VA-9.4 | OK |
| V-115 | Orders cancel or lower a line so that demand drops | Detected live on the next view, save, reconcile or gate. No background cleanup | none | VA-6.6, 15.4 | OK |

### C7. Submission gates (called by Paper)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-120 | NIGHT submit, every positive-demand product allocated exactly (within 0.005), nothing stale | Gate passes | none | VA-8.2 | OK |
| V-121 | Under- or over-allocation | 400 `coverage[]` lines naming distributor, category, product, required and allocated | none | VA-8.1, 8.5 | OK |
| V-122 | Session with no positive demand, empty allocation | Passes | none | VA-8.2 | OK |
| V-123 | Invalid rows, stale rows, FLAGGED anomalies, or a vehicle with a category from several distributors | 400 `integrity[]` | none | VA-8.3, 7.5 | OK |
| V-124 | Coverage and integrity both failing | One 400 carrying both lists and `details` | none | VA-8.1 | OK |
| V-125 | Night submit | Checks NIGHT only; morning submit checks MORNING only | none | VA-8.4 | OK |
| V-126 | A MORNING plan saved in DRAFT, then night submit | MORNING plan preserved untouched and still editable | none | VA-2.2 | OK |
| V-127 | A FLAGGED anomaly whose product is already covered, then submit | Still blocked until another write (save or reconcile) | none | VA-7.3, 7.5 | OK (VA-8.3: gate lists the anomaly; no hint, Q12) |
| V-128 | Readiness check (`GET /papers/:id/readiness`) | Lists the same VA problems, writes nothing | none | PA-19.3 | OK (Paper) |
| V-129 | Re-finalize of a REOPENED paper | VA gate is not called | none | PA-8.3 | OK (Paper) |
| V-130 | Gate never cleans up | Invalid rows are reported, not removed | none | VA-7.5 | OK |

### C8. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-140 | Two users save the same session with the same token | One succeeds; the other gets 409 (stale, or "conflicted with another update" after 3 attempts) | one write | VA-5.2, 9.3 | OK |
| V-141 | Two concurrent first saves | One succeeds; the other 409 (insert conflict or serialization retry then token mismatch) | one header | VA-9.2 | OK |
| V-142 | Serialization conflicts exhaust 3 attempts | 409 `Your request conflicted with another update...`; the retried attempt re-reads and re-checks the token | rollback | VA-5.2 | OK |
| V-143 | Save races Paper night submit | One wins; a losing NIGHT save gets the VA-2.3 400 | serializable | I-3, PA-11.1 | OK |
| V-144 | Orders (DRAFT) change between GET and save | Save validates against the live requirement. Token is unchanged by Orders. Rows may now be invalid or stale | none | VA-9.6, 6.6 | OK |
| V-145 | Transaction exceeds 10 s | 409 "took too long and nothing was saved" | rollback | O-2 | OK (VA-5.2) |
| V-146 | Unexpected exception after the token was touched | Masked 500 with `requestId`; token, rows and evidence rolled back | rollback | I-7 | Seam |
| V-147 | Save succeeded but the response never arrived; retry with the old token | 409 although the data was saved; the user reloads. Resending the same payload with the NEW token is a no-op | none | VA-9.7 | OK (was Q6) |
| V-148 | Double click on Save | First succeeds, second 409 | one write | I-2 | OK |
| V-149 | A FK failure (unknown vehicle) | 400, never 500 | none | VA-5.8 | OK |
| V-150 | Save with 5,000 entries on a large paper | Must finish inside the 10 s transaction | - | O-12, O-16 | U (VA-13.2: measure before go-live) |

### C9. Cross-module

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-160 | Purchase entry exists and the allocation quantity is lowered | Purchase entry becomes stale in Purchase, derived at read time; VA writes nothing to Purchase | none in Purchase | VA-13.1, PD-37 | OK (Purchase-owned) |
| V-161 | Save that only refreshes a snapshot (same quantity) | Allocation id and quantity unchanged, so Purchase is not made stale | row updated in place | VA-5.14, PD-37 | OK (I) |
| V-162 | Order line created in the morning (ordered 0) | Adds no demand | none | OD-7.6 | OK |
| V-163 | Order line cancelled (ordered 0) | Demand shrinks; matching rows may go NOT_REQUIRED | none | OD-6.10 | OK |
| V-164 | Sheet marked no-operation but still carries orders | Its demand still counts | none | PA-17.4 | OK (I-6) |
| V-165 | Group's delivery session changes after paper generation | Sheet keeps its copied session; requirement follows the sheet | none | PA-4.2, I-5 | OK (I) |

### C9b. Added by the revision (backend)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| V-180 | A stored row is invalid with LINK_INACTIVE on an active vehicle; the product was otherwise fully allocated; submit gate | Coverage lists the product as short (the invalid row does not count), integrity lists the row; the view shows the same coverage | none | VA-8.2, 3.5 | OK (changed in code) |
| V-181 | Reconcile on a session that has a FLAGGED anomaly and an invalid row on the same cell | Cell is flagged again and stays FLAGGED; `reconciledAnomalies` does not count it | status FLAGGED | VA-7.3 | OK (changed in code) |
| V-182 | `allocations: []`, nothing stored, `expectedUpdatedAt: null` | 200 `changed: false`, token null, nothing written | none | VA-5.13, 5.15 | OK |
| V-183 | Entry with unknown `productId` and quantity 5 | 400 `Product <id> does not exist` (before the link and required checks) | none | VA-5.8, 5.3 | OK (changed in code) |

### C10. Frontend contract (VA-14), checked against the frontend code

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| V-170 | Load grid | The draft captures `vehicleAllocationPaperUpdatedAt` (null stays null) when editing starts; a save without edits uses the loaded token | VA-14.1 | FE: OK |
| V-171 | `staleAllocations` or `anomalies` non-empty | Warning box with every message; "Quantities not fully allocated" list and Ready / Not ready badge come from `completion` and `submission` | VA-14.2 | FE: OK |
| V-172 | Save | Whole session in one request; cleared cells sent as explicit 0, cells that were 0 and still are left out; invalid rows are not drawn, so they are never counted as omissions; one request per Save click | VA-14.3, 14.1 | FE: OK |
| V-173 | Server answers `droppedAllocations` | Confirmation box lists the rows; Confirm resends with `confirmDeletions: true` and the same token | VA-14.3 | FE: OK |
| V-174 | Save succeeds | Draft cleared and the query refetched, so the new token arrives by refetch, not directly from the response. A second Save before the refetch finishes would still carry the old token (409) | VA-14.4 | FE: OK (note N-2) |
| V-175 | 409 "changed" (stale, race, exhausted retries) | Draft and pending confirmation discarded, query refetched, toast "Allocation changed". 400 shows `extractErrorMessage` text (multi-line with details) and keeps the edits | VA-14.5 | FE: OK (changed in code; `extractErrorMessage` not reviewed) |
| V-176 | Badge shown and the session is not editable, or edits are unsaved | "Reconcile" is not offered (`editable && hasInvalidOrFlagged && draft === null`). The warning text still says "Submission is blocked until they are resolved" | VA-14.6, 7.7 | FE: OK (was D-7; note N-1) |
| V-177 | 409 "took too long and nothing was saved" on save or reconcile | Edits kept, no reload, message shown; the hooks do not invalidate the query | VA-14.5, 9.7 | FE: OK (was Q5; changed in code) |
| V-178 | Window regains focus or the network reconnects while edits are unsaved | The allocation query is not refetched, so the token cannot change under the draft | VA-14.5 | FE: OK (`refetchOnWindowFocus` and `refetchOnReconnect` are false; `QueryClient` defaults not reviewed) |
| V-179 | Edits are unsaved and the session has invalid rows | Reconcile is hidden until the draft is saved or discarded | VA-14.6 | FE: OK |

---

## D. Discrepancies and Gaps (as found; resolution in section F2)

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Spec silent, code differs from siblings | Save and reconcile return 201 (no `@HttpCode`). Orders and Client Trays return 200. The VA file states no success status. | Low |
| D-2 | Code differs from spec | VA-7.3 says an anomaly is never reconciled in the transaction that flagged it. The resolvable list is computed before flagging, but a cell that already had a FLAGGED anomaly and is invalid again is re-flagged and then reconciled in the same transaction when its product is no longer required or is covered (O-9). Reachable only with a prior FLAGGED anomaly on the same cell. From code reading, not run. | Medium (narrow) |
| D-3 | Spec conflict | VA-7.1 says re-flagging a cell updates the record. VA-7.6 says RECONCILED anomalies are kept permanently as history. With one record per cell, a re-flag erases the earlier reconciled history (O-10). | Medium |
| D-4 | Code inconsistency | The grid excludes invalid rows from coverage, the submission gate includes them. Pass or fail is the same (the same rows also fail integrity), but the coverage list and `submission.coverageComplete` can disagree between view and gate for a LINK_INACTIVE row. | Low |
| D-5 | Spec gap | A transaction timeout returns 409 in code; the VA file lists only serialization conflicts (same as Orders D-6, Client Trays D-15). | Low |
| D-6 | Spec ambiguity | VA-5.13 says empty snapshots are allowed, but VA-5.4 makes every stored row an omission needing confirmation. An empty save over stored rows is therefore 400 unless confirmed. | Low |
| D-7 | Spec tension (UI contract) | VA-14.6 says offer Reconcile when the badge is shown; VA-7.7 says a locked session rejects reconcile. A locked session can keep a stale or invalid badge with no way to clear it. | Low to Medium |
| D-8 | Spec gap | A cell is capped at 10,000 (VA-4.1) while a product's total required quantity across many clients has no cap. A product required above 10,000 forces several vehicles even when one could carry it. Business may never reach it. | Low |
| D-9 | Spec gap | `groupSummaries` is not subject to VA-3.3 (zero-demand columns appear) and always has a Packaging Type level, including milk, unlike the allocation grid and Orders OD-3.7. VA-15.1 only says it is unchanged. | Low |
| D-10 | Doc differs from sibling rule | Purchase PD-1 requires entity checks even for zero quantities. VA checks only vehicles for zero entries (O-6). Harmless (zeros are never stored) but not specified. | Info |
| D-11 | Spec gap | `allocatedQty` omitted is 400, while `null` and `""` mean 0 (O-3). | Info |
| D-12 | Non-functional risk | Every view, save, reconcile and gate loads all order items of the paper, and save updates changed rows one query at a time, inside a 10 s transaction. No measurement exists (compare Client Trays D-10). | **Medium (unverified)** |
| D-13 | Spec gap | Lost-response retry gives 409 (token stale) although the data was saved. VA does not record the decision made for Orders (OD-12.9) and Client Trays (CT-9.6). Unlike Orders, an identical payload sent with the NEW token is a safe no-op (V-78). | Low to Medium |
| D-14 | Spec gap / UX | After a save flags an anomaly, a second write is always needed to reconcile it, even when the product is already covered. Paper night or morning submit stays blocked with no hint pointing to the reconcile step (compare PA-19.5 `requiredActions`). | Low to Medium |
| D-15 | Spec silent | Precedence between multiple invalid reasons (O-7), `paperId` format (O-15), and validation order for an invalid body on a missing paper (O-4) are not written. | Info |
| D-16 | Dead code | `getOrCreateVehicleAllocationPaper` is an upsert and would violate VA-9.2 if wired. Other unused repository methods and types (O-14). Not removed here. | Info |
| D-17 | Observability | VA-12.1 keeps no audit trail, so who removed or changed an allocation is not recoverable except through FLAGGED anomalies. Accepted. | Info |

**Scenarios the current implementation appears unable to satisfy or that cannot be asserted**

- **V-111:** violates VA-7.3 in the narrow case of D-2.
- **V-110:** conflicts with VA-7.6 (D-3).
- **V-147:** a lost response cannot be retried safely with the old token (D-13).
- **V-176:** the contract offers an action the server must reject (D-7).
- **V-146, V-150:** need fault injection or a large real paper.
- **V-170 to V-177:** checked against the frontend code in the revision (section F).

---

## E. Open Questions (all resolved, see section F1)

Each question lists the owner. "(current)" marks what the code does today. No answer is recommended.

**Q1 (Eng, D-1). Success status of save and reconcile.**

- A. 201 (current).
- B. 200, as Orders and Client Trays.
- C. Any 2xx; not binding.

**Q2 (Product, D-3). Re-flagging a cell that has RECONCILED evidence (VA-7.1 vs VA-7.6).**

- A. Reuse and overwrite the one record per cell (current).
- B. Keep the RECONCILED record and add a new record per occurrence.
- C. Keep RECONCILED history in a separate log; the cell record tracks only the latest state.
- D. Other.

**Q3 (Product + Eng, D-2). Anomaly flagged and resolvable in the same transaction.**

- A. Never reconcile a cell flagged in the same transaction (restores VA-7.3 exactly).
- B. Accept as is.
- C. Other.

**Q4 (Product, D-6). Empty snapshot while rows are stored.**

- A. Treated as omission of every row; needs `confirmDeletions` (current).
- B. An explicit empty snapshot is itself a confirmation.
- C. Other.

**Q5 (Eng, D-5, V-177). Timeout response and frontend reload on 409.**

- A. 409 retryable for the timeout; UI follows Orders OD-12.10 (reload on stale or race, keep edits on timeout).
- B. 503.
- C. Other.

**Q6 (Eng + Product, D-13, V-44, V-147). Token format and lost-response retry.**

- A. Any parseable ISO-8601 token, mismatch 409; a retry with the old token gets 409 (as Orders and Client Trays).
- B. Full timestamp only.
- C. Support an idempotency key.
- D. Other.

**Q7 (Product, D-7). Locked sessions and the Reconcile action.**

- A. Show the badge but hide Reconcile when `workflow.editable` is false.
- B. Hide stale and invalid warnings for a locked session.
- C. Let reconcile run on a locked session for invalid rows only.
- D. Other.

**Q8 (Product, D-8). Per-cell maximum of 10,000.**

- A. Keep (current).
- B. Raise or remove the per-cell cap.
- C. Cap per product total instead.

**Q9 (Product, D-9). `groupSummaries` scope.**

- A. Leave unchanged, including zero-demand columns and the packaging level for milk (current).
- B. Apply VA-3.3 and the milk rule of OD-3.7.
- C. Other.

**Q10 (Eng, D-10). Entity checks for zero entries.**

- A. Only vehicles are checked (current).
- B. Also reject unknown distributor or product ids, as Purchase PD-1.

**Q11 (Eng, D-11). `allocatedQty` omitted.**

- A. 400 (current).
- B. Treated as 0.

**Q12 (Product, D-14, V-127). Clearing anomalies before submit.**

- A. A second write is required (current).
- B. Let the first cleanup also reconcile when the product is already covered.
- C. Add a `requiredActions` hint to Paper readiness, as for the zero-allocation sign-off.
- D. Other.

**Q13 (Eng, D-12). Scale of requirement loading and row-by-row updates.**

- A. Keep; measure on the largest real paper first.
- B. Batch the updates.
- C. Narrow the order-item read to the session.
- D. Other.

**Q14 (Eng, D-15). Which unwritten rules become binding?**

- A. Record `paperId` format (digits only), shape-before-404 validation order, and the invalid-reason precedence as binding.
- B. Leave undocumented.

**Q15 (Product, SEC-6). Who may edit which paper's allocation?**

- A. Any employee, any paper (current, as Orders OD-1.3 and Client Trays CT-1.4).
- B. Only employees assigned to the groups involved.
- C. Other.

**Q16 (Eng, D-16). Dead code.**

- A. Leave until every caller is ruled out.
- B. Remove in a separate cleanup, starting with the upsert helper.

**Q17 (Eng, D-4). Coverage when invalid rows exist.**

- A. Leave the view and the gate as they are (current).
- B. Make both treat invalid rows the same way.


---

## F. Revision After Decisions

The business owner answered Q1 to Q17 ("keep as Orders and Client Trays" or "do what is logically best"). Where the answer was delegated, the choice below was made by the reviewer, with the simplest option that keeps the module consistent with Orders and Client Trays. `VEHICLE_ALLOCATION_BUSINESS_DECISION.md` was amended (Sections 1 to 16). **Nothing was compiled or run; every code change is implemented, not yet run.**

### F1. Decision log

| Q | Decision | Change |
| --- | --- | --- |
| Q1 | 200 for save and reconcile | Code: `@HttpCode(200)` on both POSTs. Doc: VA-10, 5.16, 7.4 |
| Q2 | Keep one record per cell; a re-flag reuses it and the earlier reconciled episode is not kept. Chosen over a history table because VA-12.1 says the evidence is not an audit trail and a new table or key change is not needed | Doc only: VA-7.1, 7.6 amended (VA-7.6 no longer says "permanent") |
| Q3 | A cell flagged in a transaction is never reconciled in it | Code: service filters FLAGGED anomalies of cells found invalid in the same transaction, in save and in reconcile. Doc: VA-7.3 |
| Q4 | An empty snapshot over stored rows still needs `confirmDeletions`. Chosen because a client bug that sends `[]` would otherwise wipe a plan silently | Doc only: VA-5.4, 5.13 |
| Q5 | Timeout stays 409. Frontend keeps edits on the timeout 409 and reloads on every other "changed" 409; no refetch on focus or reconnect | Code (frontend): `isTimeoutConflict` helper, page and both hooks, query options. Doc: VA-5.2, 10, 14.5 |
| Q6 | Any parseable ISO-8601 token; lost-response retry is 409 | Doc: VA-9.2, 9.7 |
| Q7 | Reconcile hidden when not editable; warning stays visible | No code change (the page already did this). Doc: VA-7.7, 14.6 |
| Q8 | Keep the 10,000 per-cell cap (not blocking) | Doc: VA-4.1 |
| Q9 | `groupSummaries` unchanged | Doc: VA-3.4, Section 15 |
| Q10 | Reject unknown distributor and product ids for every entry, as vehicles and Purchase PD-1 | Code: `validateEntityReferences` and two messages; called after the vehicle check. Doc: VA-5.8, 5.3 |
| Q11 | Omitted `allocatedQty` stays 400. Chosen because the omission is almost certainly a client bug and a silent 0 could delete a row | Doc: VA-4.1 |
| Q12 | Keep the second write requirement; the gate already lists each unresolved anomaly. A `requiredActions` hint would need a new Paper decision (PA-19.5) and Paper code, which was not asked for | Doc: VA-8.3. Paper files untouched |
| Q13 | Keep; measure on the largest real paper before go-live | Doc: new VA-13.2 |
| Q14 | `paperId` format, shape-before-404 and reason precedence recorded as binding | Doc: new VA-4.7 |
| Q15 | Any employee, any paper | Doc: new VA-1.4 |
| Q16 | Dead code left for a separate cleanup | None (listed in Section 15 of the decision file) |
| Q17 | View and gate treat invalid rows the same: they do not count towards coverage | Code: the gate detects invalid rows first and excludes them from the coverage grid. Doc: VA-8.2, 3.5 |

### F2. Discrepancy status

| ID | Status |
| --- | --- |
| D-1 | Resolved (code, 200) |
| D-2 | Resolved (code) |
| D-3 | Resolved (doc amended; no code change) |
| D-4 | Resolved (code) |
| D-5 | Resolved (documented, VA-5.2) |
| D-6 | Resolved (documented, VA-5.4, 5.13) |
| D-7 | Resolved (the frontend already hid Reconcile on a locked session; documented) |
| D-8 | Accepted (VA-4.1) |
| D-9 | Accepted (VA-3.4) |
| D-10 | Resolved (code) |
| D-11 | Accepted (VA-4.1) |
| D-12 | Open, operational (VA-13.2: measure before go-live) |
| D-13 | Resolved (documented, VA-9.7) |
| D-14 | Accepted without a hint (VA-8.3). Paper readiness hint remains a possible future decision |
| D-15 | Resolved (VA-4.7) |
| D-16 | Deferred to a separate cleanup (Q16) |
| D-17 | Accepted (VA-12.1) |

### F3. Files changed

Backend: `vehicle-allocation.controller.ts` (HttpCode), `vehicle-allocation.service.ts` (Q3 filter, call to the entity check), `vehicle-allocation-validation.service.ts` (entity check; gate coverage), `vehicle-allocation.constants.ts` (two messages).
Frontend: `vehicle-allocation.api.ts` (`isTimeoutConflict`), `VehicleAllocationPage.tsx` (`handleWriteError`), `useSaveVehicleAllocation.ts`, `useReconcileVehicleAllocation.ts`, `useVehicleAllocation.ts` (no refetch on focus or reconnect).
Docs: `VEHICLE_ALLOCATION_BUSINESS_DECISION.md`, this file. Not changed: Paper, Purchase, Orders and Client Trays decision files and code (no decision there depends on the answers; PA-19.5 stays as is because Q12 did not add a `requiredActions` value).

### F4. Changed and new scenarios

Rows whose Impl cell changed: V-09, V-34, V-37, V-44, V-48, V-81, V-94, V-101, V-102, V-110, V-111, V-127, V-145, V-147, V-150, V-170 to V-177. New: V-178 and V-179 (frontend), V-180 to V-183 (section C9b). Existing tests or specs that assert a 201 on save or reconcile, or a 200/no-error for a zero entry with an unknown distributor or product, must be updated; none were provided.

### F5. Notes and what is still open

- **N-1:** The warning text in `VehicleAllocationStatus` says "Submission is blocked until they are resolved" even on a locked session, where no action is offered. Left as is (wording only, not asked for).
- **N-2:** The frontend takes the new token from the refetch after a save, not from the response (VA-14.4 says "from the response"). Harmless unless the user saves again before the refetch finishes. Left as is.
- **N-3:** D-12 (scale) needs a measurement on real data, as for Client Trays CT-10.9.
- **N-4:** `VehicleAllocationToolbar`, `Grid`, `Section`, `GroupSummary` and the shared error helpers were not reviewed in detail.
- **N-5:** `isTimeoutConflict` matches the text "took too long" in the response message (the backend wording of the timeout 409). If that wording changes, the check must change with it.