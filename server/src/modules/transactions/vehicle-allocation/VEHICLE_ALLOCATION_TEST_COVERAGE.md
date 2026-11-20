# Vehicle Allocation module: scenario-to-test coverage map

**Status: executed.**
- Backend (7 spec files): 133 passed, 1 todo (V-150). The first run failed 117 tests only because the stock harness did not mount `VehicleAllocationModule` (404 on every route); the specs now pass `modules: [VehicleAllocationModule]`.
- Frontend (`vehicle-allocation.scenario.ui.spec.tsx`): 12 passed. It lives in `src/features/paper/modules/paper-level/vehicle-allocation/test/`.
- No implementation defect was found. The expected results come from the approved specification (`VEHICLE_ALLOCATION_BUSINESS_DECISION.md`, `vehicle-allocation-behavioral-spec.md` sections C and F4).

## Files

Backend, in `src/modules/transactions/vehicle-allocation/` (helper in `test/helper/`):

| File | Scenarios |
| --- | --- |
| `test/helper/vehicle-allocation-helpers.ts` | thin glue on the Orders harness (vehicles, API wrapper, scenes, DB seams, cleanup) |
| `vehicle-allocation.scenario.access.spec.ts` | V-01 to V-10 |
| `vehicle-allocation.scenario.reads.spec.ts` | V-20 to V-38 |
| `vehicle-allocation.scenario.save.spec.ts` | V-40 to V-56, V-60 to V-82, V-90 to V-96, V-182, V-183 |
| `vehicle-allocation.scenario.anomaly.spec.ts` | V-100 to V-115, V-181 |
| `vehicle-allocation.scenario.gates.spec.ts` | V-120 to V-127, V-130, V-180 |
| `vehicle-allocation.scenario.paper.spec.ts` | V-128, V-129, V-143 (adapted) |
| `vehicle-allocation.scenario.concurrency.spec.ts` | V-140 to V-142, V-144 to V-149, V-161 to V-165 |

Frontend, in `src/features/paper/modules/paper-level/vehicle-allocation/test/`:

| File | Scenarios |
| --- | --- |
| `vehicle-allocation-ui.harness.tsx` | fixtures, `apiError`, AG Grid stub |
| `vehicle-allocation.scenario.ui.spec.tsx` | V-170 to V-179 |

Every test title starts with its scenario ID (`a`/`b`/`c` for sub-cases): `vitest -t "V-65"`. Run the DB-backed specs serially (`--no-file-parallelism`): the cleanup removes papers and test vehicles.

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| V-01 to V-10 | access: same IDs | V-04 uses its own app instance with the real throttle guard |
| V-20 to V-29, V-31, V-32, V-35 to V-38 | reads: same IDs | V-28 compares only the relative order of the test's own vehicles |
| V-30 | V-30a, b, c | |
| V-33 | reads: V-33 | **DB seam**: anomalies inserted directly |
| V-34 | V-34a, b, c | c is a **DB seam** (a conflicting split cannot be saved through the API) |
| V-40 to V-56 | save: same IDs | |
| V-60 to V-64, V-66 to V-82 | save: same IDs | |
| V-65 | V-65a, b, c, d | |
| V-90 to V-96, V-182, V-183 | save: same IDs | V-95: zero demand is produced by a DB update of `ordered_qty`, then the view is asserted |
| V-100 to V-110, V-112, V-113, V-115 | anomaly: same IDs | |
| V-103 | V-103, V-103b | b = "fully allocated again" variant |
| V-111, V-181 | anomaly | **DB seam**: the pre-existing FLAGGED record on the cell of a stored row |
| V-114 | anomaly: V-114 | **fault seam** (repository spy) |
| V-120 to V-125, V-127, V-130, V-180 | gates: same IDs | the gate service is called directly (as the Orders gates spec) |
| V-123 | V-123a, b, c, d | d is a **DB seam** |
| V-126 | gates: V-126 | **adapted**, see below |
| V-128, V-129 | paper: same IDs | via `GET /papers/:id/readiness`, needs `modules: [PaperModule]` |
| V-140, V-141, V-144, V-147, V-148, V-149 | concurrency: same IDs | V-140 / V-141 use real parallel requests |
| V-142, V-145, V-146 | concurrency | **fault seam** (repository spy) |
| V-143 | paper: V-143 | **adapted**, see below |
| V-161 to V-165 | concurrency: same IDs | |
| V-170 to V-179 | ui: same IDs | V-170b, V-171b added as sub-cases |

## Not implemented

| Scenario | Reason |
| --- | --- |
| V-150 | `it.todo`. The scale of a 5,000-entry save on a large real paper is an open operational item (VA-13.2). It cannot be asserted deterministically. |
| V-160 | Purchase-owned (VA-13.1): VA writes nothing to Purchase and Purchase derives its own stale state. It needs the Purchase module and its rules, which are not in this harness. Only the VA side (V-161, row id and quantity kept) is covered. |
| Real night / morning submit in V-126, V-143 | A real submit needs Vehicle Allocation, Purchase, Dairy Trays, Cash Settlement and Orders all ready (same blocker as Orders S-124 and Client Trays T-108). |

## Adapted / interpreted (read before trusting a green result)

1. **V-126 (adapted).** The status `NIGHT_SUBMITTED` is set directly instead of calling night submit. It proves VA-2.2 (the MORNING plan is untouched and editable, NIGHT is locked), not that the real submit leaves it alone.
2. **V-143 (adapted).** The race uses the admin revert `MORNING_SUBMITTED` to `NIGHT_SUBMITTED` with a MORNING save, as T-108 did. It proves the status check plus serializable transaction, not the same for night submit. The loser's message is asserted as the VA-2.3 "cannot be edited because the paper is MORNING_SUBMITTED" text.
3. **V-128 / V-129** assert on readiness (same collectors, PA-19.3) through a regex on the coverage line (`required N, allocated M`). They do not execute the real submits.
4. **V-95.** The spec row says "empty snapshot, confirmed, session has zero demand". A stored row on a zero-demand product is invalid and is removed without confirmation anyway, so the test confirms the empty snapshot while demand exists and then checks the zero-demand state.
5. **V-04** uses no-op saves and reconciles (empty snapshot with nothing stored) so every call is a clean 200 that still counts towards the limit.
6. **V-28** cannot assert collation: it checks only the order of the test's own vehicles (`aa`, `bb`, nameless) and that an inactive one is absent.
7. **V-170 to V-179:** the AG Grid stub reports the typed string as `newValue`. The real grid parses it with `parseAllocatedQty` first, which is not exercised here. The page itself accepts a number or a numeric string.

## Assumptions

1. Harness API inferred from the Orders and Client Trays specs: `ctx.call`, `ctx.world.scene/addGroup/addClient/addDistributor`, `seedNight/seedMorning`, `setStatus`, `ctx.db`, `ctx.app.get(..., { strict: false })`, and the `modules` option of `createOrdersTestContext` (already present in the provided harness).
2. The world has no vehicles. The helper creates `master_vehicle` rows (prefix `T-veh-`) and deletes them after each test (after the papers, because allocations reference vehicles).
3. `GET` lists every active vehicle in the database. Tests therefore look cells up by vehicle id and never assume the row count.
4. All demand comes from the harness defaults: product rate 56 per L, distributor `distA`, session NIGHT (the sheet's group default). MORNING demand is made with a second sheet on the same paper (`twoSessionScene`) or by changing the sheet's `delivery_session` (`setSheetSession`).
5. Frontend: jsdom, `@testing-library/react` and `@tanstack/react-query` installed; the `@` alias works; `extractErrorMessage` prints the message and `details[]` into the alert (not provided); `flattenProductFields` returns `{ productId, value }` for `product_<id>` fields (not provided).
6. Where the spec says only a status is binding, only the status is asserted; where it gives a message (VA-2.3 example, VA-5.4 `droppedAllocations`, VA-8.5), the message is asserted.
7. Nothing in production code or in the approved expected results was changed.

## Failing tests and implementation discrepancies

**Result of the run: none found.** All risk-listed tests below passed.

The code read matched the spec. Every row of the spec's F2 table is marked resolved in code, and the code read matches: 200 on write, the Q3 filter in save and reconcile, the entity check for zero entries, invalid rows excluded from gate coverage.

Tests that were flagged as highest risk before the run (all passed):

| Test | Why |
| --- | --- |
| V-141 | Two concurrent first saves. The loser may surface as a unique violation (409 stale) or a serialization failure retried into a token mismatch (409). Both are expected; a 5xx would be a defect. |
| V-110, V-111, V-181 | They rely on the single-record-per-cell reuse (VA-7.6) and on the flag-then-not-reconcile rule (VA-7.3) in the same transaction. These are the code paths changed in the last revision and were never run. |
| V-62 | Asserts `flaggedAnomalies: 1` when a 0 entry clears a row on a vehicle that was deactivated (derived from VA-6.3 and VA-7.1: the row is invalid, so evidence is stored). If the code treats an explicit 0 differently, this will show it. |
| V-103, V-103b | Depend on the exact "later write reconciles" timing of VA-7.2 and VA-7.3. |
| V-180 | Depends on the Q17 change (invalid rows excluded from gate coverage). |
| V-170 to V-179 | Frontend, written blind against the unseen shared helpers (assumptions 5). |

Spec ambiguities noticed while writing (no test invented around them):

1. **V-95** as written in the matrix is not reachable literally (see "Adapted", item 4). The matrix row should be clarified.
2. **V-33 / V-111 / V-181** need a DB seam to create a FLAGGED record on the cell of a still-stored row. No API sequence produces that state, which is also a hint that VA-7.3's "already flagged and invalid again" case is narrow.
3. **VA-5.4 and V-93:** an empty `allocations` array over only invalid rows is accepted without confirmation, while over valid rows it needs `confirmDeletions`. This follows from the spec as written; worth a one-line note in VA-5.13.