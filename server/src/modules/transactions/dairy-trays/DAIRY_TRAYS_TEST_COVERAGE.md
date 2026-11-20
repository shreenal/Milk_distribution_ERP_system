# Dairy Trays module: scenario-to-test coverage map

Sources of truth: `Dairy Trays Module Behavioral Specification Discovery.md` (matrix C, sections F4 and F5 supersede C where they differ) and `DAIRY_TRAYS_BUSINESS_DECISION.md` (DT-n). The implementation was read only to learn how to drive it. Nothing in production code or in the approved expected results was changed.

## Status

| Part | State |
| --- | --- |
| Backend specs (8 files) and helper | **First run (yours): 132 passed, 15 failed, 1 todo (148 tests, 8 files).** All 15 failures were test defects, not implementation defects (see "History"). The fixed tests have not been re-run since the fix. |
| Frontend: `dairy-trays.scenario.ui.spec.tsx` and its harness (DY-130 to DY-143, DY-156 to DY-160) | **First run (yours): 21 passed, 4 failed (25 tests).** The 4 failures were test defects (see "Frontend history"); the fixes have not been re-run. One possible frontend defect was found (F-1 below). Built on the pattern of `purchase-ui.harness.tsx` / `purchase.scenario.ui.spec.tsx`. The frontend decisions (DT-14.5: reload rules, no refetch on focus, saved values stay until the refetch ends, message for a rejected typed value, no editing without a header) are already in the code; the specs assert them. |

Run serially (cleanup deletes all papers dated 2090 or later and the test vehicles):
`npx vitest run src/modules/transactions/dairy-trays --no-file-parallelism`
Every test title starts with its scenario ID, so `vitest -t "DY-98"` runs one scenario.

## Files

Place under `test/helper/` and `src/modules/transactions/dairy-trays/`.

| File | Scenarios |
| --- | --- |
| `test/helper/dairy-trays-helpers.ts` | glue on the Orders harness, Vehicle Allocation and Purchase helpers (API wrapper, scenes, DB seams, cleanup) |
| `dairy-trays.scenario.access.spec.ts` | DY-01 to DY-16 |
| `dairy-trays.scenario.reads.spec.ts` | DY-20 to DY-34, DY-155 |
| `dairy-trays.scenario.save.spec.ts` | DY-40 to DY-50, DY-60 to DY-69, DY-102 (b), DY-150, DY-151, DY-152, DY-153, DY-154 |
| `dairy-trays.scenario.ledger.spec.ts` | DY-70 to DY-78 |
| `dairy-trays.scenario.propagation.spec.ts` | DY-80 to DY-82, DY-84 to DY-86, DY-90 to DY-94 (409 part), DY-96, DY-98, DY-104 to DY-106 |
| `dairy-trays.scenario.admin.spec.ts` | DY-100 to DY-103 |
| `dairy-trays.scenario.gates.spec.ts` | DY-110 to DY-114 |
| `dairy-trays.scenario.concurrency.spec.ts` | DY-51, DY-52, DY-120 to DY-125, DY-127 (todo) |

Frontend, in `src/features/paper/modules/paper-level/dairy-trays/test/` (path inferred from the Purchase layout; the spec imports `../pages/DairyTraysPage`):

| File | Scenarios |
| --- | --- |
| `dairy-trays-ui.harness.tsx` | `dairyResponse` fixture, `saveResult`, `apiError` with `details[]`, `deferred`, `DairyAgGridStub`, `gridHandlers` |
| `dairy-trays.scenario.ui.spec.tsx` | DY-130 to DY-143, DY-156 to DY-160 |

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| DY-01 | access: DY-01 a, b, c | none / garbage / expired JWT, all four endpoints |
| DY-02 | access: DY-02 | |
| DY-03 | access: DY-03 | |
| DY-04 | access: DY-04 | own app instance with the real throttle guard; GET checked only as "not limited at this volume" |
| DY-05, DY-06 | access: same IDs | DY-05 b uses a zero-padded real paper id instead of `007` (id 7 may exist) |
| DY-07 | access: DY-07 | 200 on all three POSTs (Q-1) |
| DY-08, DY-09 | access: same IDs | |
| DY-10, DY-11, DY-12, DY-13, DY-14, DY-15, DY-16 | access: same IDs | DY-13 b proves the 5000-item shape check by the business 400 "returns were rejected" |
| DY-20 to DY-22 | reads: same IDs | DY-21 / DY-22 assert no header created, no writes, no token change |
| DY-23, DY-24 | reads: DY-23 a/b, DY-24 a/b | columns asserted for the test tray types only (the DB may hold other active tray types) |
| DY-25, DY-155 | reads: DY-25 and DY-155 | one test; nameless vehicle last and shows its number |
| DY-26 to DY-31 | reads: same IDs | DY-29 tampers stored opening/taken/closing to prove the grid is live |
| DY-32, DY-33 | reads: DY-32 / DY-33 (5 statuses) | |
| DY-34 | reads: DY-34 | three 0.4 purchases (three products, one vehicle) give 1; 10.5 gives 11 |
| DY-40 to DY-42 | save: same IDs | |
| DY-43, DY-152 | save: DY-43 and DY-152 | one test |
| DY-44, DY-151 | save: DY-44, DY-151 | |
| DY-45 to DY-48 | save: same IDs | |
| DY-49, DY-154 | save: DY-49, DY-154 | |
| DY-50 | save: DY-50 | |
| DY-60 to DY-64 | save: same IDs | DY-63 asserts only the 400 status for 2001 (D-7 / DT-5.12) |
| DY-65, DY-102 | save: DY-65 a, b / DY-102 b; admin: DY-102 | |
| DY-66 to DY-69 | save: same IDs | DY-67, DY-68 use DB seams |
| DY-150, DY-153 | save: DY-150, DY-153 | |
| DY-70 to DY-78 | ledger: same IDs | DB seams for earlier stored ledgers (DY-70, 71, 77, 78) |
| DY-80, DY-81 | propagation: DY-80 a/b, DY-81 | driven through the real Purchase API |
| DY-82 | propagation: DY-82 | asserts the Purchase write is rolled back |
| DY-84, DY-85 | propagation: same IDs | |
| DY-86 | propagation: DY-86 | |
| DY-90, DY-91 | propagation: DY-90 a/b, DY-91 | |
| DY-92, DY-93 | propagation: same IDs | the real forward-job body is run through `DairyTraysPropagationService.propagateFromPaperChunk` |
| DY-94 | propagation: DY-94 (409 part) | the thrown 409 and its details only; see Not implemented |
| DY-96 | propagation: DY-96 | chunk size 2 |
| DY-98 | propagation: DY-98 | |
| DY-100 to DY-103 | admin: same IDs | DY-103 asserts no `paper_audit_log` row and no reason required |
| DY-104 to DY-106 | propagation: same IDs | DY-106 runs the job body (the queue is stubbed in the harness) |
| DY-110 to DY-114 | gates: same IDs | gate service called directly |
| DY-120, DY-121, DY-123 | concurrency: same IDs | **fault seams** (repository spy on `replaceTrayTransactions`) |
| DY-122 | concurrency: DY-122 | |
| DY-124 | concurrency: DY-124 | **adapted**: the status change is a direct DB update |
| DY-125 | concurrency: DY-125 | **interpreted**, see below |
| DY-51, DY-52 | concurrency: same IDs | |
| DY-127 | concurrency: `it.todo` | operational (DT-10.10) |
| DY-130 | ui: DY-130 a, b, c | no paper, loading, load error |
| DY-131 | ui: DY-131 | one section per session, totals row each, extra Session column, empty-session message |
| DY-132 | ui: DY-132 a, b, c | normal mode, non-editable paper, reconcile mode |
| DY-133 | ui: DY-133 | invalid values 12.5, -1, abc, 2001 keep the old value with the toast "Invalid returned value"; blank sends 0 |
| DY-134 | ui: DY-134 a, b | token captured at the first edit; only edited cells sent; none gives an info toast |
| DY-135 | ui: DY-135 | 5001 edits pushed through the page's change handler (`gridHandlers`), not typed one by one |
| DY-136, DY-159 | ui: DY-136 and DY-159 | one test; refetch held open with a deferred promise |
| DY-137 | ui: DY-137 | |
| DY-138, DY-158 | ui: DY-138 / DY-158, DY-138 | stale token and exhausted retries |
| DY-139 | ui: DY-139 | includes a control query on the same client that DOES refetch, so the test proves the events fire |
| DY-140 | ui: DY-140 a, b, c | |
| DY-141 | ui: DY-141 | |
| DY-142 | ui: DY-142 | |
| DY-143 | ui: DY-143 | |
| DY-156, DY-157 | ui: same IDs | timeout 409 and return-discrepancy 409 keep edits, no reload |
| DY-160 | ui: DY-160 | |

## Not implemented

| Scenario | Reason |
| --- | --- |
| DY-83 (Purchase deletion by id, purgeAll, reevaluateTrays) | The Purchase delete / purge / admin routes were not among the files I could drive (the Purchase helper has no wrapper for them). Covered on the Purchase side by PU-118 and PU-127b. Needs from you: the route shapes, or accept the Purchase coverage. |
| DY-87 | Not reachable through the API (Purchase editable statuses equal the dairy ones); the spec marks it a seam with no fault injection point. |
| DY-94 (FAILED row, `last_error`, no retry), DY-95 (retry, backoff, stuck PROCESSING) | The harness stubs the queue, relay and processor (`orders-harness.ts`), so there is no processor to assert on. A test would have to invent one. |
| DY-97 (finalize queues the forward job, FAILED blocks next finalize) | Paper / orchestrator owned; belongs in the Paper specs. |
| DY-107 | Marked D-9 (non-functional) in the spec; the quadratic cost is not assertable. The 31-papers-31-jobs effect is covered by DY-104 at smaller size. |
| DY-115, DY-116, DY-117 | Paper-owned (morning submit, re-finalize, readiness, generation, sign-off). DY-117 sign-off is covered by PU-130 / PU-139. |
| DY-126 | Purchase-owned (PD-19). |
| DY-127 | `it.todo`, operational. |

## Assumptions

1. Harness API as used by the Purchase helpers: `createOrdersTestContext({ modules })`, `ctx.call / world / db / prisma / app / tokens / tokenFor / setStatus`. `DairyTraysModule` is exported from `dairy-trays.module.ts`; the specs mount it explicitly (it is already imported by `PurchaseModule`).
2. Import depth `../../../../test/helper/...` from `src/modules/transactions/dairy-trays/`, as the Purchase specs are described. `Prisma` is imported from `../../../generated/prisma/client.js`.
3. **DB seams:** purchases are written as `purchase_entry` rows (`buyTrays`) instead of through the Purchase API (except in DY-80 to DY-86 and DY-125); stored ledgers come from the real job body (`rebuildLedger`); legacy data (DY-30, 67, 68, 78, 113 c to d) is written with `seedDairyLine` / `setStoredReturn`. A purchase paper row is upserted by the helper because I did not know the Purchase token field name.
4. One order unit is one tray (DT-6.4); `buyTrays` stores the frozen tray type of the `brandTray` brand unless told otherwise.
5. Sale dates 2096-01-01 + k days for Dairy papers; the harness world uses 2091.
6. **DY-113 a (header missing):** the matrix says one "not ready" 400 with every problem in `details[]`; DT-12.1 item 1 gives the header's own message, and the code throws that message without `details[]`. The test asserts 400 and the text `has not been generated`, which holds under both readings. Needs a decision which shape is binding.
7. **DY-125:** the spec says one succeeds and the other is 409. If the Purchase save runs after the Dairy save, both can legitimately succeed (the Purchase save sends no Dairy token). The test asserts: no 5xx, each is 200 or 409, at least one 200, and the stored line is consistent with the final purchase and the balance rule.
8. **DY-120:** the 3-attempt exhaustion assumes the shared runner treats Prisma `P2034` as a serialization failure. **DY-121** takes about 12 s.
9. **DY-123** assumes the masked 500 body carries the text `requestId`.
10. **DY-124** (adapted, as PU-164): the status change is a DB update, not a real admin revert.
11. Throttling (DY-04) counts requests that fail validation, as the Purchase DY-05 equivalent (PU-05) does.

## Frontend assumptions

1. jsdom, `@testing-library/react` and `@tanstack/react-query` installed; the `@` alias works in vitest; the spec sets its own jsdom environment.
2. The HTTP client (`@/shared/api/http`) is mocked, so the real `dairyTraysApi` runs and the tests assert the real URLs (`/api/dairy-trays/:id`, `/save`, `/reconcile-inactive`, `/recalculate`). `ag-grid-community` is used for real (module registry, theme); `ag-grid-react` is replaced by a stub that runs the real column definitions, `valueParser` and `editable` callbacks. The real AG Grid cell editor is not exercised.
3. `extractErrorMessage` (`@/features/paper/utils/error`) was not provided and is used for real. DY-137 and DY-157 assume it prints `details[]` into the toast description (I-7), as the Purchase specs assumed for PU-195 / PU-202.
4. The shadcn `Button` and `Input` render in jsdom; the labels "Sale date from" and "Sale date to" are reachable with `getByLabelText`.
5. Toast titles and button texts are those of the source files read: "Invalid returned value", "No changes to save", "Too many dairy tray changes", "Dairy tray returns saved", "Dairy tray reconciliation saved", "No changes saved", "Dairy tray save failed", "Dairy tray recalculation queued".
6. DY-143: the page has no "Unsaved changes" marker, so unsaved edits are observed through the input value; the paper change is done with `rerender` after changing the mocked context.

## Likely to fail on the next run (my reading, unverified)

| Test | Why |
| --- | --- |
| DY-23 b, DY-75 | Order of tray-type columns and rule resolution depend on `getAllTrayTypes` ordering and `resolveTrayRule` details I only read through the spec. |
| DY-13 b | Depends on the global `ValidationPipe` and the 1 MB body limit accepting 5000 entries (about 0.4 MB). |
| DY-15 a | Omitted `expectedUpdatedAt` is 400 only if the `@ExpectedUpdatedAt` decorator is wired on the DTO as DT-9.2 says; I did not see the DTO. |
| DY-120, DY-121, DY-123 | Fault seams; depend on the transaction runner and exception filter (assumptions 8 and 9). |
| DY-124, DY-125 | Race tests; assertions are property-based, but timing-sensitive. |
| DY-137, DY-157 | Depend on `extractErrorMessage` printing `details[]` (frontend assumption 3). |
| DY-131, DY-133 | The grid is shown through a stub; the toast and value checks assume the stub's `valueParser` call matches AG Grid's parameters (`newValue`, `oldValue`). |
| DY-139 | Relies on `focusManager` and `onlineManager` notifying subscribed queries in jsdom (the control query proves the events fire). |
| DY-140 c, DY-141 | Date inputs (`type="date"`) accept `fireEvent.change` values in jsdom; the paper-id list text must match "paper #5 (operation #9)". |
| DY-135 | Calls the page's change handler 5001 times inside one `act`; may take a few seconds. |
| DY-25 | Name order uses `localeCompare`; a DB with unusual locale rules could reorder the `A-` and `B-` names (D-15). |

## Implementation discrepancies

None confirmed by the first run (every failure was a test defect). Points where the spec, the decision file and the code read differently, recorded instead of worked around:

1. **DY-113 a** (assumption 6): matrix versus DT-12.1 versus code.
2. **DY-63 / DY-10 (2001):** only the 400 status is binding; the service text `exceeds the limit of 2000 per row` is unreachable through the API (D-7). The tests assert status only.
3. **DY-94, DY-95, DY-97:** the spec marks the code as verified against the processor and orchestrator; those cannot be asserted in this harness.
4. **D-9 / DY-127:** open operational item, no test.

## History: failures of the first run and their causes (all test issues)

| Tests | Cause | Fix |
| --- | --- | --- |
| DY-02, DY-07 | Save and reconcile were called with `entries: []`, which is 400 by DT-4.3. The reconcile call on an active vehicle is also 400 (DT-5.11). | A no-op entry (`returned` equal to the stored 0) is used for save; the vehicle is deactivated before the reconcile call. |
| DY-06 a | Same empty `entries`: the body shape is checked before the paper lookup (DT-4.7), so 400 came back instead of 404. | A shape-valid body is used. DY-06 b still covers "invalid body for a missing paper is 400". |
| DY-08 a, DY-10 a (6 cases), DY-10 b, DY-11 | The spec imported `dtRows`, which does not exist in the helper (the helper exports `dairyRows`). | Import and calls changed to `dairyRows`. |
| DY-100 c | Two scenes were built on the same sale date (`k = 0`); `order_date` is unique. | The second scene uses `k = 1`. |
| DY-77 | The grid is live: Taken comes from purchases, not from the stored `trays_taken`. The earlier paper had only a stored line, so no grid row existed. | A purchase of 10 is added to the earlier paper; the stored line is still written without a cascade. |
| DY-84 | The "success" step raised the purchase to 12, above the allocation of 10: 400 "purchased quantity 12 exceeds allocated quantity 10". | The later paper's stored return is now 5; the conflict step buys 4 (below 5) and the success step buys 8 (within the allocation). |

No finding about production behavior came out of this run: the 132 passing tests include the save contract, the token rules, the cascade and gate behavior, the throttle and the fault seams (DY-120, DY-121, DY-123).

## Frontend history: failures of the first run

| Tests | Cause | Fix |
| --- | --- | --- |
| DY-135 | The test timed out at 5 s (5.6 s measured). The page copies the whole draft on each of the 5001 edits, so the cost grows with the square of the edit count; the test was not wrong, the default limit was too tight for it. | Test timeout raised to 60 s. |
| DY-136 / DY-159 | The hook and the page both call `invalidateQueries`; the second cancels the first and starts a new fetch. My one-shot deferred promise served only the first fetch, so the second fetch returned the old data at once and the refetch was no longer pending. | The deferred promise now answers every refetch. |
| DY-138 / DY-158 (two cases) | After the discard, the reload returned data identical to the old data. React Query then keeps the old `rows` reference (structural sharing), and the page's `loadedRows` copy, which the grid had edited in place, was not rebuilt, so the typed 6 stayed on screen. See F-1. | The test now reloads data that differs, as after another user's save (returned 2), and expects 2 and not 6. |

## Possible frontend defect (not confirmed in the running app)

**F-1 (low).** After a stale-token or exhausted-retry 409, DT-14.5 says the draft is discarded and the grid reloaded. `DairyTraysPage` builds `loadedRows` with `useMemo` from `data.rows`. A grid edits the row objects it is given in place (AG Grid's default value setter, which the stub copies). If the reload returns rows that are deep-equal to the previous ones, React Query keeps the same `rows` reference, the memo is not recomputed, and the edited copy, with the discarded value, is shown again. In practice the stored token moves only when stored rows change, so the reloaded rows normally differ; the case is rare. Not changed (production code is out of scope). To reproduce in the real app: edit a cell, trigger a stale 409 whose reload returns identical rows, and look at the cell. Decision needed: fix in the page (build the draft rows or `loadedRows` from a fresh clone on discard) or accept.
