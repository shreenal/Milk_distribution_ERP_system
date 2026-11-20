# Purchase module: scenario-to-test coverage map

Sources of truth: `purchase-behavioral-spec.md` (matrix C, F3, F4, F6) and `PURCHASE_BUSINESS_DECISION.md`. The implementation was read only to learn how to drive it. Expected results follow section F of the behavioral spec (amended PD-1, PD-3, PD-4, PD-7, PD-37, PD-41, PD-48, PD-61, PD-63, PD-71). Sections A to E of that file describe the pre-decision behavior and are superseded where F differs.

## Status

| Part | State |
| --- | --- |
| Backend: access, reads, save, delete / purge, dairy, sign-off and recalculation, gates, concurrency | **Executed.** First run: 139 passed, 3 failed, 2 todo (144 tests, 8 files). The 3 failures were test setup defects and are fixed (see "History"); no implementation defect was found. The fixed tests (PU-39, PU-86, PU-87) have not been re-run since the fix. |
| Frontend: `purchase.scenario.ui.spec.tsx` and its harness (PU-190 to PU-203) | **Written, NOT executed.** Built on the pattern of `orders-ui.harness.tsx`. The frontend decisions PD-77 (reload rules) and PD-78 (refetch policy) were implemented in code first; the specs assert them. |

## Files

Backend, in `src/modules/transactions/purchase/` (helper in `test/helper/`):

| File | Scenarios |
| --- | --- |
| `test/helper/purchase-helpers.ts` | thin glue on the Orders harness and the Vehicle Allocation helpers (API wrapper, entry builder, scenes, DB reads, cleanup) |
| `purchase.scenario.access.spec.ts` | PU-01 to PU-20 |
| `purchase.scenario.reads.spec.ts` | PU-30 to PU-51, PU-185, PU-186, PU-187 |
| `purchase.scenario.save.spec.ts` | PU-60 to PU-107, PU-180 to PU-184, PU-188, PU-189 |
| `purchase.scenario.delete.spec.ts` | PU-110 to PU-117, PU-119 to PU-121 |
| `purchase.scenario.dairy.spec.ts` | PU-118, PU-125 to PU-128 |
| `purchase.scenario.admin.spec.ts` | PU-130 to PU-137, PU-139 to PU-147 |
| `purchase.scenario.gates.spec.ts` | PU-138, PU-150 to PU-158 |
| `purchase.scenario.concurrency.spec.ts` | PU-160 to PU-165, PU-170 to PU-174 |

Frontend, in `src/features/paper/modules/paper-level/purchase/test/` (path inferred from the Vehicle Allocation layout; the spec imports `../pages/PurchasePage` and mocks `../api/purchase.api`):

| File | Scenarios |
| --- | --- |
| `purchase-ui.harness.tsx` | fixtures (`purchaseResponse`), `apiError` with `details[]`, `PurchaseAgGridStub` |
| `purchase.scenario.ui.spec.tsx` | PU-190 to PU-203 |

Frontend source changed for PD-77 / PD-78 (copies in `.../purchase/`): `utils/purchase-conflict.ts` (new), `pages/PurchasePage.tsx`, `mutations/useSavePurchase.ts`, `queries/usePurchase.ts`.

Every test title starts with its scenario ID (`a`/`b` for sub-cases), so `vitest -t "PU-98"` runs one scenario.
Run the DB-backed specs serially: `npx vitest run src/modules/transactions/purchase --no-file-parallelism` (the cleanup deletes all papers dated 2090 or later and the test vehicles, so parallel files interfere).
The specs mount `PurchaseModule` through the `modules` option of `createOrdersTestContext`. `gates` and `concurrency` also mount `PaperModule`.

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| PU-01 to PU-04 | access: same IDs | PU-04 also asserts 403 wins over 404 (O-3) |
| PU-05 | access: PU-05 | own app instance with the real throttle guard; sign-off and recalculate are driven with 400 responses, which still count |
| PU-06 to PU-11 | access: same IDs | PU-11 uses a paper with 10000 ordered and allocated |
| PU-12 | access: PU-12 | `"5"`, -1, 10000.01 only (see "Not implemented") |
| PU-13 | access: PU-13 | null, `""`, omitted |
| PU-14 | access: PU-14 | new 5.255 gives 400; a stale token wins (409). Legacy tolerance not testable |
| PU-15 to PU-20 | access: same IDs | |
| PU-30 | reads: PU-30 | |
| PU-31 to PU-36 | reads: same IDs | PU-32 checks the Packaging Type level through the column path length |
| PU-37 | reads: PU-37 a to e | **seam**: rate master data created per case |
| PU-38 | reads: PU-38 | SAME_DAY and PREVIOUS_DAY, both sessions |
| PU-39 | reads: PU-39 | three products, one per rate issue |
| PU-40 | reads: PU-40 | **DB seam**: second allocation row added directly |
| PU-41, PU-186 | reads: PU-41 / PU-186 | one test; also asserts not drawn, persisted total, not stale |
| PU-42 | reads: PU-42 | includes the legacy no-snapshot case |
| PU-43 | reads: PU-43 | SURPLUS made by lowering the stored allocation |
| PU-44 | concurrency: PU-174 | after F an orphan carries no variance; PU-174 asserts no variance, meta or stale on the orphan cell |
| PU-45, PU-46 | reads: same IDs | |
| PU-47 to PU-49 | reads: same IDs | |
| PU-50, PU-187 | reads: PU-50 / PU-187 | all five statuses |
| PU-51 | reads: PU-51 | |
| PU-185 | reads: PU-185 | **DB seam**: row deleted and re-created with a new id |
| PU-60 to PU-70 | save: same IDs | PU-69 and PU-70 are **fault seams** (repository spy) |
| PU-80 to PU-84 | save: same IDs | PU-80 uses a tray product to check the stored tray type |
| PU-85, PU-88, PU-181 | save: PU-85 / PU-88 / PU-181 | one test |
| PU-86, PU-87, PU-89 to PU-91 | save: same IDs | |
| PU-92 | save: PU-92 | **seam**: master rate, order unit and link changed in the DB |
| PU-93 to PU-97 | save: same IDs | |
| PU-98, PU-183 | save: PU-98 / PU-183 | one test |
| PU-184 | save: PU-184 | |
| PU-99 to PU-104 | save: same IDs | |
| PU-105 | save: `it.todo` | undecided in the spec |
| PU-106, PU-107 | save: same IDs | |
| PU-180, PU-182 | save: same IDs | |
| PU-188, PU-189 | save: same IDs | `Logger.prototype.warn` spy |
| PU-110 to PU-117 | delete: same IDs | PU-110 and PU-115 spy on `Logger.prototype.log` |
| PU-118 | dairy: PU-118 / PU-127b | delete that would strand a dairy return |
| PU-119 to PU-121 | delete: same IDs | |
| PU-125 | dairy: PU-125a, b | 0.4 x 3 gives 1 tray; 10.5 gives 11 |
| PU-126 | dairy: PU-126a (no-op); admin: PU-126b / PU-147 (recalculation) | spy on `DependencyOrchestratorService.execute` |
| PU-127 | dairy: PU-127a, PU-127b | **DB seam**: dairy return written directly |
| PU-128 | dairy: PU-128a, b | **DB seam**: later paper and its dairy ledger seeded |
| PU-130, PU-139 | admin: PU-130 / PU-139 | one test; dairy header deleted first to prove it is ensured |
| PU-131 to PU-134 | admin: same IDs | |
| PU-135, PU-136 | admin: PU-135 / PU-136 | **DB seam**: allocation rows added and removed; `isZeroAllocationSignOffPending` called directly |
| PU-137 | admin: PU-137 | asserts a 404 for a revoke route |
| PU-138 | gates: PU-138 | via Paper readiness |
| PU-140 to PU-146 | admin: same IDs | PU-141 asserts the log line content |
| PU-147 | admin: PU-126b / PU-147 | |
| PU-150 to PU-157 | gates: same IDs | gate service called directly; PU-151, PU-153, PU-156, PU-157 also use Paper readiness |
| PU-158 | gates: PU-158 | MORNING allocation changed through the real Vehicle Allocation API |
| PU-160 | concurrency: PU-160 / PU-148 | one test |
| PU-161 to PU-162 | concurrency: same IDs | |
| PU-163 | concurrency: PU-163 | **fault seam** |
| PU-164 | concurrency: PU-164 | **adapted** (see below) |
| PU-165 | concurrency: PU-165 | **fault seam** |
| PU-166 | concurrency: `it.todo` | operational |
| PU-170 to PU-172 | concurrency: same IDs | PU-172 changes demand with a DB update |
| PU-173, PU-174 | concurrency: same IDs | |
| PU-190 | ui: PU-190 | token captured at the first edit; a background `setQueryData` does not change the save |
| PU-191 | ui: PU-191, PU-191b | echo for every allocated cell; cells without meta skipped; removal goes to `deletedEntryIds` |
| PU-192 | ui: PU-192 | invalid values 7.555, -1, abc, 11 keep the old value with an error toast; blank becomes 0 |
| PU-193 | ui: PU-193, PU-193b | toasts for changed, for ignored entries by reason, for critical shortfall, for no change |
| PU-194 | ui: PU-194 (2 messages) | stale token and exhausted retries: draft discarded, refetch, error toast |
| PU-195 | ui: PU-195 | 400: edits kept, message and details in the alert, no reload |
| PU-196 | ui: PU-196 | confirm step, payload with the loaded token, disabled with unsaved edits, hidden when not editable |
| PU-197 | ui: PU-197 | sign-off payload and token; not editable and signed-off variants |
| PU-198 | ui: PU-198, PU-198b | dash and no input; allocation gone; non-editable paper |
| PU-199 | ui: PU-199 | employee sees no panel; recalculate needs REOPENED and a reason; purge two-step; disabled with edits |
| PU-200 | ui: PU-200 | includes a control query on the same client that DOES refetch, so the test proves the events fire |
| PU-201, PU-202 | ui: same IDs | timeout 409 and 409 with details keep the edits, no reload (PD-77) |
| PU-203 | ui: PU-203 | retry sends the same payload and the same token |

## Not implemented

| Scenario | Reason |
| --- | --- |
| PU-105 (category that does not match the allocation key) | The spec marks the behavior as observed and undecided [U]. A test would invent the expected result. `it.todo` in `save.spec`. **Needs from you:** a decision on 400 versus ignored. |
| PU-166 (5,000 entries inside 10 s) | Operational (PD-75, measure before go-live). Not assertable deterministically. `it.todo`. |
| PU-175 (paper generation creates the dairy header) | Paper-owned (PD-64). Belongs in the Paper specs. |
| PU-12, NaN and Infinity | JSON cannot serialize them. |
| PU-14, "unchanged legacy echo is tolerated" | `purchase_entry.purchased_qty` is `Decimal(10,2)`, so an over-precise stored value cannot be created. |

## Adapted / interpreted (read before trusting a green result)

0. **Frontend stub (PU-190 to PU-203).** `ag-grid-react` is replaced by a stub that runs the real column definitions: it evaluates each column's `editable` callback, applies the real `valueParser` (an invalid value keeps the old value and emits no change event), mutates the row and calls `onCellValueChanged`, and renders the real `cellRenderer` (the remove button, the dash). The real AG Grid cell editor and its string-versus-number typing are not exercised; the page accepts either.

1. **PU-164 (adapted).** A save racing a real morning submit needs a paper that passes every module's readiness. The same property (PA-11.1, status check plus serializable transaction) is exercised with the admin revert `MORNING_SUBMITTED` to `NIGHT_SUBMITTED`, which turns purchase editing on. The save is 200 or 400 and never 5xx; ledger and token agree with the outcome. It does not prove the same for submit-morning or finalize.
2. **PU-135 / PU-136.** The sign-off effect is asserted through the GET block and `isZeroAllocationSignOffPending`. The gate-level effect ("sign-off no longer needed") is covered by PU-153.
3. **PU-05.** "Another user unaffected" is checked for save only. There is a single admin in the harness.
4. **PU-38.** Two rates valid on opposite sides of the IST day boundary are used to tell the sale date from the day before.
5. **PU-128.** The later paper's dairy ledger is seeded directly (opening 10, returned 10). The expected 409 on REOPENED and 200 on NIGHT_SUBMITTED comes from DT-10.2, which was not in the files provided.
6. **PU-172.** Demand is changed with a DB update, because Orders is locked once the paper is `NIGHT_SUBMITTED`.
7. **PU-151, PU-153, PU-156, PU-157, PU-138.** Paper readiness is used for the Paper-level rows (same collectors, PA-19.3). The real submit endpoints are not executed. Only Purchase strings are filtered from `problems[]`, because other modules may add their own.
8. **PU-44.** After the amendment an entry with no allocation is an orphan and has no variance, so `UNPLANNED_ALLOCATION` is no longer reachable on the grid. The row is covered by the orphan assertions of PU-174 and PU-41 / PU-186.
9. **PU-137.** "No endpoint exists" is asserted as a 404 on a made-up revoke route.

## Assumptions

Frontend:
- jsdom, `@testing-library/react` and `@tanstack/react-query` installed; each UI file sets its own jsdom environment; the `@` alias works in vitest.
- `purchaseApi`, the toast, `usePaperContext`, `useAuthStore` and `ag-grid-react` are mocked. Real: the four hooks, `PurchasePage`, `PurchaseGrid` logic, notices, admin panel, `classifyPurchaseConflict`.
- `@/shared/api/error` (`getApiErrorStatus`), `@/features/paper/utils/error` (`extractErrorMessage`) and `@/features/paper/utils/format` were not provided and are used for real. The specs assume `getApiErrorStatus` reads `error.response.status` from an `AxiosError`, and that `extractErrorMessage` prints `details[]` into the message (I-6): PU-195 and PU-202 will show it if not.
- The shadcn components (`Button`, `Label`, `Textarea`, `Input`, `Tooltip`) render in jsdom without extra setup. `structuredClone` is polyfilled in the harness when jsdom lacks it.
- The `utils` barrel (`index.ts`) is untouched: the page and the hook import `../utils/purchase-conflict` directly.

Backend:
1. Harness API inferred from the Orders, Client Trays and Vehicle Allocation specs: `ctx.call`, `ctx.world.scene / addDistRate / deleteRates / newSheet`, `seedNight`, `setStatus`, `ctx.db`, `ctx.app.get(..., { strict: false })`, and the `modules` option of `createOrdersTestContext`.
2. Purchase scenes reuse `demandScene` and `twoSessionScene` from the Vehicle Allocation helpers. Allocations are saved through the real Vehicle Allocation API in DRAFT, then the paper is set to `NIGHT_SUBMITTED` directly.
3. The harness product rate is 56 per L with pricing quantity 12, so an amount is quantity x 12 x 56. Rates are `distributor_product_rate` rows valid from 2000-01-01.
4. A `dairy_tray_paper` header is created in every scene, as PD-64 says it exists by morning submit.
5. Where the decision file gives a message (PD-56, PD-63, PD-48), the message is asserted. Elsewhere only the status is asserted.
6. Log assertions spy on `Logger.prototype.log` and `warn` and read the JSON string, as Orders S-81 did.
7. `GET /papers/:id/readiness` returns `{ action, problems, warnings, requiredActions }` as in the Paper decision file.
8. Revert-morning answers 201 (the Vehicle Allocation paper spec relies on this).
9. Nothing in production code or in the approved expected results was changed.

## History: failures of the first run and their causes (all were test issues)

| Test | Cause | Fix |
| --- | --- | --- |
| PU-39, PU-86, PU-87 | The scene was created with `rate: null`, so the Orders night save in `demandScene` failed with `No active rate found for product ... on date ...` (OD-9.4: an order cannot be saved without a rate). The scene could not be built. | Scenes are built with the default rate; `ctx.world.deleteRates(product)` removes it afterwards, once the order and the allocation exist. PU-142 and PU-144 already worked this way. |

## Failing tests and implementation discrepancies

**Result of the run: no implementation defect found.** 139 tests passed, including every test flagged as highest risk before the run: PU-37 a to e, PU-38, PU-125a/b, PU-127a/b, PU-118, PU-128a/b, PU-164, PU-05, PU-171, PU-138, PU-153. The code matched section F of the behavioral spec: new zero without link ignored, echo mandatory for every allocated cell, orphans for entries with no allocation, `UNCHANGED_EXCEEDS_ALLOCATION`, `signOffRequired` following `workflow.editable`, shortfall warnings limited to stored or changed entries, quantity-only staleness.

**Next step:** re-run `purchase.scenario.reads.spec.ts` and `purchase.scenario.save.spec.ts` to confirm the three fixed tests pass.

**Frontend (written, not run): tests most likely to fail on the first run, and why**

| Test | Why |
| --- | --- |
| PU-195, PU-202 | Depend on `extractErrorMessage` printing `details[]` into the alert (I-6). The helper was not provided. |
| PU-196, PU-198 | The real `cellRenderer` renders the shadcn `Tooltip` inside the stub; jsdom may need a polyfill (for example `ResizeObserver`). |
| PU-194, PU-201, PU-202 | Depend on `getApiErrorStatus` reading the status from an `AxiosError`, and on the backend wording of the timeout 409 (D-21). |
| PU-199 | The reason field is found through its label text (`/Reason/`). |
| PU-200 | Relies on `focusManager` and `onlineManager` notifying subscribed queries in jsdom; the control query proves the events fire. |
| PU-190 | Assumes `setQueryData` on key `["purchase","paper",1]` updates the page without touching the draft. |

All frontend specs also assume the source files sit under `src/features/paper/modules/paper-level/purchase/`; change the relative imports if the folder differs.

Spec ambiguities noticed while writing (no test invented around them):

1. **PU-105:** an entry whose `category` does not match the allocation key is observed and undecided. **Needs a decision** (400 versus ignored), recorded in the decision file, before a test is written.
2. **PU-135 / PU-136:** PD-66 says the sign-off "no longer counts" while allocations exist, but the only observables through the API are the GET block and the gate. A one-line note in PD-66 would make the intended observable explicit.
3. **PU-14:** the "unchanged legacy echo is tolerated" rule of PD-27 cannot be reached through the schema (`Decimal(10,2)`). Worth confirming whether the rule is still needed.

Existing tests or callers that must be updated after the amendments (none were provided): anything asserting 201 on save, recalculate-rates or sign-off; a 400 for a new zero with no link; an omitted echo accepted for an unsaved allocated cell; a stale cell with a removed allocation still drawn.