# Collections module: scenario-to-test coverage map

**Status: backend specs executed, 105 of 106 passed on the first run; the one failure (S-46b, defect D-16) is fixed in `src/common/transactions/validation/duplicate-entry.ts` and needs a re-run. Frontend specs (S-150 to S-155) are written and not yet run.**

| File | Tests | First run |
| --- | --- | --- |
| access | 9 | pass |
| reads | 17 | pass |
| validation | 20 | 19 pass, S-46b failed (fixed) |
| workflow | 9 | pass |
| save | 24 | pass |
| concurrency | 14 | pass |
| gates | 13 | pass |
| **Total** | **106** | **105 pass, 1 fail** |

Re-run after the fix: `npx vitest run src/modules/transactions/collections/` (expected 106 of 106), then the Orders specs, because `duplicate-entry.ts` is shared. UI: `npx vitest run src/features/paper/modules/sheet-level/collections/test/`.

Sources of truth: `Collections_Module_Behavioral_Specification_Discovery.md` (sections C and F3) and `COLLECTION_BUSINESS_DECISION.md`. The implementation was read only to learn how to drive it.

## Verified against orders-harness.ts

| Check | Result |
| --- | --- |
| `ctx.call(method, path, token, body)` accepts `null` / `undefined` token (no header) | OK |
| `ctx.setStatus`, `ctx.tokens.{emp,emp2,admin}`, `ctx.tokenFor`, `ctx.users`, `ctx.db`, `ctx.prisma`, `ctx.app` exist | OK |
| `world.scene()` returns `{ group, products, clients, sheet:{paperId, sheetId, saleDate} }`; clients buy both categories by default | OK |
| `world.addClient({ group, name, categories })`, `addGroup`, `addUser(role, active)` | OK (`code` is not an option, so codes are set with a DB update) |
| **App modules** | **Gap found and fixed.** The harness mounts only Auth, Orders, VehicleAllocation, Purchase. `collections-harness.ts` passes `modules: [CollectionsModule, PaperModule]` through `opts.modules` |
| Cleanup | Papers are deleted first (cascades `client_collection`), then master data. Clients created in specs are cleaned by `world.cleanup()` |

## Files

| File | Scenarios | Tests |
| --- | --- | --- |
| `test/helper/collections-harness.ts` | shared setup (`ctx.col`: get, save, raw, seed, seedRow, tokenOf, rows, row, paperUpdatedAt) | - |
| `collections.scenario.access.spec.ts` | S-01 to S-09 | 9 |
| `collections.scenario.reads.spec.ts` | S-10 to S-26 | 17 |
| `collections.scenario.validation.spec.ts` | S-30 to S-48, S-46b | 20 |
| `collections.scenario.workflow.spec.ts` | S-50 to S-57, S-59 | 9 |
| `collections.scenario.save.spec.ts` | S-60 to S-80, S-130, S-131, S-137 | 24 |
| `collections.scenario.concurrency.spec.ts` | S-90 to S-99, S-132 to S-135 | 14 |
| `collections.scenario.gates.spec.ts` | S-110 to S-117, S-122, S-123 | 13 |
| `test/collections-ui.harness.tsx`, `collections.scenario.ui.spec.tsx` | S-150 to S-155 | 10 (not yet run) |

Place backend specs in `src/modules/transactions/collections/`, the helper in `test/helper/`, the UI files in `src/features/paper/modules/sheet-level/collections/test/`. Every title starts with its scenario ID (`vitest -t "S-68"`).

## Coverage map

| Scenario | Test(s) | Note |
| --- | --- | --- |
| S-01 to S-05, S-07 to S-09 | access: same IDs | S-01 covers GET + six saves x 3 bad tokens |
| S-06 | access: S-06 | own app with the real throttle guard; also asserts the per-endpoint bucket (CD-11) |
| S-10 to S-20, S-22 to S-26 | reads: same IDs | |
| S-21 | reads: S-21 | spec marks it "implemented, not yet run" |
| S-30 to S-45, S-47, S-48 | validation: same IDs | amount rules run on all three phases |
| S-46 | validation: S-46 | |
| S-46b | validation: S-46b | **extra**: defect D-16 (id repeated for 3+ occurrences). Failed on the first run, fixed in the implementation |
| S-50 to S-57 | workflow: same IDs | each status x phase x category, exact messages |
| S-59 | workflow: S-59 | uses `POST /papers/:id/revert-morning` (needs PaperModule) |
| S-60 to S-76 | save: same IDs | S-67 uses 2 of 5 clients, S-73 one bad among 6 (not 45 / 50): the rule is the same, setup cost is lower |
| S-77 to S-80, S-130, S-131, S-137 | save: same IDs | spec marks most "implemented, not yet run" |
| S-90 to S-95, S-99 | concurrency: same IDs | S-90 and S-99 use real parallel requests |
| S-96, S-97, S-98 | concurrency: same IDs | **fault seams**: spy on `CollectionsRepository` (P2034 x3, P2028, thrown Error) |
| S-132 to S-135 | concurrency: same IDs | CD-7.2, read through `order_paper.updated_at` |
| S-110, S-111, S-115 | gates: same IDs | call `CollectionsValidationService` directly |
| S-112, S-113, S-114 | gates: same IDs | **DB seam** (negative stored amount, not reachable through the API, D-15) |
| S-112b, S-113b, S-114b, S-116 | gates | same gates observed through `GET /papers/:id/readiness` |
| S-117 | gates: S-117 | `POST /papers/:id/submit-night` returns Orders + Collections problems together |
| S-122, S-123 | gates: same IDs | |
| S-150 to S-155 | ui: same IDs | S-151b, S-151c, S-153b are sub-cases |

## Not implemented (blockers, not guesses)

| Scenario | Reason |
| --- | --- |
| S-58 (save races a Paper submit/finalize) | Needs a real submit to succeed, which depends on Paper preconditions (readiness, allocation, purchases). Same blocker as Orders S-124. |
| S-100 (Cash Settlement save with an old token is 409) | The Cash Settlement controller / DTO / response shape was not provided. The cause side is covered by S-132 to S-135 (`order_paper.updated_at`). |
| S-136 (Distributor Transfer save with an old token is 409) | Same: Distributor Transfer API not provided. |
| S-120, S-121 (Cash Settlement route cash is `cash_collection` only; reflects a REOPENED correction) | Need the Cash Settlement read API. Testing the calculator with hand-built input would not test Collections. |

## Results, defects and discrepancies

1. **S-46b failed on the first run (defect D-16), now fixed.** `duplicateKeys` pushed an id once per extra occurrence, so an id sent three times was listed twice. The helper now collects into a Set. It is shared with Orders; the Orders two-occurrence message is unchanged. Documented in CD-5.5, discovery section G and the discovery D-16 row.
2. **Previously "implemented, not yet run" backend scenarios all passed:** S-21, S-71, S-137, S-43, S-77, S-80, S-130, S-131, S-132 to S-135. The fault seams (S-96, S-97, S-98) and DB seams (S-112 to S-114) passed. The Paper-dependent tests (S-59, S-112b to S-114b, S-116, S-117) passed, so PaperModule mounts correctly through `opts.modules`.
3. **S-22 header wording (D-12):** group headers are "Night Entry", "Morning Entry", "Admin Entry" in code. CD-3.7 gives no literal text and the matrix says "OK in content", so groups are matched by prefix while fields, nesting and order are asserted exactly.
4. **S-155 pins current behavior** (CD-8.6, open question Q16). If Q16 is decided differently, this test must be amended with the decision.
5. **Frontend specs not yet run:** S-150 to S-155 have no result. Check first: the `@` alias, jsdom and testing-library, and that `@/shared/api/error` reads the backend `message`.
6. **Other documents updated:** `COLLECTION_BUSINESS_DECISION.md` (CD-5.5, CD-7.3, change log), `PAPER_BUSINESS_DECISION.md` (PA-8.11 now lists Collections cash saves as advancing `order_paper.updated_at`), `Collections_Module_Behavioral_Specification_Discovery.md` (statuses, S-46b, new section G). The CS-10.3 amendment is now applied in the Cash Settlement decision file.

## Assumptions

1. Specs build their own master data via the harness (prefix `T-`), as the Orders specs do; papers use 2091+ sale dates.
2. No Redis: queue, relay and processor are stubbed by orders-harness; Collections does not use them.
3. The success status is 200 (CD-11.1, already decided). S-130 asserts it.
4. Token comparisons use ISO strings; "advances strictly forward" is asserted with `getTime()` greater-than.
5. `status` for the paper is set directly with `ctx.setStatus`, exactly as the Orders specs do.
6. UI: needs `jsdom` and `@testing-library/react`, the `@` alias in vitest, and `CollectionsPage` at `../pages/CollectionsPage`. `@/shared/api/error` (not provided) is used for real and must read the backend body's `message`. The auth store is mocked with a mutable role. Grids are told apart by DOM order (milk first).
7. Approved expected results were not changed. The only production change is the D-16 fix in `duplicate-entry.ts`, made after the test run and at your request.

## Still open from the spec (not testable here)

- Second observer of `["collections","sheet",id]` (would refetch on mount and swap the token): needs a code search, not a test.
- Reports module (D-17), Q12 cap value (placeholder, S-37 asserts the placeholder 10,000,000).