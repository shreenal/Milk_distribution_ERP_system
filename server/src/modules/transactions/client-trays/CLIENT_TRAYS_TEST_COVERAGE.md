# Client Trays module: scenario-to-test coverage map

Sources of truth: `Client Trays Module Behavioral Specification Discovery.md` (matrix C, F3) and `CLIENT_TRAYS_BUSINESS_DECISION.md`.

## Status

| Part | State |
| --- | --- |
| Backend: access, reads, save, recalc (except T-83), admin, concurrency (except T-109) | **Executed. All pass** after the fixes listed in "History". |
| Backend, added in this revision: T-83 and T-108 (`paper.spec`), T-109 (`concurrency.spec`) | **Written, not executed.** T-83 and T-108 need the harness patch below. |
| Frontend: `client-trays.scenario.ui.spec.tsx` and its harness | **Executed: 19 of 20 passed on the first run; the one failure (T-126b) was a test bug and is fixed, not re-run yet.** Built on the pattern of `orders-ui.harness.tsx`. This also confirms assumptions 4 to 7 below, including that the real `extractErrorMessage` prints `details[]` (T-124, T-150 passed). |

## Files

Backend, in `src/modules/transactions/client-trays/` (helper and patch in `test/helper/`):

| File | Scenarios |
| --- | --- |
| `test/helper/client-trays-helpers.ts` | thin glue on the Orders harness |
| `test/helper/orders-harness.modules.patch` | **new**: 2-line change so `createOrdersTestContext({ modules: [...] })` can mount extra modules (needed only by `paper.spec`) |
| `client-trays.scenario.access.spec.ts` | T-01 to T-09 |
| `client-trays.scenario.reads.spec.ts` | T-10 to T-26 |
| `client-trays.scenario.save.spec.ts` | T-30 to T-63, T-140 to T-147, T-153, T-157 (todo) |
| `client-trays.scenario.recalc.spec.ts` | T-70 to T-82, T-154 to T-156 |
| `client-trays.scenario.admin.spec.ts` | T-90 to T-96 (backend part) |
| `client-trays.scenario.concurrency.spec.ts` | T-100 to T-107, **T-109** |
| `client-trays.scenario.paper.spec.ts` | **new**: T-83, T-108 (adapted) |

Frontend, in `src/features/paper/modules/sheet-level/client-trays/test/` (path inferred from the Orders layout; the spec imports `../pages/ClientTraysPage` and `../api/client-trays.api`):

| File | Scenarios |
| --- | --- |
| `client-trays-ui.harness.tsx` | fixtures, `apiError` with `details[]`, `TrayAgGridStub` |
| `client-trays.scenario.ui.spec.tsx` | T-96 (UI part), T-120 to T-130, T-148 to T-152 |

Every test title starts with its scenario ID (`a`/`b` for sub-cases): `vitest -t "T-60"`.
Run the DB-backed backend specs serially: `npx vitest run src/modules/transactions/client-trays/ --no-file-parallelism` (the cleanup deletes all papers dated 2090 or later, so parallel files interfere).

## Coverage map

| Scenario | Test | Note |
| --- | --- | --- |
| T-01 to T-04, T-06 to T-09 | access: same IDs | |
| T-05 | access: T-05 | own app instance with the real throttle guard |
| T-10 to T-24, T-26 | reads: same IDs | T-22 split a/b/c |
| T-25 | T-25a, b, c | c is a service seam (`resolveTrayRule`) |
| T-30 to T-62, T-140 to T-147, T-153 | save: same IDs | T-60 a/b |
| T-63 | save: T-63 | service seam, only the 400 asserted (CT-5.12) |
| T-70 to T-75, T-82 | recalc: same IDs | |
| T-76, T-77, T-79, T-80 | recalc | service seam: cascade / propagation job body run directly (queue stubbed) |
| T-78 | T-78a, T-78b | seam; retry uses `PropagationOutboxRepository.requeueFailedForPaper` (stock harness has no Paper module) |
| T-81 | T-81a, b | outbox repository |
| T-83 | **paper.spec: T-83** | via `GET /papers/:id/readiness` (same collectors as the real submits, PA-19.3) |
| T-90 to T-95 | admin: same IDs | T-94 runs the job body through the service seam |
| T-96 | admin: T-96 (backend), **ui: T-130 / T-96** (UI part) | |
| T-100 to T-103, T-107 | concurrency: same IDs | T-100 uses real parallel requests |
| T-104 to T-106 | concurrency | fault seam (repository spy) |
| T-108 | **paper.spec: T-108 (adapted)** | see "Adapted / interpreted" |
| T-109 | **concurrency: T-109** | see "Adapted / interpreted" |
| T-120 | ui: T-120 | editable cells, totals row, disabled Save |
| T-121 | ui: T-121 | every active Returned cell of both grids, token |
| T-122 | ui: T-122 | token from the response, reload, success toast |
| T-123, T-148 | ui: T-123 / T-148 (3 messages) | stale, unique-key race, exhausted retries |
| T-124 | ui: T-124 | |
| T-125 | ui: T-125 and T-126b | |
| T-126 | ui: T-126a, T-126b | |
| T-127, T-151, T-152 | ui: T-127 / T-151 (4 values), T-127 / T-152 | |
| T-128 | ui: T-128 | includes a control query proving the events fire |
| T-129 | ui: T-129 (partial) | |
| T-130 | ui: T-130 / T-96 | |
| T-149, T-150 | ui: same IDs | |
| T-154 to T-156 | recalc: same IDs | |

## Still not implemented

| Scenario | Reason |
| --- | --- |
| T-157 (balance moves with a client changing group) | Decided (CT-6.7) but not implemented in production (D-16). The trigger is the client master-data update flow, which I have not seen, and the transfer mechanism is not designed (CT-15.8). A test that changes `delivery_group_id` directly in the database would still fail after a correct implementation (the transfer is recorded by the update flow). `it.todo` in `save.spec`. **Needs from you:** the clients update service or controller (and DTO) to drive it through, and the harness mounting `ClientsModule`. |

## Adapted / interpreted (read before trusting a green result)

1. **T-108 (adapted).** A save racing a real morning submit or finalize needs a paper that passes every module's readiness (Vehicle Allocation, Purchase, Dairy Trays, Cash Settlement); I could not build that from this harness without those modules' rules. The same property (PA-11.1: status check plus serializable transaction) is exercised with the admin revert MORNING_SUBMITTED to NIGHT_SUBMITTED, the one transition that needs no readiness: the revert always succeeds, the save is 200 or 400 (never 5xx), and the ledger, token and final status agree with the outcome. It does not prove the same for submit-morning or finalize.
2. **T-109 (interpreted).** The matrix lists the expected result as "serializable conflict, retried; or 409" and marks the implementation `U`. The test asserts exactly that: save is 200 or 409, a cascade that fails fails with a retryable serialization error, and after both finish a rerun converges (later opening equals the start sheet's closing). It does not assert which interleaving wins.
3. **T-83.** Asserts that readiness (DRAFT, NIGHT_SUBMITTED, REOPENED) lists no tray problem and that a sheet with no tray ledger line is legitimate. It does not execute the real submit endpoints.
4. **T-129 (partial).** The remount on sheet change is tested. A second observer of the same query key mounting during edits is an accepted residual risk (CT-9.7), not testable by design.
5. **T-79, finalize part.** That finalize queues `CLIENT_TRAYS_FORWARD` needs a finalizable paper (same blocker as item 1). The job body is tested.
6. **T-59, "new ledger is empty".** Not reachable through the save endpoint; covered by Orders S-69.
7. **T-80, "without skipping a group".** Needs several groups on one paper; chunk resume and idempotency are tested on one group.

## Assumptions

1. Harness API inferred from the Orders specs (confirmed by the first run: the backend suite executed).
2. `world.newSheet({ group, saleDate })` accepts a `saleDate` (confirmed by the first run).
3. `paper.spec` needs `orders-harness.modules.patch` applied (it mounts `PaperModule`). Nothing else changes with the patch.
4. Frontend: jsdom and `@testing-library/react` installed; the `@` alias works; the feature folder is `.../client-trays/` with `pages/`, `api/`, `queries/`, `mutations/`, `utils/`, `types/`, `components/`, and the specs live in its `test/` folder.
5. Frontend: the real `extractErrorMessage` (`@/features/paper/utils/error`, not provided) prints `details[]` into the toast description (I-6). T-124 and T-150 assert this; if the helper prints only the message, those two will show it.
6. Frontend stub: an edit mutates the row object and reports it as `event.data`, as AG Grid does; typed values arrive as strings (I-7 is therefore not exercised for real AG Grid; the page accepts numbers and numeric strings).
7. Frontend: the auth store, paper context, toast and `clientTraysApi` are mocked; `useClientTrays`, `useSaveClientTrays`, `useRecalculateClientTrays`, `ClientsGrid` column logic and `isReloadConflict` are real.
8. Where the decision file says only the 400 is binding (CT-5.12: limit message, "Tray row not found") only the status is asserted.
9. Nothing in production code or approved expected results was changed.

## History: failures of the first run and their causes (all were test or harness issues)

| Test | Cause | Fix |
| --- | --- | --- |
| T-91, T-93 | a global count of `CLIENT_TRAYS_FORWARD` rows saw other spec files' rows | scoped to the test's own paper |
| T-94 | no morning delivery saved before FINALIZED (FINALIZED is delivered-based) | save a delivery first |
| T-53 | my helper ordered for both clients, so client 2 had a line | order for client 1 only |
| T-78b | Paper endpoints not mounted in the stock harness | retry through the outbox repository |
| T-83 | same | moved to `paper.spec` with the harness patch |
| UI T-126b | the mock call count carried over from a first render in the same test (3 calls instead of 2) | `getSheet.mockClear()` between the two renders |

## Implementation discrepancies found

None so far from the executed backend run. One spec ambiguity (carried from the first revision): echoing a stranded return on an inactive tray type through the normal save gives 400 over-return, not the 409 of CT-5.13; the 409 appears only when the request does not contain that row, which is what the UI sends (active types only). Worth a decision.