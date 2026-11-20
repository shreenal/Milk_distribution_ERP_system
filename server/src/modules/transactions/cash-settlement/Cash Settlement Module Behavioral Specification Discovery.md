# Cash Settlement Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Cash Settlement module. No automated tests are included. Nothing here was compiled or run.

## Evidence and Labels

`CASH_SETTLEMENT_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its CS-n items are treated as confirmed requirements. Supporting evidence: the Paper decision file (PA-n), the Collections decision file (CD-n), the Orders decision file (OD-n), the Orders and Collections discovery and test-coverage documents (used only as structure and lessons learned), the Cash Settlement backend code (controller, service, repository, builder, validation service, calculator, DTOs, constants), `workflow-state.service.ts`, `paper-validation.service.ts`, `dependency-register.ts`, `schema.prisma`, and the frontend Cash Settlement feature (page, hooks, sections, API, types) plus `QueryProvider.tsx`.

**Not available** (each would shrink the Unknowns list): existing Cash Settlement tests and issue/bug history, Swagger output, UI mockups, the migration SQL, `@/shared/api/http` and `@/shared/api/error`, `paper/utils/error` (`extractErrorMessage`), the masters hooks (`useActiveBanks`, `useActiveEmployees`, `useActiveExpenseTypes`), the Reports module, the Distributor Transfer API, and the Client Trays and Dairy Trays decision files.

**Labels:** **\[C\]** confirmed requirement (CS / PA / CD / OD id). **\[O\]** observed in code only. **\[I\]** inferred assumption. **\[U\]** unknown, needs a decision.

**Assumptions made explicit**

1. CS-n beats code where they disagree (the file says so). Where CS is silent, Orders and Collections are used only as analogies, labelled \[I\], never as requirements.
2. The CS review list has no S22, S23 or S24 (CS file, preamble). I assume nothing was intended there.
3. Scenario IDs (`S-n`) are scoped to this document, not to the Orders or Collections `S-n` IDs.
4. Items in CS Section 15 (S12, S14, S16, S20 part, S21, S35, S36) are decided “not applied”. They are reported as current behavior, not re-opened as discrepancies.

---

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /cash-settlement/:paperId` | EMPLOYEE (ADMIN passes, \[I\]) | global 300/min | Whole screen: routes, expenses, denominations, direct collections, deposits, summary, submission, token |
| `POST .../route-expenses` | EMPLOYEE | 10/min \[C: CS-1.2\], one bucket per endpoint \[O\] | Patch expense lines by id |
| `POST .../route-denominations` | EMPLOYEE | 10/min | Overwrite counted notes and coins per route |
| `POST .../direct-collections` | EMPLOYEE | 10/min | One cash row per employee |
| `POST .../bank-deposits` | EMPLOYEE | 10/min | Deposit rows, several per bank allowed |

Non-endpoint surface: Paper calls `validateMorningSubmitReadiness` at morning submit (PA-7.2 item 7) and in readiness (PA-19); Paper calls `getSubmissionStatus` to build re-finalize warnings (PA-8.9); a Collections save that changes `cash_collection` writes `order_paper.updated_at`, this module’s token (CD-7.2).

### A2. What each paper status allows \[C: CS-2.1\]

| Paper status | Route expenses | Route denominations | Direct collections | Bank deposits |
| --- | --- | --- | --- | --- |
| DRAFT | No | No | No | No |
| NIGHT\_SUBMITTED | Yes | Yes | Yes | Yes |
| MORNING\_SUBMITTED | No | No | No | No |
| FINALIZED | No | No | No | No |
| REOPENED | Yes | Yes | No | No |

GET is allowed in every status \[I: CS-2.1 restricts saves only\]. After an admin revert (PA-18) the paper is NIGHT\_SUBMITTED again and all four sections reopen \[I\].

### A3. Record lifecycles

1. **Expense line.** Created by a line without `id` (its route’s settlement record is created at that moment, CS-6.5). Updated in place by a line with `id`, only if type or amount changed. Removed only by `deletedExpenseIds`. Never deleted by omission \[C: CS-6.2 to 6.3\].
2. **Route settlement record (counted notes).** Created by the first expense line for that route, or by a non-zero denominations entry. Overwritten in full by a later entry. An all-zero entry for a route with no record creates nothing. Deleting a route’s last expense leaves its zero record \[C: CS-6.5, 7.3\].
3. **Direct collection.** One per employee per paper. Created by a non-zero entry. An all-zero entry removes a stored row, or creates nothing if none exists. Removed also by `deletedEmployeeIds` \[C: CS-8.3, 8.4\].
4. **Bank deposit.** Created by an entry without `id`, updated by an entry with `id`, removed by `deletedDepositIds`. All-zero deposits are stored as sent \[C: CS-9.2, 9.3, 9.5\].
5. **Everything is removed with the paper** (database cascade) \[O\]. No audit or history exists \[C: PA-20.2 scope\].

### A4. Side effects and consumers

- **Concurrency token:** `order_paper.updated_at`, returned as `cashSettlementUpdatedAt`. One token for all four sections \[C: CS-10.3\]. It is also advanced by Paper actions (submit, finalize, reopen, revert), by Collections saves that change a cash amount (CD-7.2), and is the token of Distributor Transfer (PA-8.11). Marking a sheet no-operation does not advance it (PA-17.6).
- **No propagation, outbox or audit** from this module \[O\]. The dependency register has only DEP-011 (Collections → Cash Settlement, CONSUMPTION, ON\_READ) and the two Paper → Cash Settlement VALIDATION entries (DEP-018, DEP-019) \[O\].
- **Consumers:** Paper readiness and morning-submit gate; Paper re-finalize warnings and audit entry (PA-8.9, PA-20.2); frontend.
- **Inputs:** `client_collection.cash_collection` of the route’s sheet, both categories \[C: CS-3.1, CD-7.1\].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | Route cash is the sum of `cash_collection` only (both categories). Office cash, cheque, online, bank deposit are never part of it | CS-3.1, CD-7.1 |
| INV-2 | Nothing is deleted by omission, in any section | CS-6.3, 8.3, 9.3 |
| INV-3 | The status is checked inside the save transaction | CS-2.2 |
| INV-4 | `expectedUpdatedAt` is required on every save. Omitted is always 400. Explicit null is always 409 | CS-10.1 |
| INV-5 | A no-op save never advances the token and returns `changed: false` with the current token. A stale token is still 409 | CS-10.5 |
| INV-6 | Each save is all-or-nothing, including the token | CS-10.4 |
| INV-7 | Saving is permissive, submission is strict: mismatches and excess deposits are saved and only block at submission | CS-7.4, 9.6, 12 |
| INV-8 | Every save returns the new token and the recalculated screen, built from stored data after the write | CS-11.1 |
| INV-9 | The screen, the totals and the submission gate are built from the same set of routes | CS-4.2 |
| INV-10 | A recorded amount never vanishes from the screen because of later master-data edits | CS-4.2 (same principle as OD-3.1, CD-3.3) |
| INV-11 | Route reconciliation is exact within ₹0.005 | CS-12.2 |
| INV-12 | The bankable cash pool is route denominations plus direct collections | CS-12.3 |
| INV-13 | Each paper is self-contained: no opening balance, no carry-forward | CS-3.7 |
| INV-14 | After a reopen, direct collections and deposits stay frozen | CS-2.4 |

**Security constraints**

- SEC-1: JWT required on all endpoints \[C: CS-1.1\].
- SEC-2: an inactive user’s unexpired token gets 401 \[I, `JwtStrategy`\].
- SEC-3: the role comes from the DB-backed user, never the body \[O\].
- SEC-4: unknown body fields are rejected (400) \[C: CS-5.1\].
- SEC-5: URL id is digits only, 1 to 2147483647 \[I: `ParseIdPipe`, as OD-4.3\].
- SEC-6: per-user throttle on saves \[C: CS-1.2\].
- SEC-7: body limit 1 MB; unexpected errors masked with a request id \[O, I: PA-11.5\].
- SEC-8: **no per-paper or per-route authorization is defined** \[U: Q4\]. Orders (OD-1.3), Collections (CD-12.3) and Paper (PA-1.3) each record this decision explicitly. Cash Settlement does not.

---

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Access and throttling | CS-1.1, 1.2 |
| Workflow matrix, in-transaction status check, error text | CS-2.1 to 2.4 |
| Calculations | CS-3.1 to 3.7 |
| Read, route visibility, `submission` block | CS-4.1 to 4.5 |
| Input validation | CS-5.1 to 5.8 |
| Each section | CS-6 (expenses), CS-7 (denominations), CS-8 (direct), CS-9 (deposits) |
| Token | CS-10.1 to 10.6 |
| Save response | CS-11.1 |
| Submission gates | CS-12.1 to 12.5 (12.4 and 12.5 amended by PA-8.3, PA-8.9) |
| HTTP statuses | CS-13 |
| Data model | CS-14.1, 14.2 |
| Frontend contract | CS-18 |
| Cross-module | PA-2.4, PA-7.2, PA-8.3, PA-8.9, PA-11.1, PA-19, PA-20.2, CD-7.1, CD-7.2, PA-8.11 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | The four POST handlers have no `@HttpCode`, so success is HTTP 201. Orders and Collections pin 200 (OD tests DISC-1, CD-11.1). CS lists no success code | `cash-settlement.controller.ts` |
| O-2 | Each save endpoint has its own throttle bucket (up to 40 per minute in total per user) | controller |
| O-3 | A date-only or week-date token passes the DTO, then mismatches and gives 409. An ISO-looking value that `Date` cannot parse gives 400 | `expected-updated-at.decorator.ts`, service |
| O-4 | A transaction over 10 s returns 409 “took too long and nothing was saved”. CS-10.6 lists only serialization conflicts | `transaction-runner.ts` |
| O-5 | `validateExpenseTypesExist` and `validateBanksExist` run on EVERY sent line, including unchanged ones, and require `is_active` | validation service |
| O-6 | `validateEmployees` runs on every direct-collection entry, including all-zero ones, before the all-zero rule applies | service, validation service |
| O-7 | `id` (expenses, deposits) and the `deleted...Ids` arrays have no `@Max(2147483647)`, unlike `sheetId`, `employeeId`, `bankId`. In-memory id checks run before any query that uses them, so no database overflow is reachable | DTOs, repository |
| O-8 | Duplicates inside `deleted...Ids` are rejected by `@ArrayUnique` with the class-validator text, not a CS message. CS-5.7 names only saved ids | DTOs |
| O-9 | The GET reads the paper with one `findUnique` outside a repeatable-read snapshot (Orders and Collections use a snapshot). Save responses are built inside the save transaction | service |
| O-10 | Unused code: `validateReconciliationOnFinalize`, `NOT_RECONCILED_AFTER_REOPEN`, `RECONCILIATION_MISMATCH`, `getRouteCashFromCollections`, `getRouteExpenseTotalFromExpenses`. Reported, not deleted | validation service, constants, calculator |
| O-11 | The per-denomination deposit message for coins reads “coins count exceeds available cash” although coins are an amount | constants |
| O-12 | Frontend: after a save the response is merged over the cached view, so `paper` and `workflow` are the older GET values (`paper.updated_at` no longer equals the token). The page uses `cashSettlementUpdatedAt` | `useSaveCashSettlement.ts` |
| O-13 | Frontend: every change of the query data resets ALL section drafts and delete lists | `CashSettlementPage.tsx` |
| O-14 | Frontend: the save hook invalidates and refetches on any 409 (including the timeout 409), and not on 400 | `useSaveCashSettlement.ts` |
| O-15 | Frontend: the denominations save sends every route row; the expenses, direct and deposit saves send every row of the section. The server drops no-ops | page |
| O-16 | Frontend: only routes in `routeSettlements` are offered, so a hidden route (CS-4.2) cannot be reached from the screen, although the API accepts it | page |
| O-17 | Frontend: the query uses React Query defaults (`staleTime` 0, refetch on focus and reconnect on). `QueryProvider` sets only `retry` | `useCashSettlement.ts`, `QueryProvider.tsx` |

### B3. Inferred (assumptions)

- **I-1:** An inactive user’s token gets 401 (`JwtStrategy`).
- **I-2:** A malformed URL id gets 400 “Invalid id” (`ParseIdPipe`).
- **I-3:** A double-click on Save gives one success and one 409 (follows from CS-10).
- **I-4:** A save racing a Paper status change has exactly one winner (status read inside the serializable transaction, CS-2.2, PA-11.1).
- **I-5:** A database error gives a masked 500, nothing saved, token rolled back.
- **I-6:** ADMIN passes every endpoint through the role hierarchy (CS-1.1 delegates this to the guard).
- **I-7:** React Query keeps the same `data` reference when a refetch returns deeply equal data (structural sharing), so a no-change background refetch does not reset drafts; a changed payload does (O-13).

### B4. Unknowns

See section E.

---

## C. Behavioral Scenario Matrix

**Impl column:** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. U-Qn points to an open question in section E. SEAM means it cannot be reached through the public API and needs an injected fault or database seeding. “Then” includes state changes and side effects.

### C1. Access, throttling, request shape

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-01 | No, garbage or expired JWT; any of the 5 endpoints | 401, nothing changes | CS-1.1 | OK |
| S-02 | Valid EMPLOYEE JWT; GET and the four saves | Allowed | CS-1.1 | OK |
| S-03 | Valid ADMIN JWT; same calls | Allowed (role hierarchy) | I-6 | OK |
| S-04 | Deactivated user, unexpired token | 401 | I-1 | OK |
| S-05 | Same user sends an 11th save to one endpoint within 60 s | 429. Other endpoints and other users unaffected | CS-1.2, O-2 | OK |
| S-06 | Body or entry carries an unknown field (`remarks`, `depositReference`, `role`, `foo`) | 400, nothing saved | CS-5.1, 14.1 | OK |
| S-07 | An employee reads and edits any paper | Allowed | SEC-8 | U-Q4 |
| S-08 | Paper id `abc`, `0`, `-1`, `2147483648`; `007` | 400 “Invalid id”; `007` read as 7 | I-2 | OK |

### C2. Reads (`GET /cash-settlement/:paperId`)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-10 | Paper id missing in the database | 404 “Paper not found” | CS-4.5, 13.1 | OK |
| S-11 | Any paper | Keys: `paper` (fixed subset), `workflow`, `cashSettlementUpdatedAt`, `routeSettlements`, `routeExpenses`, `routeDenominations`, `directCollections`, `bankDeposits`, `summary`, `submission` | CS-4.1 | OK |
| S-12 | GET in each of the five statuses | 200 each. `workflow.permissions` equal the section A2 matrix | CS-2.1 | OK |
| S-13 | A route’s sheet has milk cash 100, non-milk cash 50, plus office cash, cheque, online and bank amounts | `routeCash` is 150. The other amounts are ignored | CS-3.1, CD-7.1 | OK |
| S-14 | Route cash 1000, expense lines 300 and 200 | `expenseTotal` 500, `routeNetCash` 500. Net can be negative | CS-3.2 | OK |
| S-15 | Counted 2×₹2000, 1×₹500, 3×₹100, coins 25.50 | `denominationTotal` 4825.50. A route with no settlement record counts 0 | CS-3.3 | OK |
| S-16 | Any route | `difference` = net − counted | CS-3.4 | OK |
| S-17 | Any status except REOPENED | Summary: total route cash, expenses, net, `directCollectionCash`, `officeCash` = net + direct, `totalDeposits`, `cashInHandAfterDeposits` | CS-3.5 | OK |
| S-18 | REOPENED | Summary: historical denominations, historical direct, `revisedOfficeCash`, `revisedCashOnHand`, `historicalCashOnHand`, `reconciliationDifference` (= total net − total counted) | CS-3.6 | OK |
| S-19 | FINALIZED after a re-finalize | Normal-shape summary, no `reconciliationDifference` | CS-3.5 | OK as written; U-Q9 |
| S-20 | Any paper | Every route appears, even with nothing entered | CS-4.2 | OK |
| S-21 | Route of an inactive group with zero cash, zero expenses, zero counts | Hidden. No total or gate result changes | CS-4.2 | OK |
| S-22 | Same route with any non-zero cash, expense or count | Visible | CS-4.2, INV-10 | OK |
| S-23 | Hidden route; a Collections save later puts positive cash on its sheet | Route appears, normally with a mismatch | CS-4.2 \[I\] | OK |
| S-24 | Any paper | `routeExpenses` carry stable ids. `routeDenominations` lists only routes with a record. Direct and deposit rows carry computed amounts | CS-4.3 | OK |
| S-25 | Amounts 0.1 and 0.2 | Totals exact (0.30), 2 dp half-up | CS-3 | OK |
| S-26 | An earlier paper has leftover cash | Nothing carried into this paper | CS-3.7 | OK |
| S-27 | Any paper | `submission` equals what the gate would report at that moment. It never blocks anything | CS-4.4 | OK |

### C3. Save validation and token (all four saves)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-30 | `expectedUpdatedAt` omitted, each of the four saves | 400 | CS-10.1 | OK |
| S-31 | Token `"abc"`, number `123`, `""` | 400 “Invalid expectedUpdatedAt” | CS-10.1 | OK |
| S-32 | Explicit `null`, paper in an editable status | 409 stale (a paper always has a token) | CS-10.1 | OK |
| S-33 | Well-formed timestamp that differs from the current token; date-only value | 409 | CS-10.1, O-3 | OK; format undocumented, U-Q7 |
| S-34 | Matching token plus a real change | 200, `changed: true`, new token strictly later than the old one | CS-10.4, 11.1 | OK |
| S-35 | Note counts 0 and 100000; then 100001, -1, 1.5, `"5"` | First two accepted. The rest 400 | CS-5.2 | OK (cap is a placeholder, CS-16.1) |
| S-36 | Coins 0 and 100000; negative; string; 10.005 | First two accepted. Negative and string 400. 10.005 accepted and stored as 10.01 | CS-5.3, 5.5 | OK |
| S-37 | Expense amount 0.01 and 10,000,000; then 0, 0.005, -1, 10,000,000.01 | First two accepted. The rest 400 | CS-5.4 | OK |
| S-38 | Arrays of 1000 and 1001 items; empty arrays | 1000 accepted, 1001 400. Empty is valid | CS-5.1, 7.3 | OK |
| S-39 | An entry missing one of the eight denomination fields | 400 | CS-5.6 | OK |
| S-40 | Same route twice (denominations), same expense id, same deposit id, same employee, in one request | 400 with the duplicate message | CS-5.7 | OK |
| S-41 | Duplicate ids inside `deletedExpenseIds`, `deletedEmployeeIds` or `deletedDepositIds` | 400 | O-8 | OK (wording, D-14) |
| S-42 | Duplicate entry together with a missing paper | 400 (checked before the transaction) | CS-5.8 | OK |
| S-43 | Missing paper with a stale token; wrong status with a stale token | 404; 400 (status before token) | CS-2.2 | OK |
| S-44 | Stale token with an otherwise no-op payload | 409 | CS-10.4, 10.5 | OK |
| S-45 | Stale token together with a sheet id outside the paper | 409 (token before request checks) | CS-2.2 | OK |

### C4. Workflow gates

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-50 | Expenses or denominations in NIGHT\_SUBMITTED, REOPENED | Allowed | CS-2.1 | OK |
| S-51 | Direct collections or deposits in NIGHT\_SUBMITTED; in REOPENED | Allowed; 400 | CS-2.1, 2.4 | OK |
| S-52 | Any of the four in DRAFT, MORNING\_SUBMITTED, FINALIZED | 400 “Cash settlement editing not allowed”, nothing changes | CS-2.3 | OK |
| S-53 | A save races a Paper submit | Exactly one wins. A save never lands in a state that no longer allows it | CS-2.2, I-4 | OK \[I\] |
| S-54 | Admin reverts MORNING\_SUBMITTED | All four sections allowed again. Old screens get 409 (revert advances the token) | PA-18.4, PA-8.11 | OK \[I\] |
| S-55 | Wrong-status error | Text names neither the status nor the section | CS-2.3 | OK |

### C5. Route expenses

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-60 | A line without `id` for a route with no settlement record | 200. Line gets an id. That route’s record is created, no other route’s | CS-6.2, 6.5 | OK |
| S-61 | A line with `id`, amount changed | Updated in place, same id | CS-6.2 | OK |
| S-62 | A line with `id`, equal to stored | Nothing written (no-op if alone) | CS-6.2, 10.5 | OK |
| S-63 | Payload omits existing lines or routes | They are untouched | CS-6.3 | OK |
| S-64 | `deletedExpenseIds` lists one id | Only that line is removed | CS-6.3 | OK |
| S-65 | Id of another paper or unknown; id both saved and deleted; id sent with a different route | 400 with `details`, nothing saved | CS-6.4 | OK |
| S-66 | `sheetId` outside the paper; expense type unknown or inactive | 400 | CS-6.4 | OK |
| S-67 | Several lines for the same route and type | Allowed | CS-6.4 | OK |
| S-68 | Amount 0.011 | Stored 0.01. Sending the same payload again is a no-op | CS-5.5 | OK |
| S-69 | A saved line’s expense type was deactivated later; the screen sends it unchanged together with another edit | CS-6.4 says every type must be active. INV-10 says recorded data must not strand. Today: 400 “Invalid or inactive expense type(s)”, nothing saved | CS-6.4 vs INV-10 | D-2, U-Q1 |
| S-70 | Delete a route’s last expense | Line removed. Zero settlement record stays. Route still listed in `routeDenominations` | CS-6.5 | OK |
| S-71 | Expense line for a route of an inactive group | Saved. Route becomes visible | CS-4.2 | OK |

### C6. Route denominations

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-72 | Counts for one route that has a record | That route is overwritten. Other routes and all expenses untouched | CS-7.2 | OK |
| S-73 | All-zero counts for a route with no record | Nothing created, token unchanged | CS-7.3 | OK |
| S-74 | Counts equal to stored | No-op | CS-10.5 | OK |
| S-75 | Stored non-zero counts, entry all zero | Overwritten with zeros, counts as a change | CS-7.2 \[I\] | OK |
| S-76 | `sheetId` outside the paper | 400 | CS-7.3 | OK |
| S-77 | Counted total differs from route net cash | Saved, 200. Mismatch blocks only at submission | CS-7.4 | OK |
| S-78 | `denominations: []` | 200 no-op | CS-7.3 | OK |

### C7. Direct collections

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-80 | Non-zero entry for an active employee with no row | Row created | CS-8.2 | OK |
| S-81 | All-zero entry with no row; all-zero entry with a stored row | Nothing created; row removed (counts as a change) | CS-8.4 | OK |
| S-82 | Payload names some employees | Others untouched | CS-8.3 | OK |
| S-83 | Deleted id with no row on this paper; employee both saved and deleted | 400 | CS-8.3 | OK |
| S-84 | Employee id that does not exist | 400 with `details` | CS-8.5 | OK |
| S-85 | Inactive employee, no row, non-zero; inactive employee that already has a row | 400; update allowed | CS-8.5 | OK |
| S-86 | All-zero entry for an inactive or nonexistent employee with no row | CS-8.4 says it creates nothing. CS-8.5 says every id must exist and an inactive employee cannot receive a NEW collection. Today: 400 | CS-8.4 vs 8.5 | D-3, U-Q2 |
| S-87 | Same employee twice | 400 | CS-5.7 | OK |

### C8. Bank deposits

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-90 | Entry without `id`; entry with `id`; id in `deletedDepositIds` | Added; updated; removed | CS-9.2, 9.3 | OK |
| S-91 | Two deposits to the same bank | Allowed | CS-9.2 | OK |
| S-92 | New or changed deposit for an unknown or inactive bank | 400 | CS-9.2 | OK |
| S-93 | All-zero deposit | Stored as sent | CS-9.5 | OK |
| S-94 | Deposit larger than available cash | Saved, 200. Listed in `submission.depositProblems`. Blocks only at submission | CS-9.6 | OK |
| S-95 | Id of another paper; id both saved and deleted; same id twice | 400 | CS-9.3 | OK |
| S-96 | A saved deposit’s bank was deactivated later; another deposit is edited and all rows are sent | Today: 400 “Invalid or inactive bank(s)”. The screen labels such a row “(inactive)” and lets the user try | CS-9.2 vs INV-10 | D-2, U-Q1 |

### C9. Save response and token

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-100 | Any successful save | Body: `success`, `changed`, `cashSettlementUpdatedAt`, `routeSettlements`, `routeExpenses`, `routeDenominations`, `directCollections`, `bankDeposits`, `summary`, `submission`. No `paper`, no `workflow` | CS-11.1 | OK |
| S-101 | Same | Figures reflect the write (rebuilt from stored data after it) | CS-11.1 | OK |
| S-102 | No-op save | `changed: false`, current token, `updated_at` untouched | CS-10.5 | OK |
| S-103 | Changing save when the clock is equal to or behind the stored token | Token still moves strictly forward | CS-10.4 | OK \[O: clock-safe helper\] |
| S-104 | Any successful save | HTTP status. Spec silent. Today 201 | O-1 | D-1, U-Q3 |

### C10. Concurrency, retry, failure

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-110 | Two users save with the same token | One succeeds, the other 409. One write | CS-10.3 | OK |
| S-111 | Double-click Save | One success, one 409 | I-3 | OK |
| S-112 | Response lost, client retries with the old token | 409 although the data was saved. Spec silent (Orders OD-12.9 and Collections CD-9.6 document it) | CS-10 | U-Q7 |
| S-113 | Serialization conflict on all 3 attempts | 409 “Your request conflicted with another update…”, nothing saved | CS-10.6 | SEAM |
| S-114 | Transaction exceeds 10 s | 409 “The request took too long and nothing was saved” | O-4 | SEAM; U-Q7 |
| S-115 | Unexpected exception after the token was advanced | Masked 500 with `requestId`. Token and data rolled back | I-5, CS-10.4 | SEAM |
| S-116 | Any save that fails (400 or 409) | Token unchanged | CS-10.4 | OK |
| S-117 | User A’s no-op save | User B’s open screen token stays valid | CS-10.5 | OK |
| S-118 | A saves one section; B has another section open | B’s next save is 409 (one token) | CS-10.3 | OK |
| S-119 | Paper submit, finalize, reopen or revert | Advances the token; an open screen gets 409. Marking a sheet no-operation does not | CS-10.3, PA-8.11, PA-17.6 | OK |
| S-120 | Collections save creates or changes a `cash_collection`; one that changes only cheque, office, online or bank | Token advanced; not advanced. A Cash Settlement save with the old token is 409 | CD-7.2 | OK; amendment missing, D-6 |
| S-121 | A Collections cash save and a Cash Settlement save race | One winner | PA-11.1 \[I\] | OK |

### C11. Submission and finalization gates (called by Paper)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-130 | Net equals counted within ₹0.005; route with no cash, no expenses, no counts | Passes | CS-12.2 | OK |
| S-131 | Mismatch in either direction | Listed per route: “Route \<name> cash mismatch. Expected \<net>, received \<counted>” | CS-12.2 | OK |
| S-132 | Negative net cash | Blocks (can never match) | CS-12.2 | OK |
| S-133 | Total deposits exceed office cash | “Bank deposits exceed available office cash. Available: x, Deposited: y” | CS-12.3a | OK |
| S-134 | Deposited ₹2000, 500, 200, 100, 50, 20, 10 or coins exceeds route counts plus direct collections | One message per denomination | CS-12.3b | OK (wording, O-11) |
| S-135 | Several problems at once | One 400 `{ message: “Cash settlement is not ready for submission”, details[] }` with every problem | CS-12.1 | OK |
| S-136 | Route of an inactive group with no money | Same route set in screen, totals and gate | CS-4.2 | OK |
| S-137 | Paper morning submit with a cash problem | Blocked, listed together with other modules. Readiness reports the same | PA-7.2, PA-19.3 | OK |
| S-138 | Re-finalize of a REOPENED paper with a route mismatch or excess deposits | Not blocked. “Cash settlement: …” warnings in the response and the finalize audit entry | PA-8.3, 8.9 | OK |
| S-139 | Finalize of a MORNING\_SUBMITTED paper | No cash check | PA-8.6 \[I\] | OK |
| S-140 | Cheque, online, office cash or night collections exist | Never part of the bankable pool | CS-12.3, CD-7.1 | OK |
| S-141 | A route still mismatches | Check (a) uses book net cash, check (b) uses counted notes, so they can disagree until every route reconciles | CS-12.3 | OK (documented) |

### C12. Frontend contract (CS-18)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-150 | Any save | Token from the last load is sent. After the save the token is replaced from the response | CS-18.1, 18.2 | OK (O-12) |
| S-151 | Any load or save | `submission` is shown with every problem, ready or not | CS-18.3, 16.10 | OK |
| S-152 | Edit, add, remove lines | Existing line sends `id`; new line none; removal goes into the delete list (expense id, employee id, deposit id) | CS-18.4 | OK |
| S-153 | Any save entry | All eight denomination fields sent | CS-18.5 | OK |
| S-154 | 409; 400 with `details` | Reload; list shown | CS-18.6 | OK \[I: `extractErrorMessage` not provided\] |
| S-155 | Any status | Sections enabled only by `workflow.permissions` | CS-18.7 | OK |
| S-156 | User types in section B, then saves section A | Spec silent. Today: B’s typed edits and delete lists are discarded | O-13 | D-4, U-Q5 |
| S-157 | Focus or reconnect while edits are unsaved and another user changed the data | Spec silent (Orders OD-12.10 and Collections CD-8.5 forbid refetch under edits). Today: refetch replaces token and drafts together | O-14, O-17 | D-5, U-Q6 |
| S-158 | Save fails with the timeout 409 | Spec silent (Orders keeps the edits). Today: edits cleared, sheet reloaded | O-14 | D-5, U-Q5 |
| S-159 | Row shows “(inactive)” type or bank | The screen invites a save the server rejects | O-5 | D-2 |

---

## D. Discrepancies and Gaps

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Sibling modules differ, spec silent | The four saves answer 201 (no `@HttpCode`). Orders and Collections pin 200 (CD-11.1). CS-13 lists no success status | Low to Medium |
| D-2 | Spec conflict, data-stranding risk | CS-6.4 and CS-9.2 say every expense type and bank must be active. The code applies that to EVERY sent line, including unchanged saved ones, and the screen sends every row of a section. After an admin deactivates an expense type or bank, a paper that holds a line of it cannot save any other change in that section until the line is deleted or changed. On a REOPENED paper this blocks corrections to old data. The screen even labels such a row “(inactive)”. The historical-record principle is applied elsewhere: employees (CS-8.5), clients (CD-6.2, CD-3.3), products (OD-6.5b). INV-10 (CS-4.2) states it for routes | Medium to High |
| D-3 | Spec conflict | CS-8.4: an all-zero entry with no stored row creates nothing. CS-8.5: every employee id must exist, and an inactive employee cannot receive a NEW collection. The code validates all entries first, so an all-zero entry for a nonexistent or inactive employee is 400. Collections resolved the same conflict the other way (CD-2.2) | Low |
| D-4 | Frontend data loss | Any change of the query data resets all section drafts and delete lists. A successful save of one section replaces the cached view, so typed edits and removals in the other sections vanish without notice. CS-18 is silent. Collections records the same behavior as open (CD-14.10) | Medium |
| D-5 | Frontend, spec gap (partly unverified) | CS-18 sets no refetch policy. The query keeps focus and reconnect refetch on, and any 409 (including “took too long, nothing was saved”) invalidates and reloads. A changed payload replaces token and drafts together, so a stale save cannot slip through (unlike the Orders D-2 risk), but unsaved edits are lost silently. Orders and Collections forbid refetch under unsaved edits and keep edits on the timeout 409 (OD-12.10, CD-8.5). Whether a no-change refetch resets drafts depends on React Query structural sharing (I-7) | Medium |
| D-6 | Documentation gap | CD-7.3 says CS-10.3 must add “a Collections save that changes a `cash_collection` amount also advances it”. The CS file does not have it. The coupling (and the Distributor Transfer side effect, PA-8.11) is also absent from the dependency register | Medium (docs) |
| D-7 | Spec gap | No decision on per-paper or per-role scoping for Cash Settlement. Orders, Collections and Paper each record “no scoping” explicitly. This module holds cash counts, deposits and expenses | Medium |
| D-8 | Spec gap | CS does not state: transaction timeout response (code gives 409), lost-response retry (code gives 409), token format (any parseable ISO-8601, mismatch 409), success status. All are documented in the sibling decision files | Low |
| D-9 | Documentation inconsistency, dead code | CS-12.5 body still says finalizing a REOPENED paper “requires” every route to reconcile; the amendment note in the same item says Paper no longer calls it. `validateReconciliationOnFinalize` and other helpers are unused (O-10) | Low |
| D-10 | Cannot be reached through the API | S-113, S-114 and S-115 need an injected fault (serialization failure, timeout, unexpected exception) | Info |
| D-11 | Unverified | The GET does not use a repeatable-read snapshot (O-9). With a single joined query this is harmless; if the ORM loads relations in several queries, the token (read first) can be older than the rows, which only causes a safe 409 | Low |
| D-12 | Spec gap | After a re-finalize the status is FINALIZED, so the summary reverts to the normal shape and `reconciliationDifference` disappears (CS-3.5 says every status except REOPENED). The `submission` block still lists mismatches | Low |
| D-13 | Consistency | `id` and `deleted...Ids` lack the `@Max(2147483647)` used on every other id. No overflow is reachable because in-memory checks run first (O-7) | Info |
| D-14 | Wording | Duplicates inside `deleted...Ids` give the generic class-validator text, not a CS message (O-8). The coin deficit message says “count” (O-11) | Info |
| D-15 | Unverified | Reports, `extractErrorMessage`, `@/shared/api/error`, `@/shared/api/http` and the masters hooks were not provided, so use of the removed columns, the display of `details[]` and the active-only master lists are unchecked | Medium (unverified) |

**Scenarios the current implementation appears unable to satisfy, or cannot be asserted**

- **S-69, S-96:** fail whenever the historical-record principle is applied to expense types and banks (D-2, Q1).
- **S-86:** which rule wins is undecided (D-3, Q2).
- **S-104:** no expected status exists; any choice is an assumption (D-1, Q3).
- **S-112:** a lost-response retry cannot succeed safely; no decision recorded (Q7).
- **S-156, S-157, S-158:** no expected behavior is specified; today’s behavior loses edits (D-4, D-5).
- **S-113, S-114, S-115:** need injected faults (D-10).

---

## E. Open Questions (decisions needed)

Each question names the owner and the finding it settles. “(current)” marks what the code does today. No answer is recommended.

**Q1 (Product + Eng, D-2). Saved lines whose expense type or bank was deactivated later.**

- A. Reject the whole save until the line is removed or changed (current, literal CS-6.4 and CS-9.2).
- B. Unchanged saved lines keep working. The active check applies only to new lines and to lines whose type or bank is changed (as CS-8.5, CD-6.2, OD-6.5b).
- C. Other.

**Q2 (Product, D-3). All-zero direct-collection entry for a nonexistent or inactive employee with no stored row.**

- A. 400 (current).
- B. Ignore it before any employee rule, as Collections CD-2.2 and Orders OD-6.5(d).
- C. Other.

**Q3 (Eng, D-1). Success status of the four saves.**

- A. 201 (current).
- B. 200, as Orders and Collections.
- C. Not important.

**Q4 (Product, D-7). Who may read and edit which paper?**

- A. Any employee, any paper (current).
- B. Only employees assigned to the paper’s routes.
- C. Reads open, writes scoped.
- D. Other.

**Q5 (Product + Eng, D-4, D-5). Edit handling on the screen.**

- A. Keep as is: every successful save clears all edits, any 409 reloads and clears (current).
- B. A save clears only the edits of the section that was saved.
- C. As B, and the timeout 409 keeps the edits (as Orders OD-12.10).
- D. Other.

**Q6 (Eng, D-5). Refetch policy of the screen query.**

- A. No automatic refetch on focus or reconnect (as OD-12.10, CD-8.5).
- B. Allow refetch, but adopt new data only when no unsaved edits exist.
- C. Keep current behavior (default React Query).

**Q7 (Eng, D-8). Undocumented behavior: timeout 409, lost-response retry 409, token format.**

- A. Document current behavior as binding, as the sibling files do.
- B. Change one of them (state which).
- C. Not important.

**Q8 (Product + Eng, D-6). Collections and Cash Settlement share a token.**

- A. Apply the CD-7.3 sentence to CS-10.3.
- B. A, and add the coupling to the dependency register.
- C. Other.

**Q9 (Product, D-12). Summary of a re-finalized paper.**

- A. Normal summary, no reconciliation difference (current, CS-3.5).
- B. Keep the reopened-style difference visible when the paper was reopened.
- C. Other.

**Q10 (Product, CS-16.1). Real caps** for note counts (100,000), coins (100,000) and expense amount (10,000,000). Still placeholders.

**Q11 (Eng, D-15). Provide the missing files** (`@/shared/api/error`, `@/shared/api/http`, `paper/utils/error`, the masters hooks, Reports) so D-15 can be closed.

**Carried over, not re-asked.** CS Section 15 records S12 (negative net cash at save), S14 (repeated expense types), S16 (decimal rounding), S20 (403 and 422), S21 (adjustment after reopen), S35 and S36 as decided “not applied”, and S22 to S24 as possibly missing. They stay as current behavior in this document.

---

## F. Revision After Decisions (Q1 to Q11)

The business owner answered all eleven questions. Where the answer was “do what is logically best”, the choice is stated and is easy to reverse. The decisions are recorded in `CASH_SETTLEMENT_BUSINESS_DECISION.md` (new Section 19, “DQ1 to DQ11”). Code changes are implemented but not yet compiled or run. Sections D and E above show the state before the decisions.

**Correction to the evidence list.** `@/shared/api/error`, `@/shared/api/http` and `paper/utils/error` were in the supplied files and are now reviewed (S-154 verified: a 409 shows the server `message`, and `details[]` are appended as “• …” lines). Still not provided: the masters hooks and the Reports module.

### F1. Decision log

| Q | Decision | Effect | Spec reference |
| --- | --- | --- | --- |
| Q1 | Saved lines keep working after their expense type or bank is deactivated. The active check applies only to new lines and to lines whose type or bank changes (logical best) | Code changed | CS-6.4, CS-9.2 |
| Q2 | An all-zero direct-collection entry with no stored row is ignored before any employee rule (logical best) | Code changed | CS-8.4, CS-8.5 |
| Q3 | Saves answer 200 | Code changed | CS-11.2, CS-13 |
| Q4 | Any employee, any paper | Documented | CS-1.3 |
| Q5 | As Orders: the timeout 409 keeps the edits; a 409 that means the data changed reloads and clears. A save resets only its own section (my reading of the answer, easy to reverse) | UI changed | CS-18.6, CS-18.8 |
| Q6 | No automatic refetch on focus or reconnect | UI changed | CS-18.9 |
| Q7 | Timeout 409, lost-response 409 and token format documented as binding (logical best) | Documented | CS-10.7 to CS-10.9 |
| Q8 | CS-10.3 carries the Collections amendment. The coupling is not added to the dependency register, which lists only cross-module propagation dispatched through the orchestrator (logical best) | Documented | CS-10.3, CD-7.3 |
| Q9 | Normal summary after a re-finalize; the `submission` block still lists mismatches (logical best) | Documented | CS-3.5 |
| Q10 | Placeholder caps stay | none | CS-16.1 |
| Q11 | Files supplied and checked (see correction above) | Evidence updated | D-15 |

### F2. Discrepancy status

| ID | Status | Note |
| --- | --- | --- |
| D-1 | Resolved | 200 on all four saves |
| D-2 | Resolved | Unchanged saved lines are no longer blocked by a deactivated type or bank |
| D-3 | Resolved | All-zero entries with no row are ignored first |
| D-4 | Resolved | A save resets only its own section (assumption, Q5) |
| D-5 | Resolved | No focus or reconnect refetch; timeout 409 keeps edits; other 409 reloads and clears; 400 keeps edits |
| D-6 | Resolved | CS-10.3 and CD-7.3 updated; the dependency register is intentionally unchanged |
| D-7 | Resolved | CS-1.3 |
| D-8 | Resolved | CS-10.7 to CS-10.9, CS-11.2 |
| D-9 | Resolved (docs) | CS-12.5 marked superseded. The unused code (O-10) stays, as reported only |
| D-10 | Unchanged | Still needs injected faults |
| D-11 | Unchanged | Unverified, low |
| D-12 | Accepted | Documented in CS-3.5 |
| D-13, D-14 | Unchanged | Info |
| D-15 | Partly resolved | Shared frontend files checked. Masters hooks and Reports still not provided |

### F3. New and changed scenarios

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-69, S-96 | Saved line or deposit whose type or bank was deactivated; any other edit in the same section | 200. The unchanged line is not checked and keeps saving, amount changes included | CS-6.4, CS-9.2 | Implemented, not yet run |
| S-160 | Change a saved line to an inactive expense type, or a saved deposit to an inactive bank | 400. The active check applies to a changed type or bank | CS-6.4, CS-9.2 | Implemented, not yet run |
| S-161 | New line with an inactive expense type, or new deposit with an inactive bank | 400 | CS-6.4, CS-9.2 | Implemented, not yet run |
| S-86 | All-zero entry for a nonexistent or inactive employee with no stored row | 200, `changed: false`, token unchanged, no employee rule applied. A non-zero entry for the same employee is still 400 | CS-8.4, CS-8.5 | Implemented, not yet run |
| S-104 | Any successful save | HTTP 200 on all four | CS-11.2 | Implemented, not yet run |
| S-156 | Edits in sections A and B; save A | A is reset from the response. B’s edits and delete lists stay | CS-18.8 | Implemented, not yet run |
| S-157 | Window focus or reconnect with unsaved edits | No refetch; token and drafts unchanged | CS-18.9 | Implemented, not yet run |
| S-158 | Save fails with the timeout 409 | Toast shown; edits kept; screen not reloaded | CS-18.6 | Implemented, not yet run |
| S-162 | Save fails with a stale-token 409 or an exhausted-retry 409 | Edits cleared; screen reloaded with the new token | CS-18.6 | Implemented, not yet run |
| S-163 | Save fails with 400 | Toast with `details`; edits kept | CS-18.6 | OK \[O\] |
| S-164 | A refetch (Refresh button) returns data carrying the token of the last own save | Drafts are not reset. Data with a different token resets all drafts | CS-18.8 | Implemented, not yet run |
| S-112, S-114, S-33 | Lost-response retry, transaction timeout, date-only token | 409 in each case; now documented | CS-10.7 to CS-10.9 | OK (documented) |
| S-120 | Collections cash save, then a Cash Settlement save with the old token | 409; now documented in CS-10.3 | CS-10.3, CD-7.2 | OK |
| S-07 | Any employee edits any paper | Allowed, now a decision | CS-1.3 | OK |

### F4. Still open

- **Not run:** no code change has been compiled or tested, and no Cash Settlement tests exist yet. The Orders and Collections specs are not affected by these changes.
- **Q5 assumption:** the per-section reset after a save is my reading of “as Orders”. If a single reload-and-clear after every save is wanted, remove the `onSaved` branch in `CashSettlementPage.tsx`.
- **Second observer of the sheet query:** confirm nothing else mounts `["cash-settlement","paper",id]`, which would refetch on mount and swap the token under edits (needs a code search).
- **Masters hooks and Reports** were not provided (D-15).
- **Caps** (CS-16.1) stay placeholders.
- **Dead code** (O-10) is still in the module, reported and not deleted.
- **Next step, when you ask for it:** automated tests for the scenarios above, using the Orders and Collections harnesses as the model.
