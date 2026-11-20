# Paper Module: Behavioral Specification Discovery

**Scope:** `modules/transactions/paper/` (controller, service, repository, validation service, DTOs, constants, date util), the paper workflow block and transitions, the propagation outbox (retry/dismiss/summary), the finalize-time dependency orchestration, and the frontend Paper context/api/types.
**Status:** Discovery (sections A to E describe the code and spec BEFORE revision 2). Section F records the decisions made on the open questions and the resulting changes. No tests were written. No code was compiled or run.
**Evidence read:** `PAPER_BUSINESS_DECISION.md` (PA-1..PA-20), all Paper backend files, `workflow-state.service.ts`, `workflow.builder.ts`, dependency register/orchestrator, propagation outbox repository/relay/processor/constants, gate collaborators (`purchase-validation`, `dairy-trays-validation`, `distributor-transfer-validation`, `distributor-transfer-propagation`), `all-exceptions.filter`, `main.ts` (ValidationPipe whitelist + forbidNonWhitelisted), `roles.guard`, `user-throttler.guard`, `parse-id.pipe`, `transaction-runner`, `db-errors`, frontend `PaperContext.tsx`, `paper.api.ts`, `paper.types.ts`, `error.ts`.
**Not available (see E):** existing Paper tests/bug history, Paper UI pages/components, the frontend `utils/error` file that `PaperContext` imports, `schema.prisma` Paper models (not re-read), Orders/Collections/Vehicle Allocation/Cash Settlement implementation (their gates are treated as black boxes defined by their own decision files).

**Labels.** `[C]` confirmed requirement (PA-n, or a sibling decision id). `[O]` observed in code only. `[I]` inferred. `[U]` unknown. **Impl column:** OK = code matches the requirement; D-n = discrepancy in section D; U = cannot be judged from what was read; Seam = depends on another module's gate.

Ground rule applied: `PAPER_BUSINESS_DECISION.md` is the requirement baseline (it states "if code and this file disagree, this file wins"). Code was used as evidence, not as the source of expected results.

---

# A. Feature Behavior Map

## A.1 What Paper is
Paper owns one record per business day (`order_paper`) and the day's lifecycle. It holds no business data of its own. It decides when the day may move to the next stage by asking other modules whether they are ready, and on finalize it triggers follow-up work (distributor transfers now, tray recalculation later). `[C PA preamble]`

## A.2 Capabilities (endpoints)

| # | Capability | Endpoint | Role | Throttle/min | Input | Output | Side effects |
|---|---|---|---|---|---|---|---|
| 1 | Generate / backfill | `POST /papers` | EMPLOYEE (past date needs ADMIN) | 10 | optional `{date, reason}` | paper + sheets + workflow (HTTP 200, PA-12 as amended) | paper, sheets, dairy-tray header, audit (`GENERATED` / `GENERATED_BACKFILL`); idempotent |
| 2 | Current papers | `GET /papers/current` | EMPLOYEE | global | none | `{dates, delivery, ordering}` each `{paper, workflow, propagation}` or null | none |
| 3 | Lookup by sale date | `GET /papers?date=` | EMPLOYEE | global | strict date | `{paper, workflow, propagation}` or 404 | none |
| 4 | Paged list | `GET /papers` | EMPLOYEE | global | `page`, `pageSize` | `{total, page, pageSize, items[{paper, workflow}]}` | none |
| 5 | Read one | `GET /papers/:paperId` | EMPLOYEE | global | id | `{paper+sheets, workflow, propagation}` | none |
| 6 | Propagation status | `GET /papers/:paperId/propagation` | EMPLOYEE | global | id | summary | none |
| 7 | Readiness dry run | `GET /papers/:paperId/readiness` | EMPLOYEE | 30 | id | `{paperId,status,action,ready,problems,warnings,requiredActions}` | none intended |
| 8 | Mark no-operation | `POST /papers/:paperId/sheets/no-operation` | EMPLOYEE | 20 | `{sheetIds[1..200], noOperation}` | `{paper, workflow, propagation}` | sheet flag, audit if changed |
| 9 | Submit night | `POST .../submit-night` | EMPLOYEE | 10 | none | paper + workflow | status, timestamp, audit |
| 10 | Submit morning | `POST .../submit-morning` | EMPLOYEE | 10 | none | paper + workflow | status, timestamp, audit |
| 11 | Finalize | `POST .../finalize` | ADMIN | 10 | none | paper + workflow + propagation + warnings[] | status, timestamp, outbox rows, distributor transfers, audit |
| 12 | Reopen | `POST .../reopen` | ADMIN | 10 | `{reason}` | paper + workflow + propagation | status, timestamp, reason, audit |
| 13 | Revert morning | `POST .../revert-morning` | ADMIN | 10 | `{reason}` | paper + workflow | status, clears morning timestamp, audit |
| 14 | Propagation retry | `POST .../propagation/retry` | ADMIN | 10 | none | `{requeued}` | FAILED→PENDING, attempts 0, audit if n>0 |
| 15 | Propagation dismiss | `POST .../propagation/dismiss` | ADMIN | 10 | `{reason}` | `{dismissed}` | FAILED→DISMISSED, audit if n>0 |
| 16 | Propagation problems | `GET /papers/propagation/problems` | ADMIN | global | none | up to 200 outbox rows | none |
| 17 | Audit read | `GET /papers/:paperId/audit` | ADMIN | global | id | newest 500 entries with user | none |

## A.3 State machine `[C PA-2.1, PA-18]`
`DRAFT → NIGHT_SUBMITTED → MORNING_SUBMITTED → FINALIZED → REOPENED → FINALIZED`, plus admin revert `MORNING_SUBMITTED → NIGHT_SUBMITTED`. No skips. Error class: "already done" 409, "wrong stage" 400, "missing" 404 `[C PA-2.3]`.

## A.4 Gate map (what each transition asks of other modules)

| Action | Gates (all run, all failures collected, `[C PA-6.4/7.4/8.6]`) |
|---|---|
| Night submit | Orders night (non-exempt sheets), Collections night (every sheet), Vehicle Allocation night |
| Morning submit | Per sheet: Orders morning + quantity sanity (non-exempt), Collections morning; then Vehicle Allocation morning, Purchase, Dairy Trays, Distributor transfer rules, Cash Settlement |
| Finalize from MORNING_SUBMITTED | previous-paper rules (409), transfer rules, Collections admin per sheet |
| Finalize from REOPENED | previous-paper rules (409), completion checks minus Vehicle Allocation and Cash Settlement, Collections admin; cash findings become warnings |

## A.5 Finalize side effects (same transaction, order matters `[C PA-8.7]`)
1. Outbox row `CLIENT_TRAYS_FORWARD`. 2. Distributor transfer rebuilt synchronously. 3. Outbox row `DAIRY_TRAYS_FORWARD`. Then status FINALIZED + `finalized_at` + audit. Any failure rolls everything back. Order in code follows the register order `[O]`, OK.

## A.6 Background propagation
Outbox (`PENDING→PROCESSING→DONE|FAILED|DISMISSED`) → relay every 5 s (batch 20, 10 s dispatch timeout, 5 attempts) → BullMQ → processor in chunks of 20. HttpException inside the processor is converted to `UnrecoverableError` and fails the row immediately with details in `last_error`. Stuck `PROCESSING` > 2 min is requeued. Rows untouched > 10 min are reported as problems. `[C PA-10]` / `[O]`.

## A.7 Cross-module coupling
- `order_paper.updated_at` is the optimistic token for Cash Settlement, Distributor Transfer and some Collections saves. Paper status actions advance it, no-operation marking does not. `[C PA-8.11, PA-17.6]`
- Paper status drives what other modules allow (`WorkflowStateService`, matches PA-2.4 `[O]`).
- Distributor Transfer manual generate: REOPENED only, token on `updated_at`.

## A.8 Frontend map
`PaperProvider` loads `getAll` + `getCurrent`, selects `delivery ?? ordering`, else shows "no paper" at the ordering date. Actions: generate (also backfill with date+reason), submit night/morning, finalize (stores warnings per paper), reopen/revert/dismiss (return true on success), no-operation (uses the response directly), retry. Polls propagation every 5 s while `IN_PROGRESS`. Errors are swallowed into a single `error` string. No readiness call is exposed by the context.

---

# B. Requirement and Evidence Inventory

## B.1 Confirmed requirements `[C]` (grouped; each is cited by PA id)

| Group | Requirement | Source |
|---|---|---|
| Access | JWT on all; ADMIN passes EMPLOYEE endpoints; role matrix and throttles | PA-1.1, 1.2 |
| Access | All employees read all papers; audit admin-only | PA-1.3, 20.3 |
| Workflow | Transitions, status matrix, error classes | PA-2.1–2.3 |
| Workflow | FINALIZED = financially closed, not "downstream settled" | PA-2.5 |
| Dates | IST calendar; sale = order + 1; strict `YYYY-MM-DD`; unique dates | PA-3.1–3.4 |
| Generate | Default = ordering paper; future rejected; idempotent; DRAFT picks up new groups; deactivated groups keep sheets; concurrent safe | PA-4.1–4.6 |
| Backfill | ADMIN, reason ≤1000, window 31 days (placeholder), audit `GENERATED_BACKFILL`, role from JWT | PA-4.8, 4.9 |
| Backfill | Later papers' stored openings stale until finalize; finalize may be out of order | PA-4.10 |
| Read | `current`, `date` lookup, paging table, id format, route order | PA-5.1–5.6 |
| Night | Check order; gates; no tray-ledger check; all problems together; exemptions | PA-6 |
| Morning | Check order; seven gates; `requiredActions`; exemptions | PA-7 |
| Finalize | Check order; sequential rule; previous FAILED blocks; re-finalize gates; warnings; triggers and order; `finalized_at` overwritten | PA-8 |
| Reopen | Reason rules; order of checks; no readiness, no chronological rule; response has propagation | PA-9 |
| Propagation | Summary, problems, retry, dismiss rules | PA-10 |
| Transactions | Serializable, one transaction per write, no token on Paper actions, 30 s / 10 s limits, 3 attempts, error body | PA-11 |
| Status codes | 400/404/409/401/403/429 table | PA-12 |
| Workflow block | Flag values per status; advisory only | PA-13 |
| Frontend | Contract (current, flags as hints, handle 409, readiness before irreversible, show `details[]`) | PA-16 |
| No-operation | Endpoint, DRAFT only, idempotent, no token advance | PA-17 |
| Revert | Endpoint, consequences | PA-18 |
| Readiness | Same collectors; snapshot; sign-off announced | PA-19 |
| Audit | One row per action in same transaction; no row for no-ops; scope | PA-20 |

## B.2 Business invariants (derived from `[C]`)
- **INV-1** Exactly one paper per sale date and per order date; order = sale − 1.
- **INV-2** Status only changes along the allowed transitions, each in one serializable transaction with its audit row.
- **INV-3** A failed submit/finalize changes nothing (all-or-nothing, including outbox and audit).
- **INV-4** Every submit/finalize failure caused by data (HttpException) lists all independent problems, deduplicated.
- **INV-5** A paper cannot be FINALIZED unless the nearest earlier paper is FINALIZED and has no FAILED propagation row.
- **INV-6** Finalize and the Paper write audit commit together; reads and no-op calls never audit.
- **INV-7** The readiness endpoint never changes data.
- **INV-8** Warnings never block.
- **INV-9** Dismissed rows are never retried, never block, never listed as problems.
- **INV-10** `updated_at` advances for status actions, not for no-operation marking.

## B.3 Security constraints
- Backfill authority comes from the JWT role, never the body `[C PA-4.8]`.
- Whitelist + forbid-non-whitelisted rejects unknown body fields `[O main.ts, C PA-9.1]`.
- Error bodies mask unexpected errors; request id returned `[C PA-11.5, O]`.
- Throttle tracker is the JWT subject, falling back to IP `[O user-throttler.guard]`. A handler without `@Roles` is denied by `RolesGuard` `[O]`.

## B.4 Observed implementation behavior not covered by a requirement `[O]`
1. POST handlers have no `@HttpCode`, so success is **201**. PA-12 lists no success codes; sibling modules pinned 200 on writes.
2. Generating again on a DRAFT paper that gains sheets writes no audit row.
3. `retry` does not clear `last_error`; the row returns to PENDING with the old error text.
4. `enqueue` reuses an existing PENDING row with the same type/paper/resume id instead of creating another.
5. `retry`/`dismiss` check only that the paper exists, not its status.
6. `getCurrentPapersService` and `getPaperByIdService` run `summarizeForPaper` (two queries) per paper.
7. `collectCashWarnings` is not wrapped in `collect()`, so an HttpException there would escape as that error rather than as an aggregated 400.
8. `getReadiness` uses RepeatableRead and the 30 s limit; Prisma cannot mark it read-only, so "read-only" depends on collectors not writing.
9. `executePaperToDistributorTransfer` has no scope assertion (siblings assert CURRENT/FORWARD).
10. `getPapers` validates `page`/`pageSize` even when `date` is given.
11. Unused constants: `MAX_FUTURE_DAYS`, `SUCCESS_MESSAGES`, `INVALID_PAPER_ID`, `NO_PAPERS_FOUND`.
12. `ParseIntPipe` behavior for `1.5` depends on the installed NestJS version `[U]`.

## B.5 Inferred `[I]`
- I-1 Throttle limits are per route per user (Nest throttler keys by handler), not shared across all Paper endpoints. PA-1.2 says "per user per minute" per endpoint.
- I-2 Reopen being allowed during in-flight propagation is intended (no rule against it).
- I-3 `retry`/`dismiss` on any paper status is intended (PA is silent).
- I-4 Generate by an EMPLOYEE for an existing past paper returning it (not 403) is intended; PA-4.3 says "whatever the caller's role".

## B.6 Unknowns `[U]`
Listed in E (Q-numbers).

---

# C. Behavioral Scenario Matrix

Format: ID | Initial state | Action / input | Expected observable result | Expected state / side effects | Evidence | Impl.
"Gate" = the gate collaborator decides; Paper only reports it.

## C.1 Access and throttling

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-AC-1 | any | any Paper endpoint without valid JWT | 401 | none | PA-1.1 | OK |
| P-AC-2 | logged in EMPLOYEE | finalize, reopen, revert-morning, propagation retry/dismiss, problems, audit | 403 | none | PA-1.1 | OK |
| P-AC-3 | logged in ADMIN | generate, read, readiness, no-operation, submit-night/morning | allowed | as normal | PA-1.1 | OK |
| P-AC-4 | paper exists | EMPLOYEE reads any paper, propagation, readiness | 200 for any paper | none | PA-1.3 | OK |
| P-AC-5 | same user | 11th generate / submit / finalize / reopen / revert / retry / dismiss in a minute | 429 | none | PA-1.2 | OK `[I-1]` |
| P-AC-6 | same user | 21st no-operation / 31st readiness in a minute | 429 | none | PA-1.2 | OK |
| P-AC-7 | two users, same IP | each uses own quota | independent counters | none | O user-throttler | OK |

## C.2 Generate and backfill

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-G-1 | no paper for tomorrow (IST), ≥1 active group | POST /papers, no body | paper DRAFT, sale = tomorrow IST, order = today IST, one sheet per active group (session copied), workflow for DRAFT | dairy-tray header created; audit `GENERATED` (sheets count, saleDate) | PA-4.1, 4.2, 4.7 | OK (201, D-7) |
| P-G-2 | paper for that date exists | POST again | same paper id returned | no new rows, no audit | PA-4.3 | OK |
| P-G-3 | existing paper in each of the 5 statuses | POST again, EMPLOYEE and ADMIN | returns paper with its real status and workflow | nothing changed (except P-G-4) | PA-4.3, 2.2 | OK |
| P-G-4 | DRAFT paper; a group activated after generation | POST again | paper returned with a new sheet for that group | existing sheets untouched; **no audit today** | PA-4.4, PA-20.1 | D-8 |
| P-G-5 | paper past DRAFT; new active group | POST again | unchanged paper | no sheet added | PA-4.4 | OK |
| P-G-6 | group deactivated after generation | POST again / any read | sheet still present | none | PA-4.5 | OK |
| P-G-7 | no active groups, no paper | POST | 400 `No active groups found to generate sheets` | nothing created (paper insert rolled back) | PA-4.2 | OK |
| P-G-8 | none | `date` = tomorrow IST | same as no date | audit `GENERATED` (not backfill) | PA-4.1 | OK |
| P-G-9 | none | `date` later than tomorrow | 400 message naming latest allowed date | nothing created | PA-4.1 | OK |
| P-G-10 | none | `date` = `2026-1-5` / `abc` / number | 400 `date must be in YYYY-MM-DD format` | none | PA-3.4 | OK |
| P-G-11 | none | `date` = `2026-02-31` | 400 `Invalid date format` | none | PA-3.4 | OK |
| P-G-12 | none | unknown extra body field | 400 | none | PA-4 header | OK |
| P-G-13 | no paper for past date | EMPLOYEE with `date` in past | 403 `Only an administrator…` | none | PA-4.8.1 | OK |
| P-G-14 | no paper for past date | ADMIN, missing / blank / whitespace reason | 400 reason required | none | PA-4.8.2 | OK |
| P-G-15 | same | ADMIN, reason 1001 chars | 400 | none | PA-4.8.2 | OK |
| P-G-16 | same | ADMIN, reason 1000 chars (after trim) | created | audit `GENERATED_BACKFILL` with reason | PA-4.8 | OK |
| P-G-17 | same | ADMIN date = ordering date − 31 / − 32 | − 31 created; − 32 → 400 `up to 31 days back` | as above | PA-4.9 | OK (placeholder, Q10) |
| P-G-18 | past paper already exists | EMPLOYEE with that `date`, no reason | existing paper returned, no 403/400 | none | PA-4.3, 4.8 ("only when created") | OK `[I-4]` |
| P-G-19 | past `date`, no active groups, ADMIN | 400 no active groups (admin and reason checks pass first) | nothing created | PA-4.2 | OK |
| P-G-20 | 00:30 IST (18:30 UTC previous day) | POST with no body | sale date = IST tomorrow, not UTC tomorrow | none | PA-3.1 | OK |
| P-G-21 | none | two concurrent POSTs, same date | both succeed with the same paper id; exactly one paper | one audit row | PA-4.6 | OK (by code) |
| P-G-22 | none | unique violation with no paper for that date | error propagated (409 via filter) | none | PA-4.6 | OK |
| P-G-23 | none | non-backfill call with a `reason` | reason ignored; audit `reason` null | none | O (G-code) | OK `[O]` |
| P-G-24 | none | transaction exceeds 10 s | 409 "took too long, nothing was saved" | nothing saved | PA-11.3 | OK (Seam) |
| P-G-25 | backfill created | reads of the new paper | rates as of its own sale date (Orders), sheets for groups active now | none | PA-4.8 | Seam |

## C.3 Reads

| ID | Initial state | Action | Expected result | Evidence | Impl |
|---|---|---|---|---|---|
| P-R-1 | delivery and ordering papers exist | GET /papers/current | `dates.delivery`=today IST, `dates.ordering`=tomorrow; both objects with real workflow flags and propagation | PA-5.1 | OK |
| P-R-2 | none exist | GET /papers/current | both null, dates still present | PA-5.1 | OK |
| P-R-3 | only one exists | GET /papers/current | the other null | PA-5.1 | OK |
| P-R-4 | paper exists | GET /papers?date=YYYY-MM-DD, with `page`/`pageSize` | paper view; paging ignored | PA-5.2 | D-6 (paging params still validated) |
| P-R-5 | no paper | GET /papers?date=… | 404 `Order paper not found` | PA-5.2 | OK |
| P-R-6 | any | `date` = `2026-02-31` or `2026-1-5` | 400 | PA-5.2, 3.4 | OK |
| P-R-7 | many papers | GET /papers | `{total,page:1,pageSize:50,items}` newest sale date first; items have no sheets/propagation | PA-5.3 | OK |
| P-R-8 | many papers | page=0, page=−3 | applied page 1 | PA-5.4 | OK |
| P-R-9 | many papers | pageSize=0 / omitted / 500 / −4 | 50 / 50 / 200 / 1; response echoes applied values | PA-5.4 | OK |
| P-R-10 | any | page=abc, page=1.5, pageSize=1.5 | 400 | PA-5.4 | U (Nest version for 1.5, Q12) |
| P-R-11 | no papers at all | GET /papers | spec table row: 404 | PA-12 | D-5 |
| P-R-12 | paper exists | GET /papers/7, /papers/007 | both 200 for id 7 | PA-5.6 | OK |
| P-R-13 | any | ids `0`, `-1`, `abc`, `1.5`, `2147483648` | 400 `Invalid id` | PA-5.6 | OK |
| P-R-14 | none | id 2147483647 not existing | 404 | PA-5.5 | OK |
| P-R-15 | any | GET /papers/current and /papers/propagation/problems | not parsed as ids | PA-5.6, 10.5 | OK |
| P-R-16 | any | `date=` (empty) | treated as list | O | OK `[O]` |
| P-R-17 | paper with propagation rows | GET /papers/:id/propagation | status per rule: FAILED if any failed; else IN_PROGRESS if pending/processing; else COMPLETE; counts include all rows; dismissed counted, ignored for status | PA-10.2 | OK |
| P-R-18 | none | GET propagation of missing paper | 404 | PA-10.2 | OK |

## C.4 No-operation routes

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-N-1 | DRAFT, sheets unmarked | mark 2 sheets true | refreshed `{paper, workflow, propagation}`, both sheets `no_operation: true` | audit `SHEET_OPERATION_CHANGED` (noOperation, changed 2, ids, route names); `updated_at` NOT advanced | PA-17.5, 17.6, 20.1 | OK |
| P-N-2 | DRAFT, sheets already marked | mark same again | same response | no change, no audit | PA-17.6 | OK |
| P-N-3 | one marked, one not | mark both | changed = 1 | audit lists requested ids, changed=1 | PA-17.6, O | OK |
| P-N-4 | DRAFT | unmark | flag false | audit | PA-17.5 | OK |
| P-N-5 | status ≠ DRAFT | mark | 400 `…only while the paper is DRAFT (paper is X)` | none | PA-17.5 | OK |
| P-N-6 | DRAFT | include a sheet of another paper | 400 listing the foreign ids | nothing changed (all-or-nothing) | PA-17.5 | OK |
| P-N-7 | DRAFT | `sheetIds` empty / 201 items / duplicates / non-int / 0 / >2147483647 / noOperation missing or non-boolean / unknown field | 400 | none | PA-17.5 | OK |
| P-N-8 | no such paper | mark | 404 | none | PA-17.5 | OK |
| P-N-9 | DRAFT, sheet marked and has an order line | night submit | sheet is still validated for night "at least one >0" (PA-6.5 exempts the mark; see Q14) | none | PA-6.5, 17.4 | Seam |
| P-N-10 | open Cash Settlement screen | mark no-op, then CS save | CS save succeeds (token unchanged) | none | PA-17.6, 8.11 | OK |

## C.5 Night submit

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-NS-1 | DRAFT, every non-exempt sheet has a line with ordered qty > 0; no negative night collections; VA night passes | submit-night | paper + workflow with NIGHT_SUBMITTED | `night_entry_submitted_at` set; audit from DRAFT to NIGHT_SUBMITTED; `updated_at` advances | PA-6 | OK |
| P-NS-2 | status NIGHT/MORNING/FINALIZED/REOPENED | submit-night | 409 `Night entries were already submitted (paper is X)` | none | PA-2.2, 6.1 | OK |
| P-NS-3 | no such paper | submit-night | 404 | none | PA-6.1 | OK |
| P-NS-4 | active unmarked sheet with no lines | submit-night | 400 `Night submission is not ready`, details name the sheet | none | PA-6.2, 6.5 | Seam |
| P-NS-5 | sheet whose lines are blank or all zero | submit-night | 400 | none | PA-6.2 | Seam |
| P-NS-6 | marked sheet with no lines | submit-night | passes the Orders check | none | PA-6.5 | OK |
| P-NS-7 | deactivated group, sheet has no lines | submit-night | passes the Orders check | none | PA-6.5(b) | OK |
| P-NS-8 | deactivated group, sheet has lines, all zero | submit-night | 400 (checked like any other) | none | PA-6.5 | OK |
| P-NS-9 | one sheet has negative stored night amount | submit-night | 400, detail prefixed `Sheet "<name>": ` | none | PA-6.2 | OK |
| P-NS-10 | VA night check fails | submit-night | 400 includes VA detail | none | PA-6.2 | Seam |
| P-NS-11 | several sheets and modules fail | submit-night | one 400 with all details, deduplicated | none | PA-6.4 | OK |
| P-NS-12 | sheet orders only non-tray products or <1 tray | submit-night | NOT blocked | none | PA-6.3 | OK |
| P-NS-13 | every sheet marked | submit-night | Orders check passes everywhere; VA passes empty | NIGHT_SUBMITTED | PA-17.2 | OK |
| P-NS-14 | a collector raises a non-HTTP error | submit-night | request fails at once (500 masked) | nothing saved | PA-6.4 | OK |
| P-NS-15 | any | submit-night with a body | body ignored | none | PA-11.6 | OK (ValidationPipe, no DTO) |
| P-NS-16 | NIGHT_SUBMITTED | ordered quantities edited in Orders | rejected by Orders | none | PA-6 intro, OD-2.2 | Seam |

## C.6 Morning submit

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-MS-1 | NIGHT_SUBMITTED, all seven gates pass | submit-morning | MORNING_SUBMITTED | `morning_entry_submitted_at`, audit, `updated_at` advances | PA-7 | OK |
| P-MS-2 | MORNING_SUBMITTED / FINALIZED / REOPENED | submit-morning | 409 `Morning entries were already submitted (paper is X)` | none | PA-7.1 | OK |
| P-MS-3 | DRAFT | submit-morning | 400 `Cannot transition from DRAFT to MORNING_SUBMITTED` | none | PA-7.1 | OK |
| P-MS-4 | no such paper | submit-morning | 404 | none | PA-7.1 | OK |
| P-MS-5 | a non-exempt sheet has a line without delivered qty, or no line, or negative delivered | submit-morning | 400 with `Sheet "x": …` | none | PA-7.2.1 | Seam |
| P-MS-6 | negative stored morning collection | submit-morning | 400 prefixed | none | PA-7.2.2 | Seam |
| P-MS-7 | VA morning fails | submit-morning | 400 | none | PA-7.2.3 | Seam |
| P-MS-8 | allocation without saved purchase / stale / orphan | submit-morning | 400 purchase details | none | PA-7.2.4 | Seam |
| P-MS-9 | no allocation >0 and no sign-off | submit-morning | 400, body `requiredActions:["SIGN_OFF_ZERO_ALLOCATION"]` and the purchase sign-off detail | none | PA-7.4, 19.5 | OK |
| P-MS-10 | failure not related to sign-off | submit-morning | 400 with `requiredActions: []` | none | PA-7.4 | OK |
| P-MS-11 | after sign-off recorded, no allocation | submit-morning | purchase gate passes | MORNING_SUBMITTED | PA-17.2 | Seam |
| P-MS-12 | dairy tray header missing / return > balance / negative closing | submit-morning | 400 | none | PA-7.2.5 | Seam |
| P-MS-13 | supplier/owner pair without transfer rule | submit-morning | 400 with the rule message | none | PA-7.2.6 | OK |
| P-MS-14 | **two** pairs without rules | submit-morning | 400 listing **both** pairs | none | PA-7.4 | **D-1** (only the first is listed) |
| P-MS-15 | route mismatch or deposit exceeds cash | submit-morning | 400 | none | PA-7.2.7 | Seam |
| P-MS-16 | marked or deactivated-group sheet with no lines | submit-morning | Orders checks skipped; Collections still run | none | PA-7.5 | OK |
| P-MS-17 | marked sheet that has lines | submit-morning | validated like any other | none | PA-7.5, 17.3 | OK |
| P-MS-18 | many failures | submit-morning | one 400, all details, deduplicated, in gate order | none | PA-7.4 | OK |
| P-MS-19 | duration > 30 s | submit-morning | 409 timeout message | nothing saved | PA-11.3 | OK |

## C.7 Finalize

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-F-1 | MORNING_SUBMITTED; nearest earlier paper FINALIZED (or none); no missing rules; admin collections fine | finalize (ADMIN) | paper + workflow(FINALIZED) + `propagation` (normally IN_PROGRESS) + `warnings: []` | `finalized_at`; outbox `CLIENT_TRAYS_FORWARD`, `DAIRY_TRAYS_FORWARD` PENDING; distributor transfers rebuilt; audit | PA-8.1, 8.5, 8.7 | OK |
| P-F-2 | FINALIZED | finalize | 409 `Paper is already FINALIZED` | none | PA-8.1 | OK |
| P-F-3 | DRAFT / NIGHT_SUBMITTED | finalize | 400 `Cannot transition from X to FINALIZED` | none | PA-8.1 | OK |
| P-F-4 | no such paper | finalize | 404 | none | PA-8.1 | OK |
| P-F-5 | nearest earlier paper (even across a date gap) not FINALIZED | finalize | 409 `…previous paper (YYYY-MM-DD) is X. Finalize it first.` | none | PA-8.2 | OK |
| P-F-6 | first paper ever | finalize | no predecessor check | proceeds | PA-8.2 | OK |
| P-F-7 | previous paper has a FAILED outbox row | finalize | 409 propagation message naming the date | none | PA-8.4 | OK |
| P-F-8 | previous paper has only PENDING/PROCESSING/DISMISSED rows | finalize | not blocked | proceeds | PA-8.4 | OK |
| P-F-9 | previous FAILED row retried to DONE, or dismissed | finalize | not blocked | proceeds | PA-8.4 | OK |
| P-F-10 | an OLDER-than-previous paper has FAILED | finalize | not blocked | visible in problems list | PA-8.4 | OK |
| P-F-11 | MORNING_SUBMITTED; missing transfer rule(s) and negative admin collection | finalize | 400 `Finalization is not ready` with all details | none | PA-8.6 | OK / D-1 |
| P-F-12 | MORNING_SUBMITTED | finalize does **not** re-run Orders/VA/Purchase/Dairy/Cash gates | nothing else checked | none | PA-8.6.2 | OK |
| P-F-13 | REOPENED; corrections valid | finalize | re-runs completion checks except VA and Cash; FINALIZED | `finalized_at` overwritten; audit; outbox rows (PENDING dedup) | PA-8.3 | OK |
| P-F-14 | REOPENED; purchase stale or delivered qty missing | finalize | 400 | none | PA-8.3 | OK |
| P-F-15 | REOPENED; route mismatch / deposit problem | finalize | succeeds; `warnings[]` each prefixed `Cash settlement: ` | warnings stored in audit `details.warnings` | PA-8.9 | OK |
| P-F-16 | REOPENED; VA locked | finalize | VA gate not called | none | PA-8.3 | OK |
| P-F-17 | REOPENED; previous paper not FINALIZED | finalize | 409 | none | PA-8.2 | OK |
| P-F-18 | distributor transfer step throws | finalize | error | status unchanged, no outbox rows, no audit | PA-8.7, 11.1 | OK (by tx) |
| P-F-19 | EMPLOYEE | finalize | 403 | none | PA-1.1 | OK |
| P-F-20 | two ADMINs click together | finalize | one 200; other 409 (already FINALIZED or serialization conflict) | one audit row, one set of outbox rows | PA-11.2 | OK |
| P-F-21 | backfilled paper earlier than finalized later papers | finalize | allowed (nearest earlier is FINALIZED) | forward propagation refreshes later sheets | PA-4.10 | OK |
| P-F-22 | same, later paper holds a return exceeding refreshed balance | finalize, wait | propagation row FAILED with list in `last_error` | blocks next finalize until retry/dismiss | PA-4.10 | Seam |
| P-F-23 | stray DRAFT earlier paper exists | finalize a later paper | 409 previous paper is DRAFT | none | PA-8.2, 14.15 | OK (open item) |
| P-F-24 | after finalize | `propagation` read | reflects true state, usually IN_PROGRESS | none | PA-2.5, 8.5 | OK |
| P-F-25 | MORNING_SUBMITTED | finalize and readiness agree | readiness `ready` true ⇔ finalize passes (no concurrent edits) | none | PA-19.3 | OK |

## C.8 Reopen

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-RO-1 | FINALIZED | reopen `{reason}` | paper + workflow(REOPENED) + propagation | `reopened_at`, `reopen_reason` (trimmed), audit with same reason, `updated_at` advances | PA-9 | OK |
| P-RO-2 | REOPENED | reopen | 409 `Paper is already REOPENED` | none | PA-9.2 | OK |
| P-RO-3 | DRAFT / NIGHT / MORNING | reopen | 400 `Cannot transition from X to REOPENED` | none | PA-9.2 | OK |
| P-RO-4 | missing paper | reopen | 404 | none | PA-9.2 | OK |
| P-RO-5 | FINALIZED | reason `""`, spaces only, number, missing, 1001 chars, extra field | 400 | none | PA-9.1 | OK |
| P-RO-6 | FINALIZED | reason of 1000 chars, or with surrounding spaces | accepted; stored trimmed | as P-RO-1 | PA-9.1 | OK |
| P-RO-7 | older paper FINALIZED, newer ones FINALIZED | reopen older | allowed; no readiness, no chronological rule | newer papers untouched | PA-9.3 | OK |
| P-RO-8 | FINALIZED with DONE propagation | reopen | propagation rows unchanged | none | PA-9.3 | OK |
| P-RO-9 | EMPLOYEE | reopen | 403 | none | PA-1.1 | OK |
| P-RO-10 | reopened | other modules | delivered qty, tray returns, purchases, collections editable; allocations, direct collections, bank deposits locked | none | PA-2.4, 9.5 | Seam |

## C.9 Revert morning submit

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-RV-1 | MORNING_SUBMITTED | revert `{reason}` (ADMIN) | paper + workflow(NIGHT_SUBMITTED) | `morning_entry_submitted_at` null; `night_entry_submitted_at` unchanged; audit `MORNING_REVERTED` with reason; `updated_at` advances | PA-18.2, 18.4 | OK |
| P-RV-2 | DRAFT / NIGHT / FINALIZED / REOPENED | revert | 400 `Only a MORNING_SUBMITTED paper can be reverted…(paper is X)` | none | PA-18.2, 2.2 | OK |
| P-RV-3 | any | missing paper / invalid reason / EMPLOYEE | 404 / 400 / 403 | none | PA-18.2, 9.1 | OK |
| P-RV-4 | after revert | submit-morning | full completion checks run again | none | PA-18.4 | OK |
| P-RV-5 | previous paper not FINALIZED | revert | allowed (no previous or chronological rule) | none | PA-18.4 | OK |
| P-RV-6 | after revert | direct collections / allocation / purchases edit | editable per NIGHT_SUBMITTED surface | none | PA-18.3 | Seam |

## C.10 Readiness

| ID | Initial state | Action | Expected result | Evidence | Impl |
|---|---|---|---|---|---|
| P-RD-1 | DRAFT | GET readiness | `action: SUBMIT_NIGHT`; `problems` equal to what night submit would return | PA-19.2, 19.3 | OK |
| P-RD-2 | DRAFT, no allocation, no sign-off | GET readiness | warning text about zero-allocation sign-off; `ready` unaffected; `requiredActions: []` | PA-19.5.1 | OK |
| P-RD-3 | NIGHT_SUBMITTED, no allocation, no sign-off | GET readiness | `action: SUBMIT_MORNING`, `requiredActions:["SIGN_OFF_ZERO_ALLOCATION"]`, purchase message in `problems` | PA-19.5.2 | OK |
| P-RD-4 | MORNING_SUBMITTED | GET readiness | `action: FINALIZE`; previous-paper block listed first in `problems` if any | PA-19.2 | OK |
| P-RD-5 | REOPENED | GET readiness | as above plus cash findings in `warnings`; VA/Cash gates not in `problems` | PA-8.3, 19.2 | OK |
| P-RD-6 | FINALIZED | GET readiness | `action: null`, `ready: false`, empty lists | PA-19.2 | OK |
| P-RD-7 | any | GET readiness | no row changes anywhere, `updated_at` unchanged, no audit | PA-19.1, INV-7 | U (Q13) |
| P-RD-8 | no such paper | GET readiness | 404 | PA-19.2 | OK |
| P-RD-9 | any | `ready` | true only with an action and zero problems; problems deduplicated | PA-19.2 | OK |
| P-RD-10 | any | readiness vs real action with the same data | same failures | PA-19.3 | OK |
| P-RD-11 | any | heavy paper | no serialization failure to employees saving concurrently | PA-19.4 | OK (RepeatableRead) |

## C.11 Propagation (admin) and the outbox

| ID | Initial state | Action | Expected result | State/side effects | Evidence | Impl |
|---|---|---|---|---|---|---|
| P-PR-1 | paper with 2 FAILED rows | retry | `{requeued:2}` | rows PENDING, attempts 0; audit `PROPAGATION_RETRIED` `{requeued}` | PA-10.4 | OK (last_error kept, Q2) |
| P-PR-2 | no FAILED rows | retry | `{requeued:0}` | no audit | PA-10.4 | OK |
| P-PR-3 | retried row whose cause persists | wait | FAILED again with same detail | none | PA-10.4 | Seam |
| P-PR-4 | paper with FAILED rows | dismiss `{reason}` | `{dismissed:n}` | rows DISMISSED (kept); audit with reason and ids/types/errors | PA-10.6 | OK |
| P-PR-5 | no FAILED rows | dismiss | `{dismissed:0}` | no audit | PA-10.6, 20.1 | OK |
| P-PR-6 | dismiss | reason missing/blank/1001 chars | 400 | none | PA-10.6 | OK |
| P-PR-7 | dismissed rows | problems list / next finalize / summary | not listed; not blocking; counted in `dismissed`, ignored for `status` | none | PA-10.2, 10.3, 8.4 | OK |
| P-PR-8 | rows FAILED, PENDING/PROCESSING >10 min old, others | GET problems (ADMIN) | FAILED + stuck rows, oldest first, max 200 | none | PA-10.3 | OK |
| P-PR-9 | EMPLOYEE | retry / dismiss / problems | 403 | none | PA-1.1 | OK |
| P-PR-10 | missing paper | retry / dismiss | 404 | none | O | OK `[O]` |
| P-PR-11 | PENDING row | relay tick | claimed, queued within about 5 s, PROCESSING→DONE | none | PA-10.1 | OK |
| P-PR-12 | PROCESSING row untouched 2 min | relay | back to PENDING | none | CT-10.6, O | OK |
| P-PR-13 | worker business failure (HttpException) | process | FAILED immediately, `last_error` = message + up to 25 details | none | PA-10.1, O | OK |
| P-PR-14 | transient failure | process | retried up to 5 attempts with backoff, then FAILED | none | PA-10.1 | OK |
| P-PR-15 | Redis unreachable | relay | each dispatch times out at 10 s, attempt counted, FAILED after 5 | none | O relay | OK `[O]` |
| P-PR-16 | PENDING row with identical type/paper/resume | enqueue again | existing row reused | no duplicate | O | OK `[O]` |
| P-PR-17 | FAILED row exists, paper re-finalized and new row DONE | read summary / finalize next | old FAILED row still counts (status FAILED, next finalize blocked) | none | PA-8.4, 10.2 | OK literally, see Q2 |
| P-PR-18 | propagation in flight | reopen | allowed | none | I-2 | U (Q11) |

## C.12 Audit

| ID | Action | Expected | Evidence | Impl |
|---|---|---|---|---|
| P-AU-1 | each successful Paper action | exactly one audit row, correct action, from/to status, reason where required | PA-20.1 | OK |
| P-AU-2 | failed action (any 4xx/5xx) | no audit row (same transaction) | PA-20.1, 11.1 | OK |
| P-AU-3 | generate returning existing / retry or dismiss with 0 rows / no-op marking | no audit | PA-20.1 | OK except P-G-4 (D-8) |
| P-AU-4 | GET audit (ADMIN) | newest first, ≤500, with `user` | PA-20.3 | OK |
| P-AU-5 | GET audit, EMPLOYEE / missing paper | 403 / 404 | PA-20.3 | OK |
| P-AU-6 | acting user deleted | `user_id` null, row kept | PA-20.1 | U (schema not re-read) |
| P-AU-7 | paper deleted | audit rows deleted with it | PA-20.3 | U (schema) |
| P-AU-8 | re-finalize with warnings | `details.warnings` stored | PA-8.9 | OK |

## C.13 Concurrency, transactions, errors

| ID | Scenario | Expected | Evidence | Impl |
|---|---|---|---|---|
| P-C-1 | double click submit-night | one 2xx, other 409 `already…` or conflict message | PA-11.2 | OK |
| P-C-2 | serialization failure | up to 3 total attempts (100 ms, 200 ms), then 409 conflict message | PA-11.4 | OK (by code) |
| P-C-3 | write exceeds its limit (10 s, or 30 s for the three heavy ones) | 409 "took too long, nothing was saved", state unchanged | PA-11.3 | OK |
| P-C-4 | Paper status action then a Cash Settlement or Distributor Transfer save with the old token | 409 stale | PA-8.11 | Seam |
| P-C-5 | Collections save of a positive cash_collection or changed stored amount, then Paper action | Paper unaffected; CS/DT tokens stale | PA-8.11 | Seam |
| P-C-6 | Orders save racing night submit | submit sees one snapshot (validated data equals committed data) | PA-11.1 | OK (Serializable) |
| P-C-7 | readiness racing saves | may differ from real action; real action rechecks | PA-13.2, 19.4 | OK |
| P-C-8 | DB unique / FK / not-found errors | 409 / 409 / 404 with `requestId` | PA-11.5 | OK |
| P-C-9 | unexpected error | 500 `Internal server error` with `requestId` and header | PA-11.5 | OK (header: Seam, middleware) |
| P-C-10 | retry/dismiss racing finalize | plain transaction; finalize sees committed state | PA-11.1 | U |

## C.14 Workflow flags

| ID | Status | Expected `{activeExecutionSession, canSubmitNight, canSubmitMorning, canFinalize, canReopen, canRevertMorning, canMarkNoOperation}` | Impl |
|---|---|---|---|
| P-W-1 | DRAFT | NIGHT, T, F, F, F, F, T | OK |
| P-W-2 | NIGHT_SUBMITTED | MORNING, F, T, F, F, F, F | OK |
| P-W-3 | MORNING_SUBMITTED | null, F, F, T, F, T, F | OK |
| P-W-4 | FINALIZED | null, F, F, F, T, F, F | OK |
| P-W-5 | REOPENED | null, F, F, T, F, F, F | OK |
| P-W-6 | any | flags are advisory: action still rechecked server-side | PA-13.2 | OK |
| P-W-7 | any | flags are the paper's real ones for both `delivery` and `ordering` | PA-5.1 | OK |

## C.15 Frontend behavior (Paper context)

| ID | Scenario | Expected | Evidence | Impl |
|---|---|---|---|---|
| P-FE-1 | load with delivery and ordering papers | shows `delivery`; else `ordering`; else "no paper" at ordering date | PA-5.1, 16.1 | OK |
| P-FE-2 | `ordering` null | UI offers Generate with no body | PA-16.1 | U (UI not provided) |
| P-FE-3 | `delivery` null, ADMIN | UI offers backfill with date + reason | PA-16.1 | U |
| P-FE-4 | generate | reloads paper, list and current | PA-16 | OK |
| P-FE-5 | finalize with warnings | warnings kept tied to that paper id; cleared on reopen | PA-8.9, 16.6 | OK |
| P-FE-6 | propagation IN_PROGRESS | polls every 5 s until COMPLETE or FAILED; FAILED shows `failures[]` | PA-16.6 | OK |
| P-FE-7 | 400 with `details[]` | list shown, every problem | PA-16.4 | U (needs `utils/error`; the provided `error.ts` reads only `message`, D-2) |
| P-FE-8 | 409 on any action | reload the paper | PA-16.2, 16.9 | **D-4** (no reload) |
| P-FE-9 | 429 | "Too many requests" message | O | OK |
| P-FE-10 | reopen/revert/dismiss | resolve true only on success so a form can close | O | OK |
| P-FE-11 | action changes status | `current` (delivery/ordering flags) refreshed | PA-5.1 | **D-4** |
| P-FE-12 | readiness before irreversible action | `problems[]`, `warnings[]`, `requiredActions` used, no text matching | PA-16.3 | **D-3 / U** |
| P-FE-13 | no-operation toggle | response replaces selection; `isUpdatingSheets` only | PA-17.5 | OK |

---

# D. Implementation-versus-Spec Discrepancy Report

Severity: **High** = can cause wrong business state or blocks users with no way out; **Medium** = spec promise broken or user-visible confusion; **Low** = cosmetic, doc, or edge.

| ID | Sev | Spec says | Code does | Impact | Evidence |
|---|---|---|---|---|---|
| D-1 | Medium | PA-6.4/7.4/8.6: all problems are reported together, including every missing transfer rule | `validateTransferRules` throws at the first missing supplier/owner pair, so `collect()` records one detail | A user fixing a day with several missing rules discovers them one at a time (one submit/readiness cycle each) | `distributor-transfer-validation.service.ts`, `paper-validation.service.ts` `collect` |
| D-2 | Medium | PA-16.4: show `details[]` as a list | Provided shared `error.ts` builds the message from `message` only and has no `extractErrorMessage`/`nullIfNotFound`; `PaperContext` imports those from `../utils/error` which was not provided and whose comment promises multi-line output | Cannot confirm; if `utils/error` is similar to the provided file, aggregated problems are lost | `error.ts`, `PaperContext.tsx` (Q9) |
| D-3 | Low | PA-19.2/16.3: readiness carries `requiredActions` and the screen must not parse text | `PaperReadiness` type has no `requiredActions`; `PaperContext` exposes no readiness method | Screens cannot use the typed signal for the sign-off button | `paper.types.ts`, `PaperContext.tsx` |
| D-4 | Medium | PA-16.2: always handle 409 by reloading; PA-5.1: flags are the real ones | Action failures only set `error`; no reload. Successful actions refresh `selectedPaper` and the list but never `current` (only `createPaper` reloads it) | Stale buttons after a conflict; `current.delivery/ordering.workflow` stays stale after submit/finalize/reopen/revert/no-op | `PaperContext.tsx` |
| D-5 | Low | PA-12: "no papers in the system" → 404 | `GET /papers` with no papers returns 200 `{total:0, items:[]}`; `NO_PAPERS_FOUND` is unused | Documentation conflict; the 200 is the sensible behavior, spec row is probably stale | `paper.service.ts`, `paper.constants.ts` |
| D-6 | Low | PA-5.2: `page`/`pageSize` are ignored when `date` is given | `ParseIntPipe`/`DefaultValuePipe` still run, so `?date=…&page=abc` returns 400 | Edge only | `paper.controller.ts` |
| D-7 | Low (spec gap) | PA-12 lists no success statuses; sibling modules pinned 200 on write endpoints | All Paper POSTs return 201 | A contract test written either way is a guess; frontend does not care | `paper.controller.ts` (no `@HttpCode`) |
| D-8 | Low | PA-4.4 adds sheets on re-generate of a DRAFT paper; PA-20.1 audits actions and says only calls that change nothing write nothing | Sheet creation on re-generate is unaudited | A data change with no history | `addMissingSheetsWhileDraft` |
| D-9 | Low | PA-3.5 documents unused constants as non-rules | Still unused: `MAX_FUTURE_DAYS`, `SUCCESS_MESSAGES`, `INVALID_PAPER_ID`, `NO_PAPERS_FOUND` | Dead code (the spec already acknowledges most) | `paper.constants.ts` |
| D-10 | Low | PA-19.4: "read-only transaction" | Prisma cannot set read-only; guarantee relies on every collector being write-free (not verified for Cash/Dairy/Purchase `get…` helpers) | If any collector wrote, readiness would commit it | `getReadinessService` (Q13) |
| D-11 | Low | PA-8.6: all failures collected | `collectCashWarnings` (REOPENED re-finalize) is outside `collect()`, so an HttpException there surfaces as that error alone | Unlikely path (needs the cash paper missing) | `paper-validation.service.ts` |
| D-12 | Low | PA-10.4 retry "does not fix the cause" | `last_error` of a requeued row is kept, so a row PENDING again still shows the old error text until processed | Misleading in problems list only | `requeueFailedForPaper` |
| D-13 | Info | Orchestrator handlers assert scope | `executePaperToDistributorTransfer` does not | No behavior impact today | `dependency-orchestrator.service.ts` |

**Behaviors the implementation appears unable to satisfy, or the spec leaves unreachable**
- U-1 A stray DRAFT paper can never be removed, and PA-8.2 makes it block every later finalize (PA-14.15, known open).
- U-2 A paper backfilled with the groups active **now**, not those active then (PA-4.8, accepted).
- U-3 A FAILED outbox row cannot be superseded by a later successful job for the same paper; only retry or dismiss clears it (see Q2).
- U-4 PA-8.2/8.4 look only at the nearest earlier paper; older stuck papers or failures are invisible to finalize (PA-4.10, PA-8.4 acknowledge).
- U-5 "All problems together" cannot be met for transfer rules without changing the validator (D-1).

**No discrepancy found (spot checks that matched):** check order for night/morning/finalize/reopen/revert, status codes per PA-2.2, workflow flag table (PA-13.1), transitions, throttle numbers, DTO limits (reason ≤1000, sheetIds 1..200 unique ints), id parsing (`007` ok), `finalize` side-effect order, audit action names, transfer-rule gate at finalize of MORNING_SUBMITTED, the PA-8.3 exemptions, `requiredActions` passing through the exception filter, and per-route throttles.

---

# E. Open Questions (all decided, see F)

| # | Question | Why it matters | Options | Suggested owner |
|---|---|---|---|---|
| Q1 | Stray or mistaken paper (PA-14.15): add an admin "void/skip paper" action? | Today one wrong DRAFT blocks every later finalize permanently | (a) Void action with reason and audit; (b) Allow finalize to skip an explicitly voided paper; (c) Keep as is | Business owner |
| Q2 | After a FAILED row, a later finalize/retry creates or completes other rows. Should a stale FAILED row be superseded when a newer job for the same paper/type succeeds? Should retry clear `last_error`? | The next paper's finalize stays blocked (PA-8.4) and the status stays FAILED even though newer work succeeded | (a) Keep literal (admin must retry/dismiss); (b) Auto-supersede older FAILED rows of the same type on DONE; (c) Clear `last_error` on retry only | Business owner + dev |
| Q3 | Should retry/dismiss be limited by paper status (for example only FINALIZED/REOPENED papers)? | Currently any paper with FAILED rows | (a) No limit (as is); (b) FINALIZED/REOPENED only | Business owner |
| Q4 | Fix D-1 in code (collect every missing rule) or relax PA-6.4/7.4/8.6 for transfer rules? | Spec says all problems together | (a) Change validator to collect all pairs; (b) Amend spec | Dev lead |
| Q5 | Pin success status of Paper POSTs: 200 (as siblings) or 201 (as now)? | Needed before contract tests | (a) 200 everywhere; (b) 201 for generate only; (c) keep 201 | Dev lead |
| Q6 | Empty system: keep 200 empty list and amend PA-12, or return 404? | Spec/code conflict | (a) Amend spec; (b) change code | Dev lead |
| Q7 | Audit sheet creation on re-generate of a DRAFT paper? | Data change with no history | (a) Add audit entry; (b) Document as not audited | Business owner |
| Q8 | Should `page`/`pageSize` be ignored (not validated) when `date` is given (D-6)? | Spec text vs behavior | (a) Ignore; (b) amend spec | Dev lead |
| Q9 | Frontend: can you provide `utils/error.ts` (the one with `extractErrorMessage`/`nullIfNotFound`) and the Paper pages? Should errors reload the paper and refresh `current`? | D-2, D-3, D-4 cannot be closed without it | Provide files; decide on reload-on-409 and refresh `current` | Frontend lead |
| Q10 | Confirm placeholders: `PAPER_TRANSACTION_TIMEOUT_MS` (30 s) and `MAX_BACKDATE_DAYS` (31) | PA-14.1, 14.10 open | Measure on largest real paper; confirm window | Business owner |
| Q11 | Is reopening a paper while its propagation is IN_PROGRESS or FAILED allowed? Any rule for finalizing while its own propagation runs? | PA is silent | (a) Allowed (as is); (b) block while IN_PROGRESS | Business owner |
| Q12 | Which NestJS version is in use? Does `ParseIntPipe` accept `1.5`? | PA-5.4 says non-integers → 400 | Confirm version; add a test either way | Dev lead |
| Q13 | Confirm that no readiness collector (Cash, Dairy, Purchase, Distributor `get…`/`load…`) writes or upserts | Readiness commits its transaction; any write would persist | Review those helpers or assert unchanged rows in a test | Dev lead |
| Q14 | Marked no-operation sheet that already has order lines at night submit: is the sheet skipped (code) or validated (PA-17.4 says "checked like any other")? | PA-6.5(a) skips the Orders check for any marked sheet; PA-17.4 and PA-7.5 say lines are validated | (a) Night: skip when marked (as is, PA-6.5); (b) validate when lines exist, like morning | Business owner |
| Q15 | Existing papers in the same minute at IST midnight: generate decides "tomorrow" at request time. Is a day-rollover mid-session acceptable? | Frontend `current` may hold yesterday's dates | Accept; or have UI refetch at rollover | Business owner |
| Q16 | PA-1.3: should reads be scoped per group/branch in future? | Currently every employee sees every paper | Keep; or scope later | Business owner |
| Q17 | Any existing Paper tests, bug history, issues or migrations that should be read? None were in the project | Needed to find "historical bug fix" evidence per the discovery process | Provide or confirm none | Dev lead |

**Note on Q14.** PA-6.5(a) says a no-operation sheet is exempt at night, while PA-17.4 says a marked sheet with lines is validated like any other. The code follows PA-6.5(a) (`skipsNightOrdersCheck` returns true for any marked sheet). I did not pick a side; it is reported as a conflict between PA-6.5 and PA-17.4.

---


# F. Revision 2: decisions and resulting changes

Sections A to E are the state before this revision. Where they differ from F, F wins.

## F.1 Decisions on the open questions

| Q | Decision | Effect |
|---|---|---|
| Q1 | Keep as is (PA-14.15 stays open) | No void action; needs its own business decision |
| Q2 | Auto-supersede older FAILED rows of the same paper/type/resume point when a newer row reaches DONE (they become DISMISSED); retry clears `last_error` | PA-10.4, PA-10.7; `markDone`, `requeueFailedForPaper` |
| Q3 | No status gating on retry/dismiss | PA-10.8 |
| Q4 | Validator collects every missing supplier/owner pair | PA-7.2.6, PA-8.6, PA-8.11; `validateTransferRules` |
| Q5 | 200 on every Paper POST | PA-12, PA-4.7; `@HttpCode(200)` on all 10 POST handlers |
| Q6 | Empty system returns 200 with an empty list | PA-5.3, PA-12 amended |
| Q7 | Sheet additions on re-generate of a DRAFT paper are audited as `GENERATED` with `existingPaper: true`, `sheetsAdded`, `groupIds` | PA-4.4, PA-20.1 |
| Q8 | Paging values are still validated when `date` is given | PA-5.2 amended |
| Q9 | Frontend files provided; reload on 409, refresh `current` after every action, `requiredActions` typed | PA-16; `PaperContext.tsx`, `paper.types.ts` |
| Q10 | Keep 30 s and 31 days, still placeholders | PA-14.1, PA-14.10 |
| Q11 | Reopen and finalize allowed in any propagation state | PA-9.3 |
| Q12 | Non-integer paging values give 400 (assumes current Nest `ParseIntPipe`; not verified) | PA-5.4 |
| Q13 | Reviewed collectors: none found writing; standing rule that collectors never write | PA-19.4 |
| Q14 | Night: a marked sheet is exempt regardless of lines. Morning: exempt only when it has no lines. Removes the PA-6.5 / PA-17.4 conflict | PA-17.2, PA-17.4 |
| Q15 | Day rollover mid-session accepted; `current` is refreshed after every action | PA-5.1 |
| Q16 | Reads stay unscoped | PA-1.3 |
| Q17 | No Paper tests exist; nothing to read | none |

## F.2 Discrepancies after revision

| ID | Status |
|---|---|
| D-1 | Fixed in code |
| D-2 | Closed: provided `utils/error.ts` renders `details[]` |
| D-3, D-4 | Fixed in frontend |
| D-5, D-6 | Spec amended to match code |
| D-7 | Fixed (200) |
| D-8 | Fixed (audited) |
| D-9, D-11, D-13 | No change by decision |
| D-10 | Reviewed, standing rule added |
| D-12 | Fixed (`last_error` cleared on retry) |
| U-3 | Resolved by supersede rule (PA-10.7) |

## F.3 Scenario expectations that changed

P-G-1 and every Paper POST success: 200 (not 201). Re-generate of a DRAFT paper with new groups now writes one `GENERATED` audit row. Several missing transfer rules produce one detail per pair. A FAILED row followed by a later DONE row of the same key becomes DISMISSED and stops blocking finalize. Retry leaves `last_error` null. After any action or a 409 the frontend reloads the selected paper and `current`. Marked sheet with order lines at night submit passes the Orders check; at morning submit it is validated.

New scenario P-PR-19: FAILED row id 5, later DONE row id 9, same paper/type/resume point: row 5 becomes DISMISSED, summary status COMPLETE, next paper's finalize is not blocked. Rows with other types or resume points are unaffected.

## F.4 Not changed and caveats
Distributor Transfer generate still returns 201 (outside Paper). Nothing was type-checked or run: only syntax was verified for the six changed files.

*End of document. No automated tests were generated.*
