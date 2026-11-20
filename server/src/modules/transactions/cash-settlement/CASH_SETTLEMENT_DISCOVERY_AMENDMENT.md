# Cash Settlement discovery: amendment after the first automated run

Apply to `Cash Settlement Module Behavioral Specification Discovery.md`. Nothing in `CASH_SETTLEMENT_BUSINESS_DECISION.md` changes: no approved behavior was wrong, and no implementation defect was found. One scenario row in the discovery matrix carried an **inferred** expectation that the run showed to be wrong.

Run: backend 160 of 161, frontend 13 of 14 on the first run. Both failures were defects in the new tests (S-121, S-152). Both are fixed in the delivered specs; a re-run is expected to give backend 162 of 162 and frontend 15 of 15.

---

## 1. Replace the S-121 row (section C10)

Old row:

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-121 | A Collections cash save and a Cash Settlement save race | One winner | PA-11.1 \[I\] | OK |

New rows:

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-121 | A Collections save that changes a `cash_collection` and a Cash Settlement save (holding the token it loaded) race | Collections is always 200: it advances whatever `order_paper.updated_at` is current and never sends or compares a Cash Settlement token. The Cash Settlement save is 200 or 409. If Collections commits first the Cash Settlement save is 409 and writes nothing. If the Cash Settlement save commits first both are 200. The token moves forward either way and the route cash is the saved value | CD-7.2, CS-10.3, PA-11.1 | OK (verified by test run) |
| S-121b | A Cash Settlement save, then a Collections cash save (no Cash Settlement token involved) | Both 200. The token moves forward twice | CD-7.2 | OK (verified by test run) |

Why the old row was wrong: "one winner" was an inference [I] from PA-11.1 (serializable transactions). It treated the coupling as a mutual compare-and-fail between the two modules. CD-7.2 and CS-10.3 describe a one-way effect: a changed Collections cash amount advances Cash Settlement's token, so an **already open** Cash Settlement screen is stale on its next save. Collections itself is never refused because of that token. The deterministic half of the rule (Collections first, then a Cash Settlement save with the old token is 409) is S-120.

## 2. Add to the F3 table (new scenarios)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| S-152b | The user adds an expense line and leaves the amount at 0, then presses Save expenses | The screen shows the "Invalid expense" error toast and sends nothing (the page refuses any amount below 0.01) | CS-5.4, CS-18.4 | OK (verified by test run) |
| S-121b | see above | | CD-7.2 | OK (verified by test run) |

## 3. Frontend contract note (CS-18)

The screen validates before sending: every expense needs an amount from 0.01 to 10,000,000 and an expense type. A newly added line starts at 0 and so cannot be saved until an amount is typed. This is the client-side mirror of CS-5.4 (zero rejected) and is not a new rule. It could be added to CS-18.4 as a one-line clarification, but that is the business owner's call (see section 6).

## 4. New section G: automated test run

Add after section F.

### G. Automated test run

Specs: `src/modules/transactions/cash-settlement/cash-settlement.scenario.*.spec.ts` plus `test/helper/cash-settlement-harness.ts`, and the UI spec in `src/features/paper/modules/paper-level/cash-settlement/test/`. Scenario-to-test mapping: `CASH_SETTLEMENT_TEST_COVERAGE.md`.

#### G1. Result of the first run

| File | Tests | Result |
| --- | --- | --- |
| access | 7 | pass |
| reads | 21 | pass |
| validation | 43 | pass |
| workflow | 22 | pass |
| expenses | 14 | pass |
| denominations | 7 | pass |
| direct | 9 | pass |
| deposits | 7 | pass |
| concurrency | 19 | 18 pass, 1 fail (S-121) |
| gates | 12 | pass |
| **Backend total** | **161** | **160 pass, 1 fail** |
| UI | 14 | 13 pass, 1 fail (S-152) |

#### G2. Failures and their cause

- **S-121 (backend).** Expected `[200, 409]`, received `[200, 200]`. Cause: a wrong expectation in the test, derived from the inferred discovery row (section 1). Fixed in the test; S-121b added. No implementation change.
- **S-152 (frontend).** `saveRouteExpenses` was never called. Cause: the test added a line and saved without an amount, and the page correctly refuses a 0 amount. Fixed in the test; S-152b added. No implementation change.

#### G3. Behaviors confirmed by the run

Everything marked "Implemented, not yet run" in section F3 now passes on the backend: S-69 and S-96 (saved lines keep working after their type or bank is deactivated), S-160 and S-161, S-86 (all-zero entry ignored first), S-104 (200 on all four saves), and S-120 (the Collections token coupling). On the frontend: S-156 (a save resets only its own section), S-157 (no refetch on focus or reconnect), S-158 (the timeout 409 keeps the edits), S-162 (stale and exhausted-retry 409 reload and clear), S-163 (400 keeps the edits and lists the details) and S-164 (own-token refetch keeps the drafts). The fault seams S-113, S-114 and S-115 behave as specified. S-36b confirmed that coins 10.005 are stored as 10.01.

#### G4. Scenarios without a test

| Scenario | Reason |
| --- | --- |
| S-53 | A real Paper submit needs preconditions outside this module (same blocker as Orders S-124 and Collections S-58) |
| Submit and finalize in S-119 | Same reason; revert, reopen and no-operation are covered |

## 5. Update the F4 "Still open" list

Replace "Not run: no code change has been compiled or tested, and no Cash Settlement tests exist yet." with:

- **Automated tests exist and ran** (section G). Re-run after the two test fixes: `npx vitest run src/modules/transactions/cash-settlement` (expected 162 of 162) and `npx vitest run src/features/paper/modules/paper-level/cash-settlement/` (expected 15 of 15).

The other F4 items are unchanged (Q5 per-section reset assumption, second observer of the sheet query, masters hooks and Reports not provided, placeholder caps, dead code).

## 6. Optional decision-file clarifications (not applied, need the business owner)

These only make an existing behavior explicit. Apply only if the owner approves, as the decision file requires.

- **CS-10.3 / CD-7.2:** add one sentence: "The coupling is one-way. A Collections save never fails because of Cash Settlement's token; it advances whatever value is current. Only a Cash Settlement screen opened before the Collections save is stale."
- **CS-18.4:** add one sentence: "A new expense line starts at 0 and the screen refuses to send it until an amount of at least 0.01 is entered (CS-5.4)."
