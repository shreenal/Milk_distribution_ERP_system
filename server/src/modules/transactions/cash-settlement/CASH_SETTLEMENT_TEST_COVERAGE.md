# Cash Settlement module: scenario-to-test coverage map

**Status: first run done, two test defects found and fixed; re-run needed.**
- Backend (`npx vitest run src/modules/transactions/cash-settlement`): 160 of 161 passed on the first run. The one failure was S-121 (test expectation, fixed).
- Frontend (`npx vitest run src/features/paper/modules/paper-level/cash-settlement/`): 13 of 14 passed on the first run. The one failure was S-152 (test defect, fixed; S-152b added).
- Both fixes are in the delivered files and have not been re-run. Expected after the fix: backend 162 of 162, frontend 15 of 15.
- No implementation defect was found. No production code and no approved expected result was changed.

Sources of truth: `Cash Settlement Module Behavioral Specification Discovery.md` (sections C and F3) and `CASH_SETTLEMENT_BUSINESS_DECISION.md`. The implementation was read only to learn how to drive it. No production code and no approved expected result was changed.

## Files

| File | Scenarios | Tests |
| --- | --- | --- |
| `test/helper/cash-settlement-harness.ts` | shared setup (`ctx.cs`: scene, API, DB seeds, gate, fault-seam repo) | - |
| `cash-settlement.scenario.access.spec.ts` | S-01 to S-08 | 7 (incl. the throttle app) |
| `cash-settlement.scenario.reads.spec.ts` | S-10 to S-27 | 21 |
| `cash-settlement.scenario.validation.spec.ts` | S-30 to S-45 | 43 |
| `cash-settlement.scenario.workflow.spec.ts` | S-50 to S-52, S-54, S-55 | 22 |
| `cash-settlement.scenario.expenses.spec.ts` | S-60 to S-71, S-160, S-161 | 14 |
| `cash-settlement.scenario.denominations.spec.ts` | S-72 to S-78 | 7 |
| `cash-settlement.scenario.direct.spec.ts` | S-80 to S-87 | 9 |
| `cash-settlement.scenario.deposits.spec.ts` | S-90 to S-96 | 7 |
| `cash-settlement.scenario.concurrency.spec.ts` | S-100 to S-104, S-110 to S-121 (+ S-121b) | 20 |
| `cash-settlement.scenario.gates.spec.ts` | S-130 to S-141 | 12 |
| `frontend/.../cash-settlement-ui.harness.tsx`, `cash-settlement.scenario.ui.spec.tsx` | S-150 to S-158, S-162 to S-164 (+ S-152b) | 15 |

Backend total: 162 tests (10 files). Frontend: 15 tests (1 file).

Placement: backend specs in `src/modules/transactions/cash-settlement/`, harness in `test/helper/`, UI files in `src/features/paper/modules/paper-level/cash-settlement/test/` (adjust the two relative imports if the folder differs). Every test title starts with its scenario ID, so `vitest -t "S-69"` runs one scenario. Run: `npx vitest run src/modules/transactions/cash-settlement/`.

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| S-01 | access: S-01 | read + 4 saves x (none, garbage, expired) |
| S-02, S-03 | access: S-02 / S-03 | |
| S-04 | access: S-04 | |
| S-05 | access: throttle | own app with the real `UserThrottlerGuard`; also checks per-endpoint bucket and other user |
| S-06 | access: S-06 | body-level and entry-level unknown fields |
| S-07 | access: S-07 | second employee, own and another paper |
| S-08 | access: S-08 | `007` read as 7 |
| S-10 to S-16, S-20 | reads: same IDs | |
| S-17 | reads: S-17 (x4 statuses) | normal summary shape |
| S-18, S-19 | reads: same IDs | REOPENED / FINALIZED summary (DQ9) |
| S-21 to S-23 | reads: same IDs | inactive-group visibility rule |
| S-24 to S-27 | reads: same IDs | |
| S-30 to S-34 | validation: same IDs | each x 4 sections |
| S-35, S-36 | validation: S-35 / S-36 (x3 sections), S-36b | S-36b: 10.005 stored as 10.01 |
| S-37, S-38 | validation: same IDs | S-38 sends 1000 and 1001 expense lines |
| S-39 | validation: S-39 | every one of the eight fields removed in turn |
| S-40, S-41, S-42 | validation: same IDs | |
| S-43 to S-45 | validation: same IDs | |
| S-50, S-51, S-52, S-55 | workflow: status x section matrix | one generic message, names neither status nor section |
| S-54 | workflow: S-54 | uses `POST /papers/:id/revert-morning` |
| S-53 | not implemented | blocker, see below |
| S-60 to S-68, S-70, S-71 | expenses: same IDs | |
| S-69, S-160, S-161 | expenses: same IDs | DQ1 behaviour |
| S-72 to S-78 | denominations: same IDs | |
| S-80 to S-87 | direct: same IDs | S-86 per DQ2, S-83b extra |
| S-90 to S-96 | deposits: same IDs | S-96 per DQ1 |
| S-100, S-104 | concurrency: S-100 / S-104 (x4 sections) | HTTP 200 and body keys |
| S-101 to S-103 | concurrency: same IDs | S-103 sets `updated_at` ahead of the clock |
| S-110, S-111 | concurrency: same IDs | real parallel requests |
| S-112 | concurrency: S-112 | |
| S-113, S-114, S-115 | concurrency: same IDs | **fault seams**: spy on `CashSettlementRepository` (P2034 x3, P2028, thrown Error). The real 10 s timeout is not exercised |
| S-116 to S-118 | concurrency: same IDs | |
| S-119 | concurrency: S-119 | revert and reopen advance the token, no-operation does not. Submit and finalize not driven (see below) |
| S-120 | concurrency: S-120 | uses the Collections API (CD-7.2) |
| S-121, S-121b | concurrency: S-121 (real race), S-121b (deterministic order) | **amended after the first run**: Collections never sends a Cash Settlement token, so the race has two valid outcomes. See "Results of the first run" |
| S-130 to S-136, S-140, S-141 | gates: same IDs | call `CashSettlementValidationService` directly |
| S-137 to S-139 | gates: same IDs | through `GET /papers/:id/readiness` |
| S-150, S-151, S-153 | ui: same IDs | |
| S-152, S-152b | ui: S-152, S-152b | S-152 gives the new line a valid amount; S-152b pins the client-side refusal of a 0 amount (CS-5.4) |
| S-154, S-162 | ui: stale and exhausted (it.each) | |
| S-155 | ui: S-155 / S-155b | |
| S-156, S-157, S-158, S-163, S-164 | ui: same IDs | |

## Not implemented (blockers, not guesses)

| Scenario | Reason |
| --- | --- |
| S-53 (a save races a Paper submit) | A real submit needs Paper preconditions (readiness of every module, vehicle allocation, purchases, dairy trays). Same blocker as Orders S-124 and Collections S-58. A guess would fail for reasons unrelated to Cash Settlement. |
| Paper submit / finalize in S-119 | Same reason. Revert, reopen and no-operation are covered; submit and finalize advancing `updated_at` is PA-8.11 and belongs to the Paper tests. |
| S-113 to S-115 against the real engine | Not reachable through the API. They run as seams. |
| S-12 for `ADMIN` | Role does not change the payload, only S-03 covers it. |

(S-120 and S-121 are implemented: the Cash Settlement API was provided, so the earlier Collections blocker S-100 / S-120 / S-121 does not apply here.)

## Assumptions

1. Specs build their own master data (prefix `T-`) through the harness, as the Orders and Collections specs do. Papers use 2091+ sale dates and are removed after every test; expense types, banks and employees are removed by `ctx.cs.cleanup()`.
2. No Redis: queue, relay and processor are stubbed by orders-harness.
3. Route cash is seeded straight into `client_collection.cash_collection`; settlements, expenses, direct collections and deposits are seeded either through the API (`cs.seed`) or straight into the DB (`seedSettlement`, `seedExpense`, ...), depending on whether the scenario is about the write path.
4. Paper status is set directly with `ctx.setStatus` (as the Orders specs do). Tokens are always read fresh from the DB afterwards because the status update moves `updated_at`.
5. Messages are copied from the approved decision file (CS-2.3, CS-4.5, CS-10, CS-12). Only where the spec gives no literal text (the duplicate messages) the test asserts a stable fragment.
6. `PaperModule` and `CollectionsModule` are mounted next to `CashSettlementModule` (readiness, revert, reopen, no-operation, Collections saves).
7. UI: needs `jsdom` and `@testing-library/react`, the `@` alias in vitest, `CashSettlementPage` at `../pages/CashSettlementPage`. The three masters hooks (not provided) are mocked at the paths the page imports. The Select components are not interacted with. `@/shared/api/error` and `@/features/paper/utils/error` are used for real and must print `details[]` as "• ..." lines (they do, per the supplied `error.ts`).
8. S-103 writes `order_paper.updated_at` ahead of the clock through Prisma. This assumes Prisma keeps an explicitly supplied `@updatedAt` value.

## Failing tests and implementation discrepancies

### Results of the first run

| Result | Count |
| --- | --- |
| Backend passed | 160 of 161 |
| Backend failed | 1 (S-121) |
| Frontend passed | 13 of 14 |
| Frontend failed | 1 (S-152) |
| Implementation defects | 0 |

Both failures were defects in my tests, not in the implementation:

1. **S-121 (backend): wrong expectation, fixed.** The test expected one 200 and one 409. That came from the discovery matrix row, which cited PA-11.1 as an *inference* [I], and the inference was wrong. Collections does not send or compare a Cash Settlement token. Inside its own transaction it advances whatever `order_paper.updated_at` is current (CD-7.2, `touchOrderPaperIfTokenMatches(paperId, sheet.order_paper.updated_at, tx)`). So in a real race there are two valid outcomes:
   - Collections commits first: the Cash Settlement save (old token) is 409 and writes nothing. The 409 side is already pinned deterministically by S-120.
   - Cash Settlement commits first: both saves are 200, because Collections is not stale against a token it never sent. This is exactly what the run showed (`[200, 200]`).

   The decision files are consistent with this (CD-7.2 only says a changed cash amount "also advances" the token, and CS-10.3 only says an open Cash Settlement screen gets 409 on its next save). No decision changes. The test now asserts the invariant that must hold in either order: Collections is always 200, the Cash Settlement save is 200 or 409, a 409 wrote nothing, the token moved forward, and the route cash is the saved 100. S-121b pins the "Cash Settlement first, then Collections, both 200" order deterministically. The discovery matrix row is corrected in `CASH_SETTLEMENT_DISCOVERY_AMENDMENT.md`.
2. **S-152 (frontend): test defect, fixed.** The test added a new expense line and pressed Save without typing an amount. The page starts a new line at 0 and refuses to send an expense below 0.01 (`handleSaveExpenses`), which is the correct client-side mirror of CS-5.4 (zero is rejected), so no request was made. The test now types a valid amount into the new line. S-152b was added to pin the refusal itself ("Invalid expense" toast, nothing sent).

### Pre-run watch list (kept for the record)

All items below were on the list before the run. Items 1, 3, 4, 5, 6 and 7 passed. Item 2 turned out to be a wrong expectation for S-121 only (see above); S-110 and S-111 passed as written.

1. **S-36b (10.005 stored as 10.01).** Depends on how Postgres rounds the value sent by the driver adapter. If it truncates or rounds half-even the test fails. The decision file states 10.01 (CS-5.5).
2. **S-110, S-111 (parallel requests on the same token).** Written to the spec ("one 200, one 409") and passed. S-121 was on this item too, but its expectation was wrong: Collections and Cash Settlement do not share a compare-and-fail token, so `[200, 200]` is a valid outcome (see "Results of the first run").
3. **S-137 (`problems.length > 1`).** Assumes the other modules also report a problem on the bare scene (sheets without order lines). If that gate ever stops reporting it, relax only that second assertion.
4. **S-120 / S-121 (Collections coupling).** Use the real Collections endpoint with the sheet's current token. They depend on the Collections client being active and authorized in the sheet's group, which `world.addClient` provides.
5. **S-23 / S-22 (hidden routes).** Rely on `master_group.is_active` being the only filter (CS-4.2a).
6. **UI S-152 / S-156 / S-164.** Rely on the input ids the page builds (`route-<sheetId>-<field>`, `expense-expense-<id>`) and on accessible names of the delete / refresh buttons. If a component library wrapper changes them, adjust the selectors, not the assertions.
7. **S-155b.** Assumes `DenominationFields` receives `disabled` from the permission flag, as in the supplied code.

Observations only (nothing to fix): dead code listed in the discovery (O-10: `validateReconciliationOnFinalize`, `RECONCILIATION_MISMATCH`, `NOT_RECONCILED_AFTER_REOPEN`, `getRouteCashFromCollections`, `getRouteExpenseTotalFromExpenses`) is not covered by any test, deliberately. The coin deposit message still says "count" (O-11); S-134 asserts the text as written.

## Still open from the spec (not testable here)

- Second observer of the query key `["cash-settlement","paper",id]` (would refetch on mount and swap the token): needs a code search, not a test.
- Reports module and the masters hooks were not provided (D-15).
- CS-16.1: the caps (100,000 notes, 100,000 coins, 10,000,000 expense) are placeholders; S-35, S-36 and S-37 assert the placeholder numbers.