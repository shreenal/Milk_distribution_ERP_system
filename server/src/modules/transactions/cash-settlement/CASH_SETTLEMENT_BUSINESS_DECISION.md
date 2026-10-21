# Cash Settlement Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/cash-settlement/` only (controller, service, repository, builder, DTOs, `services/*`, constants), plus the shared `CashSettlementCalculationService` and `types/cash-settlement.types.ts`.
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 15 (flagged decisions), Section 16 (open items) and Section 18 (frontend contract).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`CS-n`) are stable. Cite them in code comments, PRs and reviews. Section 17 maps them to the numbered review decisions (`S1` to `S36`) they came from.

**How the review decisions were applied.** Each decision `S1` to `S36` was checked against the decision files of the modules provided (Orders `OD`, Collections `CD`, Vehicle Allocation `VA`, Purchase `PD`). A decision that matched them was applied. A decision that contradicted them, or that cannot be implemented inside this module, was NOT applied and is listed in Section 15. Client Trays and Dairy Trays decision files were not available, so no check against them was possible. The review list contains no `S22`, `S23` or `S24`; confirm none was intended.

**Reference pattern:** where this file says "as in Orders / Collections / Vehicle Allocation / Purchase", the behavior copies `OD-n`, `CD-n`, `VA-n` or `PD-n`.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Paper | `order_paper`: one per business day. Cash settlement hangs off the paper. |
| Route / sheet | One delivery group's sheet on the paper (`order_sheet`). |
| Route cash | Sum of `client_collection.cash_collection` over every collection row of the route, MILK and NON_MILK together. |
| Route net cash | Route cash minus the route's expenses. |
| Denominations | Counts of ₹2000, 500, 200, 100, 50, 20, 10 notes plus `coins` as a rupee amount (not a count). |
| Route settlement | `cash_route_settlement`: one per route. Holds the counted denominations and owns the route's expenses. |
| Direct collection | Cash an employee collected outside any route. One per employee per paper. |
| Bank deposit | Cash taken to a bank. Several per paper, several per bank allowed. |
| Office cash | Total route net cash plus total direct collections. |
| Concurrency token | `order_paper.updated_at`, exposed as `cashSettlementUpdatedAt` and sent back as `expectedUpdatedAt`. |
| Submission gate | The checks run when the paper is submitted or finalized (Section 12). |

---

## 1. Access and Roles

**CS-1.1** All endpoints require login (JWT) and the `EMPLOYEE` role. How `ADMIN` passes is decided by the roles guard, outside this module.

**CS-1.2** Each of the four save endpoints is limited to 10 requests per minute per user. The read endpoint uses the global limit. Exceeding a limit returns 429.

---

## 2. Workflow: what can be edited at each paper status

**CS-2.1 Status matrix (binding; answered by the workflow service):**

| Paper status | Route expenses | Route denominations | Direct collections | Bank deposits |
|---|---|---|---|---|
| DRAFT | No | No | No | No |
| NIGHT_SUBMITTED | Yes | Yes | Yes | Yes |
| MORNING_SUBMITTED | No | No | No | No |
| FINALIZED | No | No | No | No |
| REOPENED | Yes | Yes | No | No |

The same flags are returned as `workflow.permissions` on the read endpoint.

**CS-2.2 The status is checked inside the transaction (binding, S5).** Every save reads the paper header and checks the status inside its own serializable transaction, so a status change between the check and the write cannot bypass the workflow. Order of checks: paper exists (404) -> status allows the section (400) -> token matches (409) -> request checks (400) -> token advance -> write.

**CS-2.3** Wrong status returns 400 `Cash settlement editing not allowed`. The message does not name the status or the section.

**CS-2.4 Reopen keeps direct collections and bank deposits frozen (binding, S21 not applied).** After a reopen only expenses and route denominations can be corrected. See Section 15.

---

## 3. Calculations (computed on read, never stored)

All arithmetic uses exact decimals, rounded half-up to 2 decimals.

**CS-3.1 Route cash** is the sum of `cash_collection` of every collection row of the route. Office cash, cheque, online and bank-deposit amounts of those rows are NOT part of route cash. This was confirmed by the business owner (CS-16.2, resolved).

**CS-3.2** Route expense total is the sum of the route's expense lines (0 if none). Route net cash = route cash − expense total. Route net cash can be negative.

**CS-3.3** Denomination amount = `2000×n2000 + 500×n500 + 200×n200 + 100×n100 + 50×n50 + 20×n20 + 10×n10 + coins`. A route with no settlement record counts as 0.

**CS-3.4** Per route: `difference = route net cash − denomination amount`.

**CS-3.5 Normal summary (every status except REOPENED):** total route cash, total route expenses, total route net cash, `directCollectionCash`, `officeCash = total route net cash + directCollectionCash`, `totalDeposits`, `cashInHandAfterDeposits = officeCash − totalDeposits`.

**CS-3.6 REOPENED summary:** historical route denomination cash and historical direct collection cash (the counted figures), `revisedOfficeCash = total route net cash + historical direct collection cash`, `revisedCashOnHand = revisedOfficeCash − totalDeposits`, `historicalCashOnHand = historical route denomination cash + historical direct collection cash − totalDeposits`, `reconciliationDifference = revisedCashOnHand − historicalCashOnHand`. Direct collections and deposits cancel out, so this equals total route net cash minus total counted route denominations.

**CS-3.7 No opening balance (binding, CS-16.5 resolved).** Each paper is self-contained. Nothing is carried from a previous paper, and no carry-forward mechanism is required.

---

## 4. Read (`GET /cash-settlement/:paperId`)

**CS-4.1** Response: `paper` (fixed subset of fields), `workflow`, `cashSettlementUpdatedAt`, `routeSettlements`, `routeExpenses`, `routeDenominations`, `directCollections`, `bankDeposits`, `summary`, `submission`.

**CS-4.2 Which routes appear (binding, CS-16.6).** Every route of the paper appears in `routeSettlements`, even with nothing entered, EXCEPT a route whose delivery group has since been deactivated and that has no money recorded on it. That route is hidden. A route "has money recorded" when its route cash, its expense total or its counted denominations are non-zero. A deactivated group's route that does have money recorded stays visible, so a recorded amount never vanishes because of a later master-data edit (same principle as OD-3.1 and CD-3.3). The filter is applied once, to the paper that the screen, the totals and the submission gate are all built from, so they always agree. A hidden route has zero net cash and zero counts, so hiding it never changes a total or a gate result. Saving to a hidden route is still allowed and makes it visible once it has money.
**CS-4.2a Cancelled and suspended routes do not exist.** The only route state in the data model is the group's `is_active` flag, so "cancelled" and "suspended" cannot be told apart from "inactive". A real cancelled / suspended state would need a model change and a new decision.
Each `routeSettlements` row: route cash, expense total, net cash, denomination total, difference.

**CS-4.3** `routeExpenses` lists expense lines (stable `id`, route, expense type, amount). `routeDenominations` lists only routes that have a settlement record. `directCollections` and `bankDeposits` list stored rows with their computed amounts.

**CS-4.4 `submission` (binding, S34).** `{ ready, routeMismatches[], depositProblems[] }` is computed live with the same checks as the submission gate (Section 12). It lets the screen distinguish a saved draft from a paper that would pass submission. It never blocks anything.

**CS-4.5** A missing paper is 404 `Paper not found`.

---

## 5. Input Validation Rules

**CS-5.1 Shape.** Unknown fields are rejected (400). Wrong types, missing required fields and malformed bodies are 400. Each array holds at most 1000 items.

**CS-5.2 Note counts.** Whole numbers from 0 to 100,000 (cap is a placeholder, CS-16.1). Decimals, negatives and strings are rejected.

**CS-5.3 Coins.** A rupee amount from 0 to 100,000 (cap is a placeholder, CS-16.1). Negatives and strings are rejected.

**CS-5.4 Expense amount (S13).** From 0.01 to 10,000,000 (cap is a placeholder, CS-16.1). **Zero is rejected.**

**CS-5.5 Decimals beyond 2 places** on expense amounts and coins are NOT rejected. The database rounds them to 2 decimals. This differs from the other modules (see Section 15, S16).

**CS-5.6 Required fields.** A denomination, direct collection or bank deposit entry must carry all eight denomination fields. The frontend sends 0 for empty ones.

**CS-5.7 Duplicates are rejected (400).** The same route twice in one denominations request (S8). The same employee twice in one direct collections request. The same expense id or deposit id twice in one request (S9).

**CS-5.8 Validation order.** Shape, caps and the duplicate checks of CS-5.7 run before the transaction. Checks that need the database run inside it (CS-2.2).

---

## 6. Route Expenses (`POST /cash-settlement/:paperId/route-expenses`)

Body: `{ expenses: [{ id?, sheetId, expenseTypeId, amount }], deletedExpenseIds?, expectedUpdatedAt }`

**CS-6.1** Allowed per CS-2.1 (NIGHT_SUBMITTED, REOPENED).

**CS-6.2 Record-level patch with stable ids (binding, S2, S17).** A line with an `id` is updated in place and keeps its id. A line without an `id` is added. An update is written only if the type or amount actually changed.

**CS-6.3 Nothing is deleted by omission (binding, S2).** Expenses of routes, or lines, that are not in the payload are untouched. A line is removed only by listing its id in `deletedExpenseIds`. This is the same rule as Purchase PD-5 / PD-6.

**CS-6.4 Checks.** Every sent id and every deleted id must belong to this paper (400). An id cannot be both saved and deleted (400). An expense cannot move to a different route (400; delete it and add a new one). Every `sheetId` must belong to the paper (400). Every `expenseTypeId` must exist and be active (400). Several lines for the same route and the same type are allowed (Section 15, S14).

**CS-6.5 Settlement records are not created in bulk (binding, CS-16.4).** A route's settlement record is created only when that route receives a new expense line, because the line needs a parent record. Saving expenses no longer creates empty records for every route. Reason: with the old behavior, whether a route appeared in `routeDenominations` depended on whether anyone had saved an expense for any route, and a route that was never counted looked the same as a route counted as zero. This follows OD-6.8 and CD-2.2 (never create zero-valued records). Operations could not be consulted from the code; the change was made on that evidence and is easy to reverse. Known remainder: deleting a route's last expense leaves its (zero) settlement record in place.

---

## 7. Route Denominations (`POST .../route-denominations`)

Body: `{ denominations: [{ sheetId, note2000 ... note10, coins }], expectedUpdatedAt }`

**CS-7.1** Allowed per CS-2.1 (NIGHT_SUBMITTED, REOPENED).

**CS-7.2 Partial save.** Only the routes in the payload are overwritten (create or full overwrite of that route's counts). Other routes and all expenses are untouched.

**CS-7.3 Checks.** Every `sheetId` must belong to the paper (400). The same route twice is rejected (400, S8). An empty array is valid and is a no-op. An all-zero entry for a route with no settlement record creates nothing (as CD-2.2). An entry equal to the stored counts is a no-op (CS-10.5).

**CS-7.4** The counted total is allowed to differ from the route net cash at save time. The mismatch is enforced only at submission (CS-12.2).

---

## 8. Direct Collections (`POST .../direct-collections`)

Body: `{ directCollections: [{ employeeId, note2000 ... note10, coins }], deletedEmployeeIds?, expectedUpdatedAt }`

**CS-8.1** Allowed only in NIGHT_SUBMITTED (CS-2.1).

**CS-8.2** One row per employee per paper. The same employee twice in a request is rejected (400).

**CS-8.3 Nothing is deleted by omission (binding, S3).** Employees not in the payload are untouched. A row is removed only through `deletedEmployeeIds` or through CS-8.4. Every deleted employee id must have a row on this paper (400), and an employee cannot be both saved and deleted (400).

**CS-8.4 All-zero rows are not kept (binding, S15).** An all-zero entry for an employee with no stored row creates nothing. An all-zero entry for an employee who has a stored row removes that row. This follows the sparse-row rules of CD-2.2 and VA-5.4 / VA-5.6.

**CS-8.5 Employee checks (binding, S7).** Every `employeeId` must exist (400). An inactive employee cannot receive a NEW direct collection (400), but an employee who already has a row on this paper stays updatable. This is the historical-record rule of CD-6.2 and OD-6.5(b).

---

## 9. Bank Deposits (`POST .../bank-deposits`)

Body: `{ bankDeposits: [{ id?, bankId, note2000 ... note10, coins }], deletedDepositIds?, expectedUpdatedAt }`

**CS-9.1** Allowed only in NIGHT_SUBMITTED (CS-2.1).

**CS-9.2** An entry with an `id` updates that deposit. An entry without one adds a new deposit. Several deposits to the same bank are allowed. Every `bankId` must exist and be active (400).

**CS-9.3 Nothing is deleted by omission (binding, S4).** A deposit is removed only by listing its id in `deletedDepositIds`. Every sent or deleted id must belong to this paper (400). The same id twice in one request is rejected (400, S9). An id cannot be both saved and deleted (400).

**CS-9.4 `deposit_reference` is removed (binding, CS-16.3).** It was never accepted, returned or used. See CS-14.1.

**CS-9.5** All-zero deposits are stored as sent (CS-8.4 applies to direct collections only).

**CS-9.6 Deposits are not blocked at save time (binding, S6).** A deposit larger than the available cash is saved. The excess is reported as a warning in `submission.depositProblems` on the save response and on the read response, and blocks only at submission (CS-12.3). Reason: all four sections are open together, so a hard check at save would make the order of entry matter. Same principle as VA-5.12.

---

## 10. Concurrency Token

**CS-10.1 Mandatory on every save (binding, S1).** `expectedUpdatedAt` is required on all four saves. Omitted is 400 (it is never defaulted). A malformed value is 400 `Invalid expectedUpdatedAt`. A value that differs from the paper's current `updated_at` is 409. Explicit `null` passes validation but is always 409, because a paper always has a token. Same contract as OD-12.7, CD-9.1, VA-9.2, PD-12.

**CS-10.2** The token is `order_paper.updated_at`, returned as `cashSettlementUpdatedAt`.

**CS-10.3 One token for the whole settlement (binding, S26).** Expenses, denominations, direct collections and bank deposits share one token, as Collections shares one token across its phases (CD-9.2). Saving any section advances it. This is acceptable because every save returns the new token (CS-11.1). It is also the right granularity: the paper's status changes (submit, finalize, reopen) also advance `updated_at`, so a screen opened before a status change can no longer save into the wrong workflow state.

**CS-10.4 Compared first, advanced atomically.** After the status check the token is compared (409 on mismatch, before any request check). It is advanced by a conditional update that must still match, using the clock-safe helper `touchIfTokenMatches` (as in all other modules). The advance happens inside the same transaction as the writes, so a failed save rolls it back.

**CS-10.5 No-op saves never advance the token (binding, CS-16.7).** A save is a no-op when it adds, changes and deletes nothing: values equal to the stored ones, `deleted...Ids` empty, all-zero entries with no stored row (CS-7.3, CS-8.4). A no-op returns success with `changed: false` and the CURRENT token, writes nothing and does not touch `updated_at`. A stale token is still 409 for a no-op (compared first, CS-10.4). A save that changes anything advances the token once. Same rule as OD-12.8, CD-9.4, VA-5.15 and PD-57. The no-op rule also means a no-op save no longer invalidates another user's open screen.

**CS-10.6 Transaction.** Each save is one serializable transaction with up to 3 total attempts on a serialization conflict, then 409 `Your request conflicted with another update and could not be completed. Please retry.`

---

## 11. Save Responses

**CS-11.1 (binding, S25).** Every successful save returns `{ success: true, changed, cashSettlementUpdatedAt, routeSettlements, routeExpenses, routeDenominations, directCollections, bankDeposits, summary, submission }`. The data is rebuilt from stored data inside the same transaction, after the write. `changed` is `false` for a no-op (CS-10.5), and the token is then the unchanged current one. The frontend replaces its token and its screen state without a GET. As in OD-12.4, CD-4.2, VA-5.16 and PD-57.

---

## 12. Submission and Finalization Gates (called by the paper workflow)

The paper workflow decides when these run. This module only provides the checks.

**CS-12.1 All problems are reported together (binding, S19).** A failure returns 400 `{ message: "Cash settlement is not ready for submission", details[] }`. `details` lists every failing route and every deposit problem, never only the first. Same shape as VA-8.1 and PD-54.

**CS-12.2 Route reconciliation.** For every route, route net cash must equal the counted denomination amount within ₹0.005 (kept, same figure as VA-8.2; CS-16.8 resolved). Detail format: `Route <name> cash mismatch. Expected <net>, received <counted>`. A route with no cash, no expenses and no counts passes. A negative net cash can never match, so it blocks submission.

**CS-12.3 Deposit checks.** (a) Total deposits must not exceed office cash: `Bank deposits exceed available office cash. Available: <x>, Deposited: <y>`. (b) For each of ₹2000, 500, 200, 100, 50, 20, 10 and coins, the deposited count (or coin amount), summed over all deposits, must not exceed what is available, which is the route denominations plus the direct collections: `Bank deposit <label> count exceeds available cash. Available: <a>, Deposited: <d>`. Both checks are always evaluated. **The bankable cash pool is exactly route denominations plus direct collections (binding, CS-16.9 resolved).** Cheque and online amounts are not cash. The night office cash collection is excluded, as decided in CS-16.2. Note that check (a) uses route net cash from the books and check (b) uses counted notes, so while a route still has a mismatch the two can differ; at submission they agree because every route must reconcile (CS-12.2).

**CS-12.4 Which paper transition runs what (as called today).** Morning submit runs CS-12.2 and CS-12.3. Finalizing a REOPENED paper runs them again and then CS-12.5.

**CS-12.5 Reopened paper reconciles route by route (binding, S10).** Finalizing a REOPENED paper requires every route to reconcile (CS-12.2). An error on one route can no longer hide behind the opposite error on another. Failure: 400 `{ message: "Cash settlement no longer reconciles after reopening. Route denominations must be re-entered before finalizing.", details[] }`. For any other status this check does nothing.

---

## 13. HTTP Status Conventions

| Situation | Status |
|---|---|
| Invalid shape, caps, duplicates, unknown ids, invalid sheet / expense type / bank / employee, wrong paper status, submission gate failure | 400 |
| Missing or malformed `expectedUpdatedAt` | 400 |
| Paper not found | 404 (S20, applied in part) |
| Stale token, explicit null token, serialization retry exhausted | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

**CS-13.1** A missing paper is 404 `Paper not found`, as in OD-14.1, CD-3.2, VA-3.1 and PD-55.

**CS-13.2** Errors raised with several problems use `{ message, details[] }` (as VA / PD).

---

## 14. Data Model

**CS-14.1 Unused columns removed (binding, S18, CS-16.3).** `remarks` is removed from `cash_route_expense`, `cash_direct_collection` and `cash_bank_deposit`, and `deposit_reference` is removed from `cash_bank_deposit`. Existing text in these columns is deleted by the migration (`migration.sql`). Same decision as CD-1.3. Nothing in the module read or wrote these columns.


**CS-14.2 Destructive migration.** The migration drops four columns. Take a backup first.

---

## 15. Review decisions NOT applied (flagged)

| ID | Decision | Why it was not applied | What is needed |
|---|---|---|---|
| S12 | Block expense saves that make route net cash negative, unless a managerial override | Saving is permissive and the gate is strict in the other modules (VA-5.12). Route cash can still change after the expense is entered (morning collections, reopen corrections), so a hard check makes the order of entry matter. No module has a managerial override, and VA-1.2 says administrators cannot bypass rules. A negative net already blocks submission (CS-12.2). | Decide whether a non-blocking warning is enough, and define who may override and how it is recorded. |
| S14 | Consolidate repeated expense types on one route | Every other module REJECTS duplicate keys (OD-5.6, CD-5.5, VA-5.11, PD duplicate entries) and never merges them silently. The alternative offered (justifications) needs the remarks field that S18 removes. Repeated lines stay allowed. | Decide: keep allowing repeats, or reject them (the consistent choice). |
| S16 | Round expense and coin decimals in code | All other modules reject more than 2 decimals and never round (OD-5.2, CD-5.3, VA-4.1, PD-27). Rounding in code would contradict that. The database rounding in CS-5.5 stays. | Decide whether to reject more than 2 decimals, as the other modules do. |
| S20 (part) | 403 for blocked workflow transitions, 422 for validation failures | Every other module returns 400 for both (OD-2.4, CD-2.3, VA-2.3, PD-52, and the HTTP tables). The 404 part IS applied (CS-13.1). | Decide whether to change the convention for all modules together. |
| S21 | Administrative adjustment workflow for direct collections and deposits after a reopen | Reopen corrects delivery results only (OD-2.3, VA-2.4). The change needs the shared workflow service and a new mechanism that is not defined, and VA-1.2 forbids administrator bypasses. | Define the mechanism and who may use it; decide for all modules. |
| S35 | Jittered backoff and smaller locked scope for retries | The retry helper is shared by every module and the retry policy (max 3 attempts) is a binding decision elsewhere (OD-6.2, VA-5.2). It cannot be changed inside this module. | Decide as a cross-module change. |
| S36 | Replace the timestamp token with an integer version column | Every other module uses a timestamp token with the clock-safe helper (OD-12, CD-9, VA-9, PD-12 / PD-58). One module on a different mechanism breaks the shared contract. | Decide as a cross-module change. |

---

## 16. Open Items and Resolved Items

**Still open**

| ID | Item | Current behavior |
|---|---|---|
| CS-16.1 | The caps in CS-5.2 to CS-5.4 (100,000 notes, 100,000 coins, 10,000,000 expense) are placeholders. The business owner will set the real numbers. | They live in one constant, `CASH_SETTLEMENT_LIMITS`. |

**Resolved (IDs kept so references stay stable)**

| ID | Resolution | Applied as |
|---|---|---|
| CS-16.2 | Only `cash_collection` is route cash. Confirmed correct. | CS-3.1 |
| CS-16.3 | `deposit_reference` removed. | CS-9.4, CS-14.1 |
| CS-16.4 | Checked against the code: settlement records for every route made "counted" and "never counted" look the same and made route visibility depend on unrelated saves. Changed: a record is created only for a route that receives a new expense line. Operations was not consulted. | CS-6.5 |
| CS-16.5 | No carry-forward mechanism is required. | CS-3.7 |
| CS-16.6 | Rule defined: a route of an inactive group is hidden unless it has money recorded. Cancelled and suspended states do not exist in the data model. | CS-4.2, CS-4.2a |
| CS-16.7 | A no-op save no longer advances the token. | CS-10.5 |
| CS-16.8 | The ₹0.005 tolerance is kept (same as VA-8.2). | CS-12.2 |
| CS-16.9 | The bankable pool is route denominations plus direct collections only. Verified in the code: nothing else feeds it. | CS-12.3 |
| CS-16.10 | The live `submission` block must be shown prominently by the frontend. Backend support exists (CS-4.4). The display itself is a frontend requirement. | CS-4.4, Section 18 |

---

## 17. Traceability and Change Log

| Review decision | Applied as |
|---|---|
| S1 | CS-10.1 |
| S2 | CS-6.2, CS-6.3 |
| S3 | CS-8.3 |
| S4 | CS-9.3 |
| S5 | CS-2.2 |
| S6 | CS-9.6, CS-4.4 |
| S7 | CS-8.5 |
| S8 | CS-5.7, CS-7.3 |
| S9 | CS-5.7, CS-9.3 |
| S10 | CS-12.5 |
| S11 | CS-5.2 to CS-5.4 (placeholders, CS-16.1) |
| S12 | Not applied (Section 15) |
| S13 | CS-5.4 |
| S14 | Not applied (Section 15) |
| S15 | CS-8.4 |
| S16 | Not applied (Section 15) |
| S17 | CS-6.2 |
| S18 | CS-14.1 |
| S19 | CS-12.1 |
| S20 | CS-13.1 applied; 403 / 422 not applied (Section 15) |
| S21 | Not applied (Section 15) |
| S25 | CS-11.1 |
| S26 | CS-10.3 (one shared token kept) |
| S27 to S32 | CS-16.2 to CS-16.9 (resolved, Section 16) |
| S33 | CS-4.2, CS-4.2a (rule defined under CS-16.6) |
| S34 | CS-4.4, CS-16.10, Section 18 |
| S35, S36 | Not applied (Section 15) |

| ID | Type | Summary |
|---|---|---|
| CS-10 | Changed | Token mandatory, explicit null is 409, clock-safe advance, new token returned |
| CS-6, CS-8, CS-9 | Changed | Deletion by omission removed; explicit delete lists; expense lines keep stable ids |
| CS-2.2 | Changed | Status checked inside the transaction |
| CS-5 | Changed | Caps on every financial input; zero expense rejected; duplicate routes and ids rejected |
| CS-8.4, CS-8.5 | Changed | All-zero direct collections not kept; employees validated |
| CS-9.6, CS-4.4 | Changed | Deposit excess is a non-blocking warning; live `submission` block |
| CS-12 | Changed | Gate reports every problem together; reopened paper reconciles per route |
| CS-11 | Changed | Saves return the new token and the recalculated screen |
| CS-13 | Changed | Missing paper is 404 |
| CS-14 | Changed | `remarks` columns removed |
| CS-14.1 | Changed | `deposit_reference` column removed too (CS-16.3) |
| CS-6.5 | Changed | Settlement records are created only for routes that receive a new expense line (CS-16.4) |
| CS-7.3 | Changed | All-zero denominations for a route with no record create nothing |
| CS-4.2 | Changed | Routes of inactive groups with no money recorded are hidden (CS-16.6) |
| CS-10.5 | Changed | No-op saves do not advance the token; saves return `changed` (CS-16.7) |
| CS-16 | Changed | Open items resolved; only the placeholder caps (CS-16.1) remain open |

---

## 18. Frontend Contract Summary

These are client-side requirements. The backend cannot enforce them.

1. Load the screen. Keep `cashSettlementUpdatedAt`. Send it as `expectedUpdatedAt` on every save. Never omit it.
2. After every save, replace the local token with `cashSettlementUpdatedAt` and the local screen state with the response data. No GET is needed. If `changed` is `false`, the token is unchanged.
3. **Show `submission` prominently (CS-16.10).** Display `submission.ready`, and list every entry of `routeMismatches` and `depositProblems` where the user can see them while editing, not only after a failed submit. Saving is permissive and submission is strict, so this block is the only live signal that a saved draft would fail submission.
4. Send expense lines with their `id` to edit them, without an `id` to add them, and list removed lines in `deletedExpenseIds`. Do the same with `deletedDepositIds` for deposits and `deletedEmployeeIds` for direct collections. Leaving something out never deletes it.
5. Send all eight denomination fields on every entry, with 0 for empty ones.
6. On 409, reload. On 400 with `details`, show the list.
7. Use `workflow.permissions` to enable or disable each section.