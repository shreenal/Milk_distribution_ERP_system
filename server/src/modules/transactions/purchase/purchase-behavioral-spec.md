# Purchase Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Purchase module. No automated tests are included.

## Evidence and Labels

`PURCHASE_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its PD-n items are treated as confirmed requirements. The Purchase code (controller, service, admin service, validation service, repository, builder, util, constants, DTOs, billing and commercial services), `PurchaseVarianceCalculator`, the dairy-tray conversion in `TrayCalculationService`, `schema.prisma`, the Paper, Vehicle Allocation, Dairy Trays, Client Trays and Orders decision files, `PaperValidationService`, and the three sibling specs (Orders, Client Trays, Vehicle Allocation) were used as supporting evidence only. Scenario IDs use the prefix **PU-** (Orders uses S-, Client Trays T-, Vehicle Allocation V-).

**Frontend (correction):** the first version of this document wrongly said no frontend file was provided. `PurchasePage.tsx`, `PurchaseGrid.tsx`, `PurchaseNotices.tsx`, `PurchaseToolbar.tsx`, `PurchaseSection.tsx`, `PurchaseAdminPanel.tsx`, `usePurchase.ts`, `useSavePurchase.ts`, `useSignOffZeroAllocation.ts`, `useRecalculatePurchaseRates.ts`, `purchase.api.ts`, `purchase.types.ts` and the variance display helpers were provided and are covered in section F6.

**Not available** (each would shrink the Unknowns list): existing Purchase tests and issue/bug history, Swagger output, UI mockups, `diagnostics.sql` and the migrations referred to by PD-15, the `QueryClient` defaults, the shared `extractErrorMessage` and `getApiErrorStatus` helpers, and real master data (rates, gatepass policies).

**Revision note:** the owner answered Q1 to Q17 after this was first written (most were delegated to Claude, marked so in F1). Sections A to E show the state **before** the decisions; **section F supersedes them** where they differ and lists every changed scenario. Code changes are written but not compiled or run.

**Labels:** **[C]** confirmed requirement (PD/PA/VA/DT/OD id). **[O]** observed in code only. **[I]** inferred assumption. **[U]** unknown, needs a decision.

**Impl column (section C):** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. Q-n points to a question in section E. Seam means it can only be exercised with DB seeding or fault injection. **Nothing was compiled or run: every Impl cell is a reading of the code.** Because no frontend was provided in the first version, section C had no frontend rows; they are added in F6.

---

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /purchases/:paperId` | EMPLOYEE (ADMIN passes) | global 300/min | Purchase grids, prefilled defaults, saved entries, orphans, totals, zero-allocation block, token |
| `POST /purchases/:paperId` | EMPLOYEE; `purgeAll` and `reevaluateTrays` need ADMIN | 10/min | Partial upsert of entries, explicit deletes, bulk purge, tray re-evaluation |
| `POST /purchases/:paperId/recalculate-rates` | ADMIN | 5/min | Refresh link, rate, gatepass date, order-unit snapshot, amount of every saved entry (REOPENED only) |
| `POST /purchases/:paperId/sign-off-zero-allocation` | EMPLOYEE | 10/min | Confirm "no purchases" for a paper with no allocation |

**Indirect triggers and consumers (no Purchase endpoint):**
- Every Purchase write that changes at least one entry recalculates the paper's dairy tray ledger in the same transaction (DEP-009, DT-10.1). A dairy return conflict rolls the Purchase write back (409).
- Paper morning submit and re-finalize of a REOPENED paper call `validatePurchasesComplete` (PA-7.2 item 4, PD-54). Night submit calls no Purchase gate.
- Paper readiness uses `isZeroAllocationSignOffPending` (PD-70, PA-19.5).
- Vehicle Allocation rows are the source of every cell. Purchase writes nothing to Vehicle Allocation, and Vehicle Allocation writes nothing to Purchase (VA-13.1).
- Paper generation and the zero-allocation sign-off both create the dairy tray header (PD-64).

### A2. What each paper status allows [C: PD-52, PD-23, PD-66]

| Paper status | View (GET) | Save / delete / purge / re-evaluate trays | Sign-off | Recalculate rates |
| --- | --- | --- | --- | --- |
| DRAFT | Yes | No (400) | No (400) | No (400) |
| NIGHT_SUBMITTED | Yes | Yes | Yes | No (400) |
| MORNING_SUBMITTED | Yes | No (400) | No (400) | No (400) |
| FINALIZED | Yes | No (400) | No (400) | No (400) |
| REOPENED | Yes | Yes | Yes | Yes (ADMIN) |

GET in every status is [I]: PD is silent, the code never checks status on read.

### A3. Lifecycles

**Entry (`purchase_entry`)**
1. **Untracked:** a cell with no saved entry. The prefilled allocation value is only a suggestion [C: PD-39].
2. **Saved (FROZEN):** created by an explicit quantity for an allocated cell (positive, or a confirmed zero). Rate, link, gatepass date and order-unit snapshot are frozen from this save [C: PD-20, PD-21, PD-22].
3. **Updated:** a later save changes only quantity, amount, allocation snapshot and, if empty, the tray type [C: PD-20, PD-33].
4. **Stale:** the allocation snapshot (id or quantity) differs from the current allocation. Legacy rows with no snapshot are never stale [C: PD-37].
5. **Orphan:** the entry cannot be drawn in any grid cell. Never deleted by omission, resolved only by explicit deletion [C: PD-6, PD-7, PD-8].
6. **Deleted:** by `deletedEntryIds` or `purgeAll` only [C: PD-5, PD-10].
7. **Re-priced:** only by the admin rate recalculation on a REOPENED paper [C: PD-23].

**Zero-allocation sign-off:** none, then signed off (permanent, not revocable), counted only while no allocation above 0 exists [C: PD-38, PD-66].

### A4. Side effects and downstream consumers

- **Concurrency token:** `purchase_paper.updated_at`, created on the first changing save or on a first sign-off. Moved by every changing write (save, delete, purge, tray re-evaluation, rate recalculation, sign-off) [C: PD-12, PD-13, PD-58].
- **Dairy Trays:** recalculated in the same transaction when entries change; a stored dairy return above its balance refuses the whole Purchase write [C: PD-19, DT-6.5, DT-10.1]. Rate recalculation never triggers it [C: DT-10.1].
- **Logs instead of audit tables:** deletions, purge, tray re-evaluation, rate recalculation and critical shortfalls are logged after commit [C: PD-25, PD-35, PD-62, PD-19].
- **Paper gates:** completeness, stale, orphan and sign-off checks [C: PD-54, PD-68].
- **No audit table** [C: PD-62].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | A saved positive quantity never exceeds the cell's allocated quantity at save time | PD-63 |
| INV-2 | Rate, link, gatepass date and order-unit snapshot never change on an ordinary save | PD-20, PD-21 |
| INV-3 | Nothing is ever deleted because it is absent from a payload | PD-5, PD-6 |
| INV-4 | Untracked (null, blank, omitted) is never a zero; explicit 0 is a confirmed zero | PD-39 |
| INV-5 | Amount = quantity x frozen pricing quantity x frozen rate, 2 decimals half-up, tax exclusive | PD-30, PD-32 |
| INV-6 | Quantity has at most 2 decimals, rejected not rounded (unchanged legacy echo tolerated) | PD-27 |
| INV-7 | The token is mandatory on every write; omitted is 400; explicit null only before a header exists | PD-12, PD-13 |
| INV-8 | Each write is all-or-nothing, including the token and the dairy tray recalculation | PD-19 |
| INV-9 | A no-op write never moves the token | PD-57 |
| INV-10 | A saved cell may only be written against the allocation the user saw | PD-4 |
| INV-11 | An entry is in at most one of `stale[]` and `orphans[]` | PD-68 |
| INV-12 | Estimated (unsaved) and persisted (saved) totals are never combined | PD-45, PD-46 |
| INV-13 | `purgeAll` is ADMIN-only, scoped to the paper, and exclusive of every other instruction | PD-10, PD-69 |
| INV-14 | Dairy tray conversion is independent of billing (sum per vehicle, session, tray type, round once) | PD-28 |
| INV-15 | Completeness of purchase records is gated; fulfilment (shortfall) never blocks | PD-36, PD-41, PD-42 |

**Security constraints**

- SEC-1: JWT required on all endpoints; an inactive user gets 401 [I, `JwtStrategy`].
- SEC-2: the role comes from the DB-backed user, never the body [I]. `purgeAll` and `reevaluateTrays` return 403 for a non-admin [C: PD-10, PD-34].
- SEC-3: recalculate-rates is ADMIN-only [C: PD-23].
- SEC-4: unknown body fields are rejected (400) [C: PD-59, PD-60].
- SEC-5: ids are bounded 1 to 2147483647 [C: PD-2].
- SEC-6: per-user throttles [C: PD section 4].
- SEC-7: unexpected errors are masked with a request id [I, PA-11.5].
- SEC-8: no per-group or per-paper authorization. PD is silent; siblings decided "any employee, any paper" [U: Q8].
- SEC-9: log lines carry `userId` for deletions, purge, tray re-evaluation and rate recalculation [C: PD-25, PD-35].

---

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Zero quantities and entity validation | PD-1 to PD-4 |
| Deletion guardrails | PD-5 to PD-11 |
| Concurrency, identity | PD-12 to PD-16 |
| Consistency with Vehicle Allocation | PD-17 to PD-19 |
| Rate freezing, recalculation, gatepass date | PD-20 to PD-26, PD-67 |
| Quantity precision, trays | PD-27 to PD-29, PD-33 to PD-35 |
| Financial metadata, tax | PD-30 to PD-32 |
| Gates and fulfilment | PD-36 to PD-42, PD-54, PD-68, PD-70 |
| Variance and totals | PD-43 to PD-46 |
| Workflow flags, grid, API | PD-47 to PD-53 |
| Harmonizations | PD-55 to PD-62 |
| Audit rulings | PD-63 to PD-70 |
| Cross-module | PA-6, PA-7.2, PA-7.4, PA-19.5, VA-13.1, VA-5.14, DT-6.5, DT-10.1, DT-10.2 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | `POST` save, recalculate-rates and sign-off have no `@HttpCode`, so success is 201. Orders, Client Trays and Vehicle Allocation were changed to 200 | `purchase.controller.ts` |
| O-2 | The 2-decimal precision rule is a business check inside the transaction, after the token check and after the allocation checks. A stale token therefore wins over a precision error (siblings check precision before the transaction) | `purchase-validation.service.ts` |
| O-3 | `purgeAll` and `reevaluateTrays` role checks run before the transaction, so a non-admin gets 403 even for a missing paper (404), a locked status (400) or a stale token (409) | `purchase.service.ts` |
| O-4 | In `evaluateEntries` the link check for a new row runs before the "zero for a never-allocated, never-saved cell is ignored" rule, so such a zero with no active link is a 400, not an ignored entry | `purchase-validation.service.ts` |
| O-5 | Variance, `shortfallWarnings` and the critical-shortfall log line are computed for every accepted entry, including entries later skipped as MISSING_CONFIGURATION, entries unchanged in the payload and saves that turn out to be no-ops | `purchase.service.ts` |
| O-6 | Several errors are thrown on their own, not collected with other problems: unknown `deletedEntryIds`, the empty-entries guard, purge conflicts, pricing problems (collected only among themselves) | `purchase.service.ts` |
| O-7 | The allocation echo (`sourceAllocationId`, `sourceAllocatedQty`) is required only for an already-saved cell. For an unsaved cell it is optional and, if present, compared | `evaluateEntries` |
| O-8 | `zeroAllocation.signOffRequired` is `noAllocations && no sign-off` in every paper status, including DRAFT, MORNING_SUBMITTED and FINALIZED, where a sign-off is not possible | `getPurchases` |
| O-9 | Cells with no allocation and no entry carry rate 0 and amount 0 (initialised numeric fields), not null | `initializeProductFields` |
| O-10 | A transaction timeout (10 s) returns 409 "took too long and nothing was saved". Token format and lost-response behaviour are as siblings (any parseable ISO-8601; old token 409) but not recorded for Purchase | `transaction-runner.ts`, `optimistic-concurrency.service.ts` |
| O-11 | Sign-off ensures the dairy tray header even on the idempotent repeat call. A stored sign-off counts again if allocations later disappear again | `purchase-admin.service.ts`, `isZeroAllocationSignOffPending` |
| O-12 | A saved entry whose allocation was removed but whose cell is still drawn (the product is still a column and the vehicle still has a row) is stale and cannot be saved again (400 allocation modified or removed). Only explicit deletion resolves it | `evaluateEntries` |
| O-13 | Vehicle Allocation deletes a row on quantity 0 and creates a new row (new id) when re-added. A saved entry then compares unequal on id, so it is stale even when the quantity is identical | `isStaleEntry`, VA diff |
| O-14 | Admin rate recalculation includes orphan entries. One orphan with a deactivated link or missing rate fails the whole request | `recalculateRates` |
| O-15 | Paper surfaces only the gate's `details[]` strings; the structured `missing[]`, `stale[]`, `orphans[]` arrays reach the Paper 400 only through `details` text | `PaperValidationService.describeFailure` |
| O-16 | An employee can delete any saved entry through `deletedEntryIds` without confirmation or mandatory reason (`reason` is optional and only logged) | `savePurchases`, DTO |
| O-17 | `deletedEntryIds` rejects duplicate ids (`@ArrayUnique`) with the validator text | DTO |
| O-18 | A client-supplied `category` that does not match the allocation key makes the entry "not found": 400 for a positive quantity, ignored for a zero | `evaluateEntries` |
| O-19 | GET and every write load all order items of the paper (both sessions) and all allocations inside a RepeatableRead or Serializable transaction. Not measured | `getPurchases`, `savePurchases` |
| O-20 | Dead or contradictory code: `findProductLinkRateForDate` and `findPurchaseRateForDistributorProduct` (UTC-midnight `lte` semantics, contradicting PD-26), `findVehicles`, `findDistributorProcurementRules`, `findLatestVehicleAllocationPaper`, `findVehicleAllocationPapersForOrderPaper`, `getProductLink`, `PurchaseCommercialContext`, commented-out token helpers | repository, services |

### B3. Inferred (assumptions)

- **I-1:** An inactive user token gets 401 (outside the PD file).
- **I-2:** A double click on Save yields one success and one 409 (follows from PD-12).
- **I-3:** A save concurrent with a Paper status change has exactly one winner (PA-11.1; the status is read inside the same serializable transaction).
- **I-4:** Vehicle Allocation writes do not move the purchase token (VA-9.6, PD-65), so a changed allocation is detected only through the echo, the staleness rule and PD-63.
- **I-5:** Unexpected DB errors give a masked 500 with nothing saved, dairy recalculation included.
- **I-6:** Duplicate explicit entries for one key are rejected (follows the VA pattern named in PD-17; PD itself is silent).
- **I-7:** The throttle counters of save, sign-off and recalculate are separate (per handler).
- **I-8:** The UI echoes `meta.sourceAllocationId` and `meta.sourceAllocatedQty` as PD-4 describes. Not verifiable without the frontend.

### B4. Unknowns

See section E.

---

## C. Behavioral Scenario Matrix

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-01 | No, garbage or expired JWT; call GET, save, sign-off, recalculate | 401 | none | I-1 | OK |
| PU-02 | EMPLOYEE or ADMIN JWT on GET, save, sign-off. EMPLOYEE on recalculate | Allowed. Recalculate is 403 | none | PD section 5 | OK |
| PU-03 | Deactivated user with an unexpired token | 401 | none | I-1 | OK |
| PU-04 | EMPLOYEE sends `purgeAll: true`, then `reevaluateTrays: true` | 403 `Only an administrator...` for each. ADMIN is allowed | none | PD-10, PD-34 | OK (O-3: 403 wins over 404, 400 status and 409) |
| PU-05 | 11th save or 11th sign-off in 60 s by one user; 6th recalculate | 429; another user unaffected; GET uses the global limit | none | PD section 4, I-7 | OK |
| PU-06 | `paperId` is `abc`, `0`, `-1`, `2147483648`, `007` | 400 `Invalid id`; `007` read as 7 | none | PD-2 (body ids), `ParseIdPipe` | OK [I for the URL rule] |
| PU-07 | Paper does not exist: GET, save, sign-off, recalculate | 404 `Order paper not found`. An invalid body for a missing paper is 400 (shape first) | none | PD-55 | OK |
| PU-08 | Unknown field at top level or inside an entry (for example `confirmDeletions`, `totalAmount`) | 400 | none | PD-59, PD-60 | OK |
| PU-09 | Successful save, recalculate, sign-off, including a no-op | Success status. Expected 200 as in the sibling modules; PD states none | per scenario | PD section 4 silent | D-1, Q1 |
| PU-10 | `vehicleId`, `distributorId`, `productId` 0, 1.5, 2147483648; `deliverySession` or `category` FOO | 400 | none | PD-2, PD-60 | OK |
| PU-11 | `purchasedQty` 0, 5, 5.5, 10000 | Accepted by shape | per scenario | PD-27, PD-39 | OK |
| PU-12 | `purchasedQty` `"5"`, NaN, Infinity, -1, 10000.01 | 400 | none | PD-60 | OK |
| PU-13 | `purchasedQty` null, `""`, omitted | Treated as untracked: no entry, no operation | none | PD-39, PD-60 | OK |
| PU-14 | New or changed quantity 5.255 | 400 `<row>: quantity 5.255 is invalid...`; never rounded. An unchanged echo of a stored legacy value is tolerated | none | PD-27 | OK (O-2: a stale token wins, D-3) |
| PU-15 | `expectedUpdatedAt` omitted on save, sign-off, recalculate | 400 | none | PD-12 | OK |
| PU-16 | Explicit null with no purchase paper; with an existing paper | Matches; 409 | none | PD-12 | OK |
| PU-17 | Token `abc`; token well-formed but different (date-only) | 400 `Invalid expectedUpdatedAt`; 409 | none | PD-12 | OK (format rule not recorded for Purchase, Q8) |
| PU-18 | `entries` missing or not an array; more than 5000 entries | 400 | none | PD-60 | OK |
| PU-19 | `reason` or `shortfallComment` longer than 1000 chars; surrounding spaces | 400; trimmed | none | PD-41, PD-23 | OK [O for the limit] |
| PU-20 | Recalculate with `reason` blank or whitespace | 400 | none | PD-23 | OK |

### C2. Grid view

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-30 | Paper has no allocation | 200, `purchases` empty, `zeroAllocation { noAllocations: true, signedOffAt: null, signOffRequired: true }`, token null, totals 0 | none | PD-61 | OK |
| PU-31 | Allocations exist, nothing saved | One grid per distributor + category + brand with an allocation. One row per vehicle + session with an allocation for that brand. Cell quantity prefilled with the allocation. `meta`: tracked false, rateType LIVE, `sourceAllocationId` and `sourceAllocatedQty` = current allocation | none | PD-49, PD-51, PD-4, PD-22 | OK |
| PU-32 | Columns | Per product: Quantity, Rate, Amount (fields `product_<id>`, `_rate`, `_amount`). Products = positive order demand across both sessions plus any product with an active allocation. NON_MILK adds the Packaging Type level | none | PD-50 | OK |
| PU-33 | A vehicle allocated in both sessions | Two rows, one per session | none | PD-51 | OK |
| PU-34 | Cell with no allocation and no entry | Not editable in practice; rate and amount 0, not null | none | no requirement | OK (O-9, Info) |
| PU-35 | Saved entry | Cell shows saved quantity, frozen rate, amount; `meta` tracked true, rateType FROZEN, snapshot ids and quantities, current allocation ids; `_stale` boolean; `_variance` block | none | PD-22, PD-37, PD-43 | OK |
| PU-36 | Unsaved cell default | Live rate for the gatepass day; amount = prefilled quantity x pricing quantity x rate | none | PD-22, PD-26 | OK |
| PU-37 | Rate validity on gatepass day 11 Oct (IST): from 11 Oct 10:00 IST valid; from 12 Oct 00:30 IST not valid; to 10 Oct 23:59 IST not valid; to 11 Oct 00:00 IST valid; several valid: latest `effective_from` wins | As stated | none | PD-26 | OK (Seam: needs rate data) |
| PU-38 | Brand policy SAME_DAY and PREVIOUS_DAY | Rate resolved for the sale date, or the day before. Session does not change it | none | PD-67 | OK (Q14) |
| PU-39 | Unsaved cell: no active link, no valid rate, no order unit | 200; `meta.rateStatus` MISSING_CONFIGURATION, `rateIssue` NO_ACTIVE_LINK, NO_RATE, NO_ORDER_UNIT; rate and amount null | none | PD-48 | OK |
| PU-40 | Totals | Row, grid and overall `estimatedTotalAmount` (unsaved cells) and `persistedTotalAmount` (saved), never combined. Response `persistedTotalAmount` includes orphans, grid totals do not. No `totalAmount` field | none | PD-45, PD-46 | OK |
| PU-41 | Saved entry whose allocation can no longer be matched to any cell | Listed in `orphanedEntries` (entry id, names, quantity, rate, amount), not drawn | none | PD-7 | OK |
| PU-42 | Allocation quantity changed, removed, or re-created after the entry was saved | `_stale` true, `hasStaleRows` true. A legacy entry with no snapshot is never stale. Orphans are not counted as stale | none | PD-37, PD-68 | OK |
| PU-43 | Variance: purchased below, equal to, above allocated | SHORTFALL (negative signed %), MATCHED, SURPLUS (only reachable after the allocation was lowered, or legacy). `fulfillmentPercentage` = purchased / allocated x 100 | none | PD-40, PD-43, PD-63 | OK |
| PU-44 | Saved entry whose allocation is gone but the cell is still drawn | Variance with allocated 0: UNPLANNED_ALLOCATION, percentage null, CRITICAL. Confirmed zero with allocation 0: MATCHED | none | PD-44 | OK |
| PU-45 | Critical shortfall boundary | More than 20% below allocation: `shortfallWarning`, `hasCriticalShortfall`. Exactly 20%: HIGH, no warning | none | PD-41 | OK |
| PU-46 | Confirmed zero against allocation above 0 | Counts as complete but reports a CRITICAL shortfall | none | PD-42 | OK |
| PU-47 | `morningAllocationPending` | True iff MORNING order demand > 0 and no MORNING allocation above 0 | none | PD-47 | OK |
| PU-48 | `taxExclusive` and `gstApplied` | `true` and `false` | none | PD-31 | OK |
| PU-49 | `workflow.editable` per status | True only in NIGHT_SUBMITTED and REOPENED | none | PD-52, PD-53 | OK |
| PU-50 | Paper with no allocation in DRAFT, MORNING_SUBMITTED or FINALIZED | `signOffRequired` true even though a sign-off is impossible or not needed | none | PD-61, PD-66 | D-6, Q6 |
| PU-51 | Any GET | No write, no header creation, no token change | none | [I] | OK |

### C3. Save: workflow and token

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-60 | Paper DRAFT, MORNING_SUBMITTED, FINALIZED, even with a stale token | 400 `Purchases cannot be edited in current workflow state` (status is checked before the token) | none | PD-52 | OK |
| PU-61 | No header, valid allocated entry, token null | `changed: true`, new token, entry stored | Header inserted (plain insert), entry written, dairy recalculated | PD-12, PD-57 | OK |
| PU-62 | Header exists, token null; stale token | 409 stale (`Purchase data has changed...`) | none | PD-12 | OK |
| PU-63 | Identical payload, stored values and snapshot unchanged, current token | `changed: false`, current token, empty `deletedEntryIds` | none; no dairy recalculation | PD-57 | OK |
| PU-64 | Same, stale token | 409 | none | PD-57 | OK |
| PU-65 | Response shape | `{ success, changed, purchasePaperUpdatedAt, deletedEntryIds, ignoredEntries, shortfallWarnings }` | none | PD-57 | OK |
| PU-66 | Two users save with the same token concurrently | One succeeds; the other 409 (stale, or "conflicted with another update" after 3 attempts) | one write | PD-12, PD-17 | OK |
| PU-67 | Two concurrent first saves | One succeeds; the other 409 (insert conflict or serialization retry then mismatch) | one header | PD-12 | OK |
| PU-68 | One bad entry among many | Whole request fails; no header, no token change, dairy not recalculated | rollback | PD-19, PD-56 | OK |
| PU-69 | Serialization conflicts exhaust 3 attempts | 409 `Your request conflicted with another update...` | rollback | PD-17 | OK |
| PU-70 | Transaction exceeds 10 s | 409 `took too long and nothing was saved` | rollback | O-10 | OK (not recorded, Q8) |

### C4. Save: entry rules

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-80 | Allocated, unsaved cell, quantity within the allocation | Entry stored with frozen link, rate for the gatepass day, gatepass date, `units_per_order_unit`, `pricing_quantity`, `pricing_unit`, tray type resolved from current rules, allocation snapshot (id and quantity). Amount = qty x pricing quantity x rate, 2 dp half-up | entry created; dairy recalculated | PD-20, PD-29, PD-30, PD-33 | OK |
| PU-81 | Quantity above the current allocation; equal to it | 400 `<row>: purchased quantity X exceeds allocated quantity Y`; equal is accepted | none | PD-63 | OK |
| PU-82 | Positive quantity for a cell with no allocation | 400 `Allocation not found: <row>` | none | PD-63 (message not specified) | OK |
| PU-83 | Zero for an allocated, unsaved cell | Stored as a confirmed zero (`tracked` true) | entry created | PD-3, PD-39 | OK |
| PU-84 | Zero for a cell never allocated and never saved, link active | Not stored; returned in `ignoredEntries` with reason NOT_ALLOCATED_AND_NOT_SAVED; 200 | none | PD-3 | OK |
| PU-85 | Same, but the distributor has no active link | PD-1 says 400 (zero must pass entity and link checks); PD-48 says a new zero with missing configuration is ignored with MISSING_CONFIGURATION. Code gives 400 `does not have an active product link` | none | PD-1 vs PD-48 | D-2, Q2 |
| PU-86 | New zero, allocated cell, rate or order unit missing | Not stored; `ignoredEntries` reason MISSING_CONFIGURATION | none | PD-48 | OK (O-5: still produces a shortfall warning) |
| PU-87 | New positive, rate missing; order unit missing | 400 `no purchase rate found for <date>` or `order unit configuration is missing`, all listed | none | PD-48 | OK |
| PU-88 | New positive, no active link | 400 `<distributor> does not have an active product link for <product>` | none | PD-1, PD-48 | OK |
| PU-89 | Unknown vehicle, distributor or product id, positive or zero | 400 `Invalid vehicle/distributor/product <id>`, all listed together | none | PD-1, PD-2 | OK |
| PU-90 | Same key twice, both explicit | 400 `Duplicate purchase entry` | none | I-6 | OK |
| PU-91 | Same key, one null and one explicit | Accepted as one entry | per scenario | I-6 | OK |
| PU-92 | Update a saved entry's quantity after master rate, link or order-unit changes | Rate, link, gatepass date, order-unit snapshot, tray type unchanged; quantity, amount, snapshot updated | entry updated | PD-20, PD-21 | OK (Seam) |
| PU-93 | Saved entry, payload without `sourceAllocationId` or `sourceAllocatedQty` | 400 `...must be echoed for a saved entry` | none | PD-4 | OK |
| PU-94 | Saved entry, echo differs from the current allocation | 400 `Allocation modified or removed: <row>...` | none | PD-4 | OK |
| PU-95 | Saved entry, allocation removed, quantity zero or positive | 400 `Allocation modified or removed` | none | PD-4 | OK (O-12) |
| PU-96 | Unsaved cell, echo present but different from the current allocation; echo omitted | 400; accepted, and the snapshot is taken against the allocation as it is now | entry created | PD-4 | OK for the first; D-4, Q3 for the second |
| PU-97 | Stale entry, echo of the current allocation, quantity within it | Accepted; snapshot refreshed; stale cleared | entry updated | PD-37, PD-63 | OK |
| PU-98 | Allocation lowered below the saved quantity; the cell is part of a save payload | Whole request 400 `exceeds allocated quantity` even if the user did not change it. Re-saving within the allocation clears it | none | PD-63 | D-8, Q5 |
| PU-99 | An entry is both saved and deleted in one request | 400 `...cannot be saved and deleted in one request` | none | PD-11 | OK |
| PU-100 | Payload with 2 of 40 saved entries | Only those two are touched; the rest stay | partial write | PD-5, PD-6, PD-18 | OK |
| PU-101 | `entries: []` with saved entries and no delete, purge or re-evaluate | 400 (guard message) | none | PD-9 | OK |
| PU-102 | `entries: []` with nothing saved | 200 `changed: false`; no header created | none | PD-9 | OK |
| PU-103 | Payload where every entry is untracked, with saved entries present | No-op; nothing deleted | none | PD-6, PD-39 | OK (bypasses the PD-9 guard, O-6) |
| PU-104 | Several problems in one request | One 400 `{ message, details[] }` with names, not ids | none | PD-56 | OK (O-6: some errors are thrown alone, D-9) |
| PU-105 | Entry whose `category` does not match the allocation key | Positive: 400 allocation not found. Zero: ignored | none | O-18 | Observed, [U] |
| PU-106 | Saved entry with an empty tray type, saved again | Tray type resolved once from current rules and stored | entry updated | PD-33 | OK |
| PU-107 | Tray rule changed after save, ordinary save | Stored tray type unchanged | none | PD-33 | OK |

### C5. Deletion, purge, tray re-evaluation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-110 | `deletedEntryIds` of entries on this paper | Deleted; ids returned in `deletedEntryIds`; log line `PURCHASE_DELETE_ENTRIES`; dairy recalculated | rows deleted | PD-5, PD-25 | OK |
| PU-111 | An id that is not on this paper | 400 `Purchase entry id(s) ... do not belong to this paper`; nothing deleted | none | PD-5 | OK |
| PU-112 | Duplicate ids in the array | 400 (validator) | none | O-17 | Observed |
| PU-113 | Orphan deleted by id, then morning submit | Orphan no longer blocks | row deleted | PD-8 | OK |
| PU-114 | EMPLOYEE deletes a fresh, non-stale, non-orphan entry | Allowed, no confirmation or reason required | row deleted | O-16 | Observed, [U] Q10 |
| PU-115 | ADMIN `purgeAll` with `purgeScope: "PAPER"` and the current token | Every entry of the paper, orphans included, is deleted; log `PURCHASE_PURGE_ALL` | rows deleted | PD-10 | OK |
| PU-116 | `purgeAll` without scope; with `entries`, `deletedEntryIds` or `reevaluateTrays` | 400 | none | PD-10, PD-69 | OK |
| PU-117 | `purgeAll` when nothing is saved | `changed: false` | none | [O] | Observed |
| PU-118 | Delete or purge that would leave a stored dairy return above its balance | 409 with `details[]`; the deletion is rolled back too | none | DT-6.5, DT-10.1 | OK |
| PU-119 | ADMIN `reevaluateTrays` | Tray type of every saved entry re-resolved from current rules; changed ones updated, logged (`PURCHASE_TRAY_REEVALUATION`); dairy recalculated | rows updated | PD-34, PD-35 | OK |
| PU-120 | `reevaluateTrays` together with entries | Allowed | per scenario | PD-69 | OK |
| PU-121 | Product with no matching tray rule | No tray type; no dairy trays and no ledger line | none | DT-6.4 | OK |

### C6. Dairy tray side effects

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-125 | Save changes entries | Dairy ledger recalculated in the same transaction. Three purchases of 0.4 crates for one vehicle, session and tray type give 1 tray; billing is unaffected | dairy rows, dairy token | PD-28, DT-6.4 | OK |
| PU-126 | No-op save; admin rate recalculation | No dairy recalculation | none | DT-10.1 | OK |
| PU-127 | Lowering or deleting a purchase would leave a stored dairy return above its balance | 409 listing date, vehicle, session, tray, returned and outstanding; the Purchase write is rolled back | none | O-9 (PD), DT-6.5 | OK |
| PU-128 | REOPENED paper: same | Check also covers every later paper. On NIGHT_SUBMITTED only the current paper; later papers pick it up at finalize | none | DT-10.2 | OK |

### C7. Zero-allocation sign-off

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-130 | NIGHT_SUBMITTED, no allocation above 0, no header, token null | `changed: true`, header created with `signed_off_at`, `signed_off_by`, new token | Dairy header ensured | PD-38, PD-64 | OK |
| PU-131 | Header already exists | Token advanced once, sign-off recorded | header updated | PD-38, PD-66 | OK |
| PU-132 | Any allocation above 0 | 400 | none | PD-66 | OK |
| PU-133 | DRAFT, MORNING_SUBMITTED, FINALIZED | 400 | none | PD-66, PD-52 | OK |
| PU-134 | Repeat with the current token; with a stale token; token omitted | `changed: false` and the current token; 409; 400 | dairy header still ensured | PD-66 | OK |
| PU-135 | Allocation appears after the sign-off | Sign-off no longer counts; normal completeness | none | PD-38 | OK |
| PU-136 | Sign-off recorded, then every allocation disappears again | The old sign-off counts again | none | O-11 | D-12, Q7 |
| PU-137 | Revoke a sign-off | No endpoint exists | none | PD-66 | OK |
| PU-138 | Paper readiness | DRAFT: warning only. NIGHT_SUBMITTED: `requiredActions: [SIGN_OFF_ZERO_ALLOCATION]` and a problem | none | PD-70, PA-19.5 | OK (Paper-owned) |
| PU-139 | Who may sign off | EMPLOYEE (admins pass) | none | PD O-2 (open) | [U] Q9 |

### C8. Admin rate recalculation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-140 | Paper not REOPENED | 400 `Rates can only be recalculated while the paper is REOPENED` | none | PD-23 | OK |
| PU-141 | REOPENED, changes exist, valid token and reason | Every changed entry gets new link, rate, gatepass date, order-unit snapshot, amount. `recalculatedEntries` returned; token advanced | rows updated; one log line per changed entry (old and new values) | PD-23, PD-25 | OK |
| PU-142 | Any entry has no active link, no rate, or no order unit | 400 `Rate recalculation failed. Nothing was changed` with every problem listed | none | PD-24 | OK |
| PU-143 | Nothing differs | `changed: false`, token unchanged | none | PD-24 | OK |
| PU-144 | An orphan with a missing rate | Fails the whole recalculation | none | PD-24 | D-13 (spec silent) |
| PU-145 | No header and token null | `changed: false` | none | [O] | Observed |
| PU-146 | Brand gatepass policy changed after the entry was saved | Ordinary saves keep the saved date; recalculation re-resolves it | per scenario | PD-67 | OK |
| PU-147 | Recalculation never recalculates dairy trays | No dairy change | none | DT-10.1 | OK |

### C9. Paper gates (called by Paper)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-150 | Morning submit, every allocated cell (both sessions) has a saved entry, confirmed zeros included, nothing stale or orphan | Gate passes | none | PD-36, PD-42 | OK |
| PU-151 | An allocated cell has no saved entry | Paper 400 `Morning submission is not ready`, detail `Purchase missing: ...` | none | PD-54, PA-7.2 | OK |
| PU-152 | Stale entry; orphan entry | Blocked; an orphan is listed as orphan only, never also as stale | none | PD-37, PD-68 | OK |
| PU-153 | No allocation and no sign-off | Blocked with `zeroAllocationSignOffRequired` and Paper `requiredActions: [SIGN_OFF_ZERO_ALLOCATION]` | none | PD-38, PA-7.4 | OK (O-15) |
| PU-154 | Several problems at once | All reported in one 400 | none | PD-54 | OK |
| PU-155 | Critical shortfall on a saved entry | Does not block | none | PD-41, PD-42 | OK |
| PU-156 | Re-finalize of a REOPENED paper | Same gate runs. Finalizing a MORNING_SUBMITTED paper does not | none | PD O-6, PA-8.3 | OK |
| PU-157 | Night submit | No Purchase gate | none | [I] | OK |
| PU-158 | MORNING allocation changed after the MORNING purchase was saved | Entry stale; blocks submit until re-saved against the new allocation. NIGHT purchases cannot go stale this way | none | PD-65 | OK |

### C10. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-160 | Double click on Save | First succeeds, second 409 | one write | I-2 | OK |
| PU-161 | Save succeeded but the response was lost; retry with the old token | 409 although data was saved; the same payload with the NEW token is a no-op | none | O-10 | OK (not recorded, Q8) |
| PU-162 | Vehicle Allocation changes while the Purchase screen is open | Purchase token unchanged. A saved cell sending its old echo gets 400; an unsaved cell without echo is accepted and snapshots the new allocation | per scenario | I-4, PD-4 | D-4, Q3 |
| PU-163 | Unexpected exception after writes | Masked 500 with `requestId`; entries, token and dairy rows rolled back | rollback | I-5, PD-19 | Seam |
| PU-164 | Purchase save races Paper morning submit | One wins; a losing save gets the 400 status error | serializable | I-3 | OK |
| PU-165 | Retry after a serialization failure | No duplicate log lines (logs are written after commit) | none | PD-19 | OK (Seam) |
| PU-166 | Save with 5000 entries on a large paper | Must finish inside 10 s | - | O-19 | U (D-16) |

### C11. Cross-module

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| PU-170 | Vehicle Allocation lowers a quantity | Entry becomes stale at read time; nothing is written to Purchase | none | VA-13.1, PD-37 | OK |
| PU-171 | Vehicle Allocation removes a row (0) and later re-adds the same quantity | New allocation id, so the saved entry is stale | none | O-13 | Observed, [U] Q15 |
| PU-172 | Vehicle Allocation save that only refreshes its snapshot (same quantity) | Allocation id and quantity unchanged; entry not stale | none | VA-5.14 | OK |
| PU-173 | Allocation removed and product demand falls to 0 | Entry cannot be drawn: listed as orphan | none | PD-6, PD-7 | OK |
| PU-174 | Allocation removed but product still a column and the vehicle still has a row for the brand | Entry is drawn and stale, not an orphan. Resolution is not stated | none | O-12 | D-7, Q4 |
| PU-175 | Paper generated | Dairy tray header exists | header created | PD-64 | OK (Paper-owned) |

---

## D. Discrepancies and Gaps

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Spec silent, code differs from siblings | Save, recalculate-rates and sign-off return 201 (no `@HttpCode`). Orders, Client Trays and Vehicle Allocation return 200. PD states no success status | Low |
| D-2 | **Requirement conflict** | PD-1 says a zero must pass entity and link checks for a new row (so a missing link is 400). PD-48 says a new zero with missing configuration (link, rate or order unit) is not stored and returned in `ignoredEntries`. PD-3 says a zero for a never-allocated, never-saved cell is ignored. The code follows PD-1 for the link and PD-48 for rate and order unit | Medium |
| D-3 | Spec gap | The 2-decimal rule is checked inside the transaction after the token and allocation checks; siblings check it before the transaction. A stale token therefore hides a precision error | Low |
| D-4 | Spec gap | The allocation echo is mandatory only for an already-saved cell. For an unsaved cell, a change made in Vehicle Allocation since the screen was loaded is not detected when the echo is omitted: the entry is saved and the snapshot silently takes the new allocation. The purchase token does not cover allocation changes | Medium |
| D-5 | Code inconsistency | Variance, `shortfallWarnings` and the critical-shortfall log are computed for every accepted entry, including ones skipped as MISSING_CONFIGURATION, unchanged entries in the payload, and no-op saves | Low |
| D-6 | Spec gap, UI risk | `zeroAllocation.signOffRequired` is true in every status, including those where a sign-off is not possible (DRAFT) or not relevant (FINALIZED). PD-61 does not tie it to `workflow.editable` | Low to Medium |
| D-7 | Spec gap | A saved entry whose allocation was removed, but whose cell is still drawn, is stale and cannot be saved (400). PD-8 names deletion only for orphans; the resolution for this case is not written | Medium |
| D-8 | Spec gap, UI burden | A legacy or surplus entry (saved quantity above the lowered allocation) in a save payload fails the whole save with 400 (PD-63), although an unchanged echo of an over-precise quantity is tolerated (PD-27). The UI must exclude such cells | Low to Medium |
| D-9 | Doc differs from code | PD-56 says problems are reported as `{ message, details[] }`, and the code collects most problems together, but unknown delete ids, the empty-entries guard, purge conflicts and pricing problems are thrown separately, so a request with several kinds of problem reports only the first kind | Low |
| D-10 | Spec silent | `purgeAll` and `reevaluateTrays` role checks run before the transaction, so 403 wins over 404, over the workflow-status 400 and over a stale token | Info |
| D-11 | Spec gap | Not recorded for Purchase (decided for Orders, Client Trays and Vehicle Allocation): token format, lost-response retry, timeout 409, per-group scoping, success status | Low to Medium |
| D-12 | Spec gap | A recorded sign-off is permanent and counts again if allocations disappear later. PD-66 says only that it stops counting while allocations exist | Low |
| D-13 | Spec gap | Admin rate recalculation includes orphans. One orphan with a deactivated link or missing rate blocks the whole recalculation, and the orphan can be removed only by deletion (which needs the paper editable, as REOPENED is) | Low |
| D-14 | Spec gap | An employee can delete any saved entry, including a fresh one, without confirmation or mandatory reason. PD-5 requires only that ids belong to the paper. Deletion is logged with `userId` only | Low to Medium |
| D-15 | Info | Paper's 400 carries only `details[]` strings from the gate, not the structured `missing[]`, `stale[]`, `orphans[]` arrays (PD-54 shape reaches the client only through Purchase's own errors) | Info |
| D-16 | Non-functional risk | GET and every write load all order items (both sessions) and all allocations inside a 10 s transaction; rows are written one query at a time for updates. Unmeasured, as for the sibling modules | **Medium (unverified)** |
| D-17 | Dead code | Repository methods with UTC-midnight rate semantics that contradict PD-26 (`findProductLinkRateForDate`, `findPurchaseRateForDistributorProduct`) and other unused code (O-20). A future caller would break PD-26 | Info |
| D-18 | Info | Cells with no allocation and no entry carry rate 0 and amount 0, not null | Info |

**Scenarios the current implementation appears unable to satisfy, or that cannot be asserted**

- **PU-85:** PD-1 and PD-48 conflict (D-2); either reading breaks one requirement.
- **PU-96 (unsaved cell, no echo):** the allocation change is not detected (D-4).
- **PU-09:** expected 200, code 201 (D-1).
- **PU-50, PU-174:** the specified behaviour is incomplete (D-6, D-7).
- **PU-37, PU-92, PU-141, PU-163, PU-165:** need rate master data, fault injection or log capture.
- **PU-166:** operational, not assertable deterministically.

---

## E. Open Questions (decisions needed)

Each question lists the owner. "(current)" marks what the code does today. No answer is recommended.

**Q1 (Eng, D-1). Success status of save, recalculate-rates and sign-off.**
- A. 201 (current).
- B. 200, as Orders, Client Trays and Vehicle Allocation.
- C. Any 2xx; not binding.

**Q2 (Product, D-2). New zero entry whose distributor has no active link.**
- A. 400 (PD-1, current).
- B. Not stored, returned in `ignoredEntries` with reason MISSING_CONFIGURATION (PD-48).
- C. Other.

**Q3 (Product + Eng, D-4). Allocation echo for unsaved cells.**
- A. Optional; checked only when sent (current).
- B. Mandatory whenever an allocation exists.
- C. Other.

**Q4 (Product, D-7). A saved entry whose allocation was removed but whose cell is still drawn.**
- A. Stale, resolved by explicit deletion only (current).
- B. Treated as an orphan (listed and not drawn).
- C. A save of 0 with the echo removes it.
- D. Other.

**Q5 (Product, D-8). Legacy or surplus entry (quantity above a lowered allocation) present in a payload.**
- A. The whole save is rejected (current).
- B. An unchanged echo is tolerated, as for precision.
- C. Other.

**Q6 (Product, D-6). `zeroAllocation.signOffRequired` by status.**
- A. Independent of status (current).
- B. True only when a sign-off is possible (`workflow.editable`).
- C. Other.

**Q7 (Product, D-12). Sign-off after allocations disappear again.**
- A. The earlier sign-off counts again (current).
- B. A sign-off is cleared once allocations appear.
- C. Other.

**Q8 (Eng + Product, D-11). Items to record for Purchase as for the siblings.**
- A. Record: any parseable ISO-8601 token, lost-response retry gets 409, timeout is 409, any employee may edit any paper, success status per Q1.
- B. Decide each separately.

**Q9 (Product, PD O-2). Who may sign off a zero-allocation paper.**
- A. EMPLOYEE, admins pass (current).
- B. ADMIN only.

**Q10 (Product, D-14). Deleting saved entries.**
- A. Any employee, no reason (current).
- B. A reason is mandatory.
- C. Only orphans and stale entries by employees; other entries ADMIN only.

**Q11 (Eng, D-3). Where the 2-decimal rule is checked.**
- A. Inside the transaction, after the token (current).
- B. Before the transaction, as the siblings.

**Q12 (Eng, D-5). Shortfall warnings and the critical-shortfall log.**
- A. For every accepted entry (current).
- B. Only for entries that are stored or changed by this request.

**Q13 (Eng, D-9). Early single-message errors.**
- A. Keep (current).
- B. Collect them with the other problems.

**Q14 (Product, PD-67). Gatepass date and session.**
- A. Session-independent: policy decides the day (current).
- B. NIGHT and MORNING purchases resolve different days.

**Q15 (Product, O-13). Allocation removed and re-added with the same quantity.**
- A. The saved entry becomes stale (current, new allocation id).
- B. Not stale when the quantity is identical.

**Q16 (Eng, D-16). Scale of reads and writes.**
- A. Keep; measure on the largest real paper first.
- B. Batch the updates.
- C. Narrow the order-item read.

**Q17 (Eng, D-17, D-18). Dead code and the rate and amount of unallocated cells.**
- A. Leave dead code and the 0 values until a separate cleanup (current).
- B. Remove the contradictory rate methods; return null for unallocated cells.

---

## F. Revision After Decisions (Q1 to Q17)

The business owner answered all seventeen questions. Where the answer was delegated ("do what is logically best"), the choice below was made by the reviewer and recorded in `PURCHASE_BUSINESS_DECISION.md` (PD-71 to PD-76 and the amended PD ids). **Code changes are written but not compiled or run.** The source repository was not available, so the changed files were delivered as complete replacements (F5).

### F1. Decision log

| Q | Decision | Change |
| --- | --- | --- |
| Q1 | 200 as the sibling modules | Code: `@HttpCode(200)` on the three POSTs. Doc: PD-71, PD-57 |
| Q2 | A new zero with no active link is ignored (`MISSING_CONFIGURATION`); only a positive quantity fails. Chosen because PD-3 and PD-48 already treat such zeros as harmless and the cell already shows the problem | Code: validation service. Doc: PD-1, PD-3, PD-48 |
| Q3 | The allocation echo is mandatory for every cell that has an allocation. Chosen because the screen already receives it for every cell (`meta`) and it closes the silent re-snapshot gap | Code: validation service, message. Doc: PD-4 |
| Q4 | An entry with no current allocation is an orphan (listed, not drawn, resolved by deletion). Chosen over a new "save zero to delete" path because orphans already have a list, a delete action and a gate message | Code: builder, service, gate. Doc: PD-7, PD-37, PD-44, PD-68 |
| Q5 | A saved entry above its lowered allocation and sent back unchanged is left as it is and reported (`UNCHANGED_EXCEEDS_ALLOCATION`). It stays stale and keeps blocking submit. Chosen over silently refreshing its snapshot, which would hide the surplus | Code: validation service. Doc: PD-63, PD-57 |
| Q6 | `signOffRequired` is true only when a sign-off can be recorded now | Code: service. Doc: PD-61 |
| Q7 | Keep: a recorded sign-off counts again if all allocations disappear. Chosen because invalidating it needs a write from Vehicle Allocation or a cross-module timestamp comparison, for little benefit | Doc: PD-66 |
| Q8 | Record the sibling rules for Purchase (token format, lost response, timeout 409, any employee any paper) | Doc: PD-72 |
| Q9 | Keep: any employee may sign off | Doc: PD-66 (closes PD O-2) |
| Q10 | Any employee may delete, no reason | Doc: PD-73 |
| Q11 | Keep the precision check inside the transaction. Chosen because the "unchanged legacy echo is tolerated" rule (PD-27) needs the stored value | Doc: PD-27 |
| Q12 | Shortfall warnings and the log only for entries stored or changed by the request | Code: service. Doc: PD-41 |
| Q13 | Keep. Structure errors alone and first, entry problems together, pricing problems together after | Doc: PD-74 |
| Q14 | Keep: the gatepass day does not depend on the session | Doc: PD-67 |
| Q15 | Stale compares the allocated quantity only; the allocation row id is no longer compared | Code: util. Doc: PD-37 |
| Q16 | Keep; measure before go-live | Doc: PD-75 |
| Q17 | Leave dead code and the rate and amount 0 for unallocated cells for a separate cleanup | Doc: PD-76 |

### F2. Discrepancy status

| ID | Status |
| --- | --- |
| D-1 | Resolved (code, PD-71) |
| D-2 | Resolved (PD-1, PD-3, PD-48 amended, code) |
| D-3 | Accepted and documented (PD-27) |
| D-4 | Resolved (PD-4 amended, code) |
| D-5 | Resolved (PD-41 amended, code) |
| D-6 | Resolved (PD-61 amended, code) |
| D-7 | Resolved (PD-7 amended, code) |
| D-8 | Resolved (PD-63 amended, code) |
| D-9 | Accepted and documented (PD-74) |
| D-10 | Accepted (403 first; unchanged) |
| D-11 | Resolved (PD-72) |
| D-12 | Accepted and documented (PD-66) |
| D-13 | Accepted (PD-23 note) |
| D-14 | Accepted (PD-73) |
| D-15 | Accepted (PD-54 note) |
| D-16 | Open, operational (PD-75: measure before go-live) |
| D-17 | Deferred to a separate cleanup (PD-76) |
| D-18 | Deferred (PD-76) |
| D-19 | Resolved (section H, PD-77): the timeout 409 and a 409 with details keep the edits |
| D-20 | Resolved (section H, PD-78): no refetch on focus or reconnect |

### F3. Scenarios whose expected result changed

| ID | New expected result |
| --- | --- |
| PU-09 | HTTP 200 for save, recalculate-rates and sign-off |
| PU-42 | An allocation **quantity** change, or a removed allocation, makes an entry stale or orphan respectively. A removed-and-re-added allocation with the same quantity does not make it stale |
| PU-44 | A saved entry whose allocation is gone is an orphan: listed, not drawn, no variance (so UNPLANNED_ALLOCATION is no longer produced on the grid) |
| PU-50 | `signOffRequired` is false outside NIGHT_SUBMITTED and REOPENED; `noAllocations` is unchanged |
| PU-85 | New zero, no active link: 200, not stored, `ignoredEntries` reason `MISSING_CONFIGURATION` (allocated cell) or `NOT_ALLOCATED_AND_NOT_SAVED` (never allocated). A positive quantity is still 400 |
| PU-86 | Unchanged except that no shortfall warning is produced for the ignored entry |
| PU-93 | Echo missing for any entry whose cell has an allocation (saved or not): 400 `...must be sent back exactly as loaded` |
| PU-95 | Saved entry whose allocation was removed: 400 allocation modified or removed (it is an orphan; resolve by deletion) |
| PU-96 | Unsaved cell, echo omitted: 400. Echo different from the current allocation: 400 |
| PU-98 | Saved entry above its lowered allocation, quantity unchanged in the payload: the request succeeds; the entry is left as it is and listed in `ignoredEntries` (`UNCHANGED_EXCEEDS_ALLOCATION`); other entries are saved. A raised or changed quantity above the allocation: 400 |
| PU-63 | No-op save returns an empty `shortfallWarnings` (no warning for entries that were not stored or changed) |
| PU-136 | Recorded as binding (PD-66): the old sign-off counts again |
| PU-152 | An orphan now includes an entry with no current allocation; it is reported under `orphans[]` only |
| PU-153 | Unchanged |
| PU-162 | An allocation changed in Vehicle Allocation is detected on every allocated cell through the echo (400), not only on saved cells |
| PU-171 | A removed-and-re-added allocation with the same quantity: the entry is not stale |
| PU-174 | The entry is an orphan (see PU-44) |

### F4. New scenarios

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| PU-180 | Zero for a never-allocated, never-saved cell whose distributor has no link | 200, ignored `NOT_ALLOCATED_AND_NOT_SAVED` | PD-3 | Implemented, not yet run |
| PU-181 | Positive for a new cell with no link | 400 `does not have an active product link` | PD-1 | Implemented, not yet run |
| PU-182 | Echo present for a saved cell and for an unsaved allocated cell, both matching | Accepted | PD-4 | Implemented, not yet run |
| PU-183 | Payload has an over-allocation unchanged entry plus a valid change on another cell | 200; the other cell saved; the over-allocation entry in `ignoredEntries`; it is still stale at the gate | PD-63, PD-37 | Implemented, not yet run |
| PU-184 | Over-allocation entry with a changed quantity, still above the allocation | 400 exceeds | PD-63 | Implemented, not yet run |
| PU-185 | Allocation removed and re-added with the same quantity | Saved entry not stale | PD-37 | Implemented, not yet run |
| PU-186 | Allocation removed (no replacement) | Entry listed in `orphanedEntries`, not drawn, absent from grid totals but present in the response `persistedTotalAmount`; gate lists it as orphan only | PD-7, PD-45, PD-68 | Implemented, not yet run |
| PU-187 | DRAFT paper with no allocation | `zeroAllocation { noAllocations: true, signOffRequired: false }` | PD-61 | Implemented, not yet run |
| PU-188 | Save changes one entry that is not critically short and leaves another, unchanged, entry that is | `shortfallWarnings` is empty; the log line is not written | PD-41 | Implemented, not yet run |
| PU-189 | Saved entry sent back unchanged in a save that changes something else | No shortfall warning for it | PD-41 | Implemented, not yet run |

### F5. Files changed

Delivered as complete replacements (the repository was not available): `purchase.controller.ts`, `purchase.util.ts`, `purchase.builder.ts`, `purchase.service.ts`, `services/purchase-validation.service.ts`. One-spot patches (constants message, frontend type, frontend toast) are in `PURCHASE_SMALL_PATCHES.md`. `purchase.dto.ts`, the repository, the admin service and the other backend files are unchanged. `PURCHASE_BUSINESS_DECISION.md` is delivered in full.

Existing tests or callers that must be updated: anything asserting 201 on these POSTs; any client that saves an allocated cell without echoing `sourceAllocationId` and `sourceAllocatedQty`; any assertion that a new zero with no link is a 400; any assertion that a stale cell with a removed allocation is drawn.

### F6. Frontend review (added in this revision)

Read from the Purchase page, grid, notices, toolbar, admin panel and hooks. Impl: FE means checked against the frontend code.

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| PU-190 | Editing starts | The draft captures `purchasePaperUpdatedAt` (null stays null); a save uses that token even if the query refetches | PD-12 | FE: OK |
| PU-191 | Save pressed | Sends every cell that has an allocation, with the shown quantity, and echoes `meta.sourceAllocationId` and `sourceAllocatedQty`; cells whose meta has no allocation are skipped; cells marked removed go to `deletedEntryIds` | PD-4, PD-5, PD-11 | FE: OK (compatible with the amended PD-4) |
| PU-192 | Typing a quantity | The grid parser accepts 0 to the allocated quantity with at most 2 decimals, blank is 0, anything else keeps the old value with a toast | PD-27, PD-63 | FE: OK |
| PU-193 | Save succeeds | Draft cleared, query refetched; toast for changed or not; a toast for `ignoredEntries` and for critical shortfalls | PD-57, PD-41 | FE: OK; the ignored-entries toast must handle the new reason (patch in `PURCHASE_SMALL_PATCHES.md`) |
| PU-194 | Save fails with 409 meaning the data changed (stale token, race, exhausted retries) | Draft discarded, query refetched, toast "Purchase data changed". The timeout 409 and a 409 with details are NOT treated this way (PU-201, PU-202) | PD-12, PD-77 | FE: OK (changed in code, section H) |
| PU-195 | Save fails with 400 | Edits kept; the message with its details is shown as a list | PD-56 | FE: OK |
| PU-196 | Orphans present | A red list with a Remove action per entry (editable papers only), disabled while edits are unsaved; removal sends `entries: []` with `deletedEntryIds` and the loaded token | PD-7, PD-8 | FE: OK (now also covers entries with no allocation) |
| PU-197 | No allocation | The notice shows the sign-off button only when `workflow.editable`; it does not read `signOffRequired` | PD-38, PD-61 | FE: OK |
| PU-198 | Cell with no allocation and no entry | Shows a dash and is not editable | PD-4 | FE: OK |
| PU-199 | Admin panel | Reason box; recalculate rates (REOPENED, reason required), re-evaluate trays, purge with a confirm step; all disabled while edits are unsaved | PD-10, PD-23, PD-34 | FE: OK |
| PU-200 | Window regains focus with unsaved edits | `usePurchase` uses the default refetch on focus; the draft keeps its own captured token and grids, so a refetch does not change the save | PD-12 | FE: changed in code, section H (PU-200) |

**D-19 (Low to Medium).** `PurchasePage.handleWriteError` clears the draft on every 409, including the transaction-timeout 409 ("took too long, nothing was saved"). Orders, Client Trays and Vehicle Allocation keep the edits on that 409.
**D-20 (Low).** The purchase query is not protected against a refetch on window focus or reconnect. The draft is not affected, but the screen behind it can show newer data than the draft, and the token of a later orphan removal or sign-off comes from the refetched data.

### F7. New open questions

**Q18 (Eng, D-19). Frontend reload on 409 after a failed save. DECIDED: option B plus details (section H, PD-77).**
- A. Clear edits and reload on every 409 (current).
- B. As the sibling modules: keep the edits on the timeout 409, clear and reload on every other 409.
- C. Other.

**Q19 (Eng, D-20). Refetch policy of the purchase query. DECIDED: option B (section H, PD-78).**
- A. Default refetch on focus and reconnect (current).
- B. No refetch on focus or reconnect, as the sibling modules.
- C. Other.

### F8. Notes

- **Nothing was compiled or run.** The patched files were written from the file contents shared in this conversation. Type check them in the repository first; the riskiest spots are the `IgnoredEntry` reason union (used by `purchase.service.ts` when it pushes `MISSING_CONFIGURATION`) and the new `allocations` parameter of `findOrphanedEntries` (called from the builder and the gate).
- The Q3 change means every client of `POST /purchases/:paperId` must echo the allocation for every allocated cell. The provided page already does.
- Q7, Q9, Q10, Q11, Q13, Q14, Q16 and Q17 are documentation only.
- Dead code (D-17) was not touched.

---

---

## G. Test run (added after the backend specs were executed)

The backend scenario specs (`purchase.scenario.*.spec.ts`, see `PURCHASE_TEST_COVERAGE.md`) were written and run against `milk_distribution_test`.

**First run: 139 passed, 3 failed, 2 todo (144 tests, 8 files).** All three failures were test setup defects, not implementation defects:

| Test | Cause | Fix |
| --- | --- | --- |
| PU-39, PU-86, PU-87 | The scene was created with `rate: null`, so the Orders night save in the setup (`seedNight`) failed with `No active rate found for product ... on date ...` (OD-9.4). The scene could not be built. | The scene is built with a rate; the rate is removed afterwards (`deleteRates`), after the order and the allocation exist. |

**Consequences for this document**

1. Every Impl cell marked "Implemented, not yet run" or "OK" that is covered by a passing test is now **verified by execution**. The tests flagged as highest risk before the run all passed: PU-37 a to e, PU-38, PU-125a/b, PU-127a/b, PU-118, PU-128a/b, PU-164, PU-05, PU-171, PU-138, PU-153.
2. **No discrepancy between the amended implementation and the approved expectations was found.** D-1 to D-9, D-11 to D-15 and the amended PD-1, PD-3, PD-4, PD-7, PD-37, PD-41, PD-48, PD-61, PD-63 stay resolved as recorded in F2.
3. The note in F8 ("Nothing was compiled or run") applies to the code changes of F5 only up to this run; the specs now exercise them.
4. A scenario precondition worth recording (no behavior change): a missing rate can only arise **after** ordering, because an order cannot be saved without a rate (OD-9.4). Scenarios PU-39, PU-86, PU-87 and PU-142 therefore remove the rate after the order and the allocation exist.

**Still not covered**

| Scenario | Reason |
| --- | --- |
| PU-105 | Behavior undecided (observed, [U]). `it.todo`. A decision is needed (400 versus ignored). |
| PU-166 | Scale, operational (PD-75, D-16). `it.todo`. |
| PU-175 | Paper-owned (PD-64). |
| (frontend) | Written in section H; not yet run. |
| PU-12 (NaN, Infinity), PU-14 (legacy echo tolerance) | Not reachable through JSON or the `Decimal(10,2)` column. |

---

---

## H. Frontend revision (decisions Q18, Q19 and the frontend specs)

The frontend files were reviewed and the two open frontend questions were answered with the option that keeps Purchase consistent with Orders (OD-12.10), Client Trays (CT-9.7) and Vehicle Allocation (VA-14.5). Both are recorded in `PURCHASE_BUSINESS_DECISION.md` (PD-77, PD-78; open item O-10 closed). **The code changes and the frontend specs are written but NOT yet run or type-checked.**

### H1. Decision log

| Q | Decision | Change |
| --- | --- | --- |
| Q18 | Option B, extended: reload and discard the draft only on a 409 that means the data changed (stale token, first-save race, exhausted retries). Keep the edits on the timeout 409, and also on a 409 that carries `details[]` (a dairy return conflict: nothing changed, the user corrects the cause). Chosen to match the sibling modules and because discarding edits for a conflict that changed nothing only loses work | Code: new `utils/purchase-conflict.ts` (`classifyPurchaseConflict`), `PurchasePage.handleWriteError`, `useSavePurchase.onError`. Doc: PD-77 |
| Q19 | Option B: no refetch on window focus or reconnect | Code: `usePurchase` options. Doc: PD-78 |

### H2. Discrepancy status

| ID | Status |
| --- | --- |
| D-19 | Resolved (PD-77) |
| D-20 | Resolved (PD-78) |
| D-21 | New, low: `classifyPurchaseConflict` tells the 409 kinds apart by the response body (the timeout wording and the presence of `details[]`), so it breaks if that wording or shape changes. Same pattern as D-17 of Client Trays and N-5 of Vehicle Allocation |

### H3. Changed and new frontend scenarios

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| PU-194 (changed) | Save fails with a 409 meaning the data changed (stale, race, exhausted retries) | Draft discarded, query refetched, toast "Purchase data changed" | PD-12, PD-77 | Implemented, not yet run |
| PU-200 (changed) | Window regains focus or the network reconnects with unsaved edits | The purchase query is not refetched; the draft and token are unchanged | PD-78 | Implemented, not yet run |
| PU-201 | Save fails with the timeout 409 | Edits kept, no reload, message shown, no "data changed" toast | PD-77 | Implemented, not yet run |
| PU-202 | Save fails with a 409 that carries `details[]` | Edits kept, no reload, message and details shown | PD-77 | Implemented, not yet run |
| PU-203 | Retry after the timeout 409 | The same payload with the same token is sent | PD-77 | Implemented, not yet run |

### H4. Files changed

Frontend: `utils/purchase-conflict.ts` (new), `pages/PurchasePage.tsx`, `mutations/useSavePurchase.ts`, `queries/usePurchase.ts`. Paths are inferred from the Vehicle Allocation layout (`src/features/paper/modules/paper-level/purchase/`) and may need moving. `PurchasePage.tsx` no longer imports `getApiErrorStatus`.
Docs: `PURCHASE_BUSINESS_DECISION.md`, this file, `PURCHASE_TEST_COVERAGE.md`.

### H5. Notes

- The three edited frontend files were copied from the files provided and changed in place; nothing else in them was touched.
- The sign-off notice still decides from `noAllocations` and `workflow.editable`, not from `zeroAllocation.signOffRequired` (PU-197); both agree after the PD-61 amendment, so no change was made.
- The ignored-entries toast already handles all three reasons (`NOT_ALLOCATED_AND_NOT_SAVED`, `MISSING_CONFIGURATION`, `UNCHANGED_EXCEEDS_ALLOCATION`), so the small patch mentioned in F6 is not needed.

---

**Backend scenarios are covered by executed tests. The frontend scenarios are written and still to be run.**