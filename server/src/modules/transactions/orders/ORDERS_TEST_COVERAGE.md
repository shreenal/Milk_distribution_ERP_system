# Orders module: scenario-to-test coverage map

**Status: written, syntax-checked, NOT executed.** I had no repository, database or Redis in this session, so no test has been run. Everything below about "expected failures" comes from reading the code in the project, not from a test run.

Sources of truth: `Orders Module Behavioral Specification Discovery (1).md` (matrix sections C and F3) and `ORDERS_BUSINESS_DECISION.md`. The implementation was read only to learn how to drive it.

## Files

| File | Scenarios | Tests |
| --- | --- | --- |
| `test/helper/orders-harness.ts` | shared setup (own master data, app bootstrap, helpers) | - |
| `orders.scenario.access.spec.ts` | S-01 to S-06 | 6 |
| `orders.scenario.reads.spec.ts` | S-10 to S-24 | 15 |
| `orders.scenario.night-save.spec.ts` | S-30 to S-48, S-50 to S-73, S-147 | 48 (+4 table rows for S-60 to S-62) |
| `orders.scenario.morning-save.spec.ts` | S-80 to S-97, S-142, S-143 | 22 |
| `orders.scenario.products.spec.ts` | S-100 to S-110 | 14 (S-109 has 3) |
| `orders.scenario.concurrency.spec.ts` | S-120 to S-123, S-125 to S-127 | 7 |
| `orders.scenario.gates.spec.ts` | S-130 to S-134 | 5 |

Every test title starts with its scenario ID (sub-cases are `a`/`b`/`c`), so `vitest -t "S-69"` runs one scenario.
Place the specs in `src/modules/transactions/orders/` and the harness in `test/helper/`.

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| S-01 | access: S-01 | all 7 endpoints x (no token, garbage, expired) |
| S-02 | access: S-02 | |
| S-03 | access: S-03 | |
| S-04 | access: S-04 | uses the real per-user throttle guard |
| S-05 | access: S-05 | |
| S-06 | access: S-06 | |
| S-10 to S-24 | reads: same IDs | |
| S-30 to S-48 | night-save: same IDs | S-40 asserts only the 400, per OD-5.3 |
| S-50 | S-50 | |
| S-51 | S-51a, b, c | |
| S-52 | S-52a, b, c | |
| S-53 | S-53 | **seam**: calls `OrderCommercialService.resolveBatch` directly (not API-reachable, O-12) |
| S-54 | S-54 | |
| S-55 | S-55a, b, c | warning text checked against `order-commercial.service.ts` |
| S-56 | S-56a, b, c | |
| S-57, S-147 | one test | |
| S-58 to S-73 | same IDs | S-60 to S-62 are one table-driven test |
| S-80 to S-90 | morning-save: same IDs | S-82 and S-88 split into a/b |
| S-81 | S-81 | asserts the log line through a Logger spy; spec marks it N/A through the API |
| S-84 | S-84 | **seam**: a second writer is simulated by a repository spy |
| S-91 | S-91 | matrix row amended (option A): line already at delivered 0, no live rate, 0 again gives 400 |
| S-92 to S-96 | same IDs | S-96 split into a (outbox, trays) and b (409 from a later sheet) |
| S-97, S-143 | one test | |
| S-142 | S-142 | |
| S-100 to S-110 | products: same IDs | S-102 a/b, S-109 three tests |
| S-120 to S-123 | concurrency: same IDs | S-120 uses real parallel requests |
| S-125 | S-125 | **seam**: a P2028 error is injected; the real 10 s timeout is not exercised |
| S-126 | S-126 | **seam**: billing step made to throw after the token was touched |
| S-127 | S-127 | **seam**: race simulated so the second unique key (sheet, client, product) is hit |
| S-130 to S-133 | gates: same IDs | call `OrdersValidationService` directly (not Orders endpoints) |
| S-134 | S-134 | **seam**: negative delivered written straight to the DB |

## Not implemented

| Scenario | Reason |
| --- | --- |
| S-124 (save races Paper night-submit) | Needs a real night-submit to succeed, which depends on Paper preconditions I could not see (readiness, vehicle allocation and so on). A guess would make the test fail for reasons unrelated to Orders. Left out for now at your request. |
| Paper-level parts of S-131 and S-132 (no-operation / inactive-group exemption, PA-6.5, PA-7.5) | Owned by the Paper module. Only the Orders gate is covered. |

## Failing tests and implementation discrepancies

These are predictions from the code. Run the suite and treat this as the list to check first.

### Resolved after the first run (119 of 122 passed)

- **DISC-1 (201 vs 200):** real. The save endpoints returned 201; adding `@HttpCode(200)` fixed it. No open item.
- **AMB-1 (S-91):** resolved with option A. The S-91 row is amended to "morning-created line already at delivered 0, no live rate, delivered set to 0 again gives 400". The literal test is removed and the former S-91b is now S-91. **Please update the S-91 row in the spec to match.**
- **S-51a, S-51c:** were a test defect (a `JSON.stringify` on a string escaped the quotes). Fixed.

### Marked "implemented, not yet run" in the spec (highest risk of real failures)

S-57 / S-147 (tie-break), S-97 / S-143 and S-142 (pricing after a morning save). Written exactly to the spec; read the result carefully.

### Assumptions I made

1. **Own master data.** Each spec creates its own brands, products, distributors, clients, rates and tray rules (prefix `T-`), and deletes them afterwards. Papers use sale dates from 2091 onwards. A crashed run is cleaned up on the next run.
2. **No Redis.** The queue, the outbox relay and the queue processor are stubbed. Outbox rows are still written and stay PENDING.
3. **Amounts.** Rate 56 per L, 12 L per crate, 0% GST unless a test says otherwise.
4. **The harness mirrors your `main.ts`** (global prefix `api`, validation pipe with whitelist, the exception filter, request id), but not helmet, CORS or Swagger.
5. **S-04 and the throttle** run in their own app instance with the real `UserThrottlerGuard`; all other specs run without it.
6. **S-124 is not simulated** (see above).
7. **Nothing in production code or in the approved expected results was changed.**

### Things to double check when you first run

- `test/helper/db.ts` must still point `testPrisma` at `milk_distribution_test`; the harness imports it.
- If a unique-name or unique-code collision shows up, the cause is leftover `T-` rows from a crashed run.


## Frontend scenarios (added)

Files: `orders-ui.harness.tsx` and `orders.scenario.ui.spec.tsx` (run from `src/features/paper/modules/sheet-level/orders/test`; the first 13 passed).
Not run yet. The page is rendered with its real hooks, real `OrdersGrid` and a real `QueryClient`. Replaced: `ordersApi`, the toast, the paper context, and `ag-grid-react` (a stub that evaluates the real column definitions, so the editable-cell logic is genuine).

| Scenario | Test(s) | Note |
| --- | --- | --- |
| S-140 | 3 tests | already-on-sheet products hidden; hidden again after Add (and Add sends the current token); no selector outside DRAFT |
| S-141 | 5 tests | REOPENED: line (even 0) editable, no-line not editable; pinned total row never editable; DRAFT and NIGHT_SUBMITTED keep no-line cells editable; non-editable sheet has no editable cell |
| S-144 | 1 test | timeout 409: toast shown, no reload, edit kept, retry sends the same token |
| S-145 | 3 tests (stale, unique-key race, exhausted retry) | edits cleared, sheet reloaded, next save carries the new token |
| S-146 | 1 test | focus and reconnect events with unsaved edits: no refetch. Includes a control query on the same client that DOES refetch, so the test proves the events fire |

Assumptions and limits:
1. `OrdersPage` is imported from `../pages/OrdersPage`. Change that one import if the folder differs.
2. Needs `jsdom` and `@testing-library/react` installed in the frontend. Each file sets its own jsdom environment, so no config change is needed. The `@` path alias must work in vitest.
3. `@/shared/api/error` (not provided) is used for real. The tests give it a real `AxiosError` shaped like the backend body; if it reads errors differently, S-144 and S-145 will show it.
4. S-146 proves the hook's own options (focus and reconnect off). App `QueryClient` reviewed (no `refetchInterval`, default `staleTime` 0, mutations do not retry): interval refetch is not a risk. Remaining residual: a SECOND mounted observer of the same `['orders','sheet',id]` key would refetch on mount and swap the token under unsaved edits. Check with a search for other users of `useOrders` / that key.
5. A 409 that is not one of the three reload messages (for example the tray-return conflict with `details`) is not covered: the matrix does not state the UI behavior for it.