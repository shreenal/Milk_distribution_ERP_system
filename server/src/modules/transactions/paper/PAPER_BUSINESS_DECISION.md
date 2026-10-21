# Paper Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/paper/` only (controller, service, repository, `paper-date.util.ts`, `services/paper-validation.service.ts`, DTOs, constants), plus the paper's own workflow block (`WorkflowBuilder.buildPaperWorkflow`) and the status transitions in `WorkflowStateService.validateTransition`.
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 14 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`PA-n`) are stable. Cite them in code comments, PRs and reviews. Section 15 lists what changed in this version.

**Reference pattern:** Paper owns no business data of its own. It decides WHEN the day may move to the next stage by asking the other modules whether they are ready, and it triggers the follow-up work on finalize. Where this file says "as in Orders / Client Trays / Collections / Vehicle Allocation / Purchase / Dairy Trays / Cash Settlement", the behavior is defined in `ORDERS_BUSINESS_DECISION.md` (OD-n), `CLIENT_TRAYS_BUSINESS_DECISION.md` (CT-n), `COLLECTION_BUSINESS_DECISION.md` (CD-n), `VEHICLE_ALLOCATION_BUSINESS_DECISION.md` (VA-n), `PURCHASE_BUSINESS_DECISION.md` (PD-n), `DAIRY_TRAYS_BUSINESS_DECISION.md` (DT-n) and `CASH_SETTLEMENT_BUSINESS_DECISION.md` (CS-n). Paper never re-implements their rules; it only calls their gates.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Paper | `order_paper`: one record per business day. Everything else (sheets, allocation, purchases, trays, cash, transfers) hangs off it and is deleted with it. |
| Order date | The day the paper is generated and orders are taken (today in Asia/Kolkata). |
| Sale date | Order date + 1 day. The day the goods are delivered and sold. Rates are resolved as of this date. Unique per paper. |
| Sheet | One delivery group's sheet on the paper (`order_sheet`). One per group, created at generation. |
| Status | `DRAFT`, `NIGHT_SUBMITTED`, `MORNING_SUBMITTED`, `FINALIZED`, `REOPENED`. |
| Readiness check | A read-only gate that Paper asks another module to run before a status change. |
| Propagation | Background recalculation of client-tray and dairy-tray balances for later days, recorded as outbox rows and run by a queue worker. |
| Outbox row | One `propagation_outbox` record. Status `PENDING`, `PROCESSING`, `DONE` or `FAILED`. |
| Workflow block | `{ status, activeExecutionSession, canSubmitNight, canSubmitMorning, canFinalize, canReopen }`. Advisory only (PA-13.2). |
| Today's paper | The paper whose SALE date is today in Asia/Kolkata. It is the one being delivered and completed today. It was generated yesterday. |

---

## 1. Access and Roles

**PA-1.1** All Paper endpoints require login (JWT). Employee endpoints also pass for `ADMIN` through the role hierarchy.

| Endpoint | Role |
|---|---|
| `POST /papers` (generate) | EMPLOYEE |
| `GET /papers/today`, `GET /papers`, `GET /papers/:paperId` | EMPLOYEE |
| `GET /papers/:paperId/propagation` | EMPLOYEE |
| `POST /papers/:paperId/submit-night`, `submit-morning` | EMPLOYEE |
| `POST /papers/:paperId/finalize`, `reopen` | ADMIN |
| `POST /papers/:paperId/propagation/retry`, `GET /papers/propagation/problems` | ADMIN |

**PA-1.2** Generate, submit-night, submit-morning, finalize, reopen and propagation retry are each throttled to 10 requests per minute per user. The other endpoints use the global limit. Exceeding a limit returns 429.

**PA-1.3** Every authenticated employee may read every paper, including propagation status. There is no per-group or per-branch scoping of paper reads. *(As implemented, kept.)*

---

## 2. Workflow: statuses and transitions

**PA-2.1 Transitions (binding):**

```
DRAFT -> NIGHT_SUBMITTED -> MORNING_SUBMITTED -> FINALIZED -> REOPENED -> FINALIZED
```

No step can be skipped and there is no way back except reopen. Any other transition is rejected with 400 `Cannot transition from X to Y`.

**PA-2.2 Status matrix of the Paper actions (binding):**

| Paper status | Generate | Submit night | Submit morning | Finalize | Reopen |
|---|---|---|---|---|---|
| DRAFT | returns it (PA-4.3) | Yes | No (400) | No (400) | No (400) |
| NIGHT_SUBMITTED | returns it | No (409) | Yes | No (400) | No (400) |
| MORNING_SUBMITTED | returns it | No (409) | No (409) | Yes | No (400) |
| FINALIZED | returns it | No (409) | No (409) | No (409) | Yes |
| REOPENED | returns it | No (409) | No (409) | Yes | No (409) |

**PA-2.3 "Already done" is 409, "wrong stage" is 400, "missing" is 404.** Examples: submitting night on a non-DRAFT paper is 409 `Night entries were already submitted (paper is X)`; finalizing a NIGHT_SUBMITTED paper is 400.

**PA-2.4 What each status unlocks in the other modules (context only; each module's own file is binding):**

| Paper status | Orders | Vehicle Allocation | Collections | Client Trays, Purchase, Dairy Trays | Cash Settlement |
|---|---|---|---|---|---|
| DRAFT | ordered qty, add/remove product | NIGHT and MORNING | night | no | no |
| NIGHT_SUBMITTED | delivered qty | MORNING only | night, morning | yes | expenses, denominations, direct collections, bank deposits |
| MORNING_SUBMITTED | no | no | admin only | no | no |
| FINALIZED | no | no | no | no | no |
| REOPENED | delivered qty only (OD-2.3) | no (VA-2.4) | night, morning, admin | yes | expenses and denominations only |

**PA-2.5 FINALIZED means "financially closed", not "everything downstream is settled" (binding).** When a paper is finalized, its own figures are final and committed. Client-tray and dairy-tray balances of LATER days are refreshed in the background (Section 10) and may still be in progress or failed. Anything that consumes a finalized paper must read propagation status (PA-8.5) before treating later days' tray balances as settled.

**PA-2.6 No audit trail (binding).** The paper keeps its milestone timestamps (`night_entry_submitted_at`, `morning_entry_submitted_at`, `finalized_at`, `reopened_at`) and only the LATEST `reopen_reason`. A second reopen overwrites the earlier reason, and re-finalizing leaves `reopened_at` untouched. No history table or audit event is added to the Paper module (same as CT-14.1, DT-14.1, VA-12.1). The server request log is the only other record.

---

## 3. Dates

**PA-3.1 Business timezone is `Asia/Kolkata` (binding).** Every date decision uses the Indian calendar day, whatever the server's own timezone. 12:30 am IST belongs to the new day even though it is still the previous day in UTC.

**PA-3.2 Order date and sale date (binding).** Order date = today (IST). Sale date = order date + 1 day. Both are unique in the database, so two papers can never exist for the same day. Both are stored as calendar dates.

**PA-3.3 Two papers are alive at the same time (binding).** The paper being completed today has sale date = today (generated yesterday). The paper being ordered today has sale date = tomorrow (generated today).

**PA-3.4 Strict dates.** A date input must be `YYYY-MM-DD` and a real calendar date. `2026-02-31` and `2026-1-5` are rejected, because JavaScript would silently roll Feb 31 into March. A bad shape is rejected by the DTO (400 `date must be in YYYY-MM-DD format`); a well-formed but impossible date is 400 `Invalid date format`.

**PA-3.5** `DATE_CONFIG.MAX_FUTURE_DAYS` and the `SUCCESS_MESSAGES` block exist in the constants file but nothing uses them. They are not rules. Responses carry no success message.

---

## 4. Generate (`POST /papers`)

Body: optional `{ date?: "YYYY-MM-DD" }`. The frontend normally sends no body. Unknown fields are rejected (400).

**PA-4.1 Current business day only (binding).** A paper can only be generated for the current business day. No past date, no future date. If `date` is sent it must equal the SALE date (tomorrow IST), otherwise 400 `Papers can only be generated for the current business day (sale date YYYY-MM-DD)`. The message names the accepted date. Note that `date` means the sale date, not the order date.

**PA-4.2 What is created (binding).** In one serializable transaction: the paper in DRAFT; one sheet per ACTIVE delivery group, each copying that group's delivery session; and the dairy-tray header for the paper (the Dairy Trays gate at morning submit fails without it, PD-64). If there is no active group: 400 `No active groups found to generate sheets`, and nothing is created.

**PA-4.3 Generating twice is safe (binding).** If a paper with that sale date already exists, it is returned and no second paper is created, whatever its status. The response carries the paper's real `status` and `workflow`, so the frontend can see it is not a fresh DRAFT.

**PA-4.4 A group activated after generation gets its sheet while the paper is DRAFT (binding).** When generate is pressed again on an existing DRAFT paper, a sheet is created for every active group that has none. Existing sheets are never changed or removed. Once the paper is past DRAFT it is returned unchanged and no sheet is added.

**PA-4.5 A group deactivated after generation keeps its sheet.** Its sheet is subject to the readiness checks like any other, except as PA-6.5 / PA-7.5 allow.

**PA-4.6 Concurrent generation.** Two requests for the same day can both pass the "exists" check. The unique sale date makes the loser fail; the loser then re-reads by sale date and returns the winner's paper. A unique violation that finds no paper for that date is NOT treated as success and is re-thrown. The violation is recognised in all the shapes the database driver can surface (`P2002`, `23505`, and the driver-adapter variants), as in the repositories.

**PA-4.7 Response** is the paper row, its sheets (id, group id and name, session) and the workflow block.

---

## 5. Read Endpoints

**PA-5.1 `GET /papers/today` (binding).** Looks for the paper whose sale date is today (IST). If found: `{ type: "TODAY", paper, workflow, propagation }`. If not, it falls back to the latest paper by order date: `{ type: "LATEST", paper, workflow, propagation }`. If there is no paper at all: 404 `No papers found in system`.
For `LATEST` the workflow block is READ-ONLY: `canSubmitNight`, `canSubmitMorning`, `canFinalize` and `canReopen` are all `false` and `activeExecutionSession` is `null`, because that paper is not today's paper and the screen must not invite an action on the wrong business day. The paper can still be worked on through `GET /papers/:paperId`, which returns its real workflow.

**PA-5.2 `GET /papers` with `date`.** The date is parsed strictly (400 `Invalid date format`) and matched against the SALE date. Missing paper: 404 `Order paper not found`. Returns `{ paper, workflow, propagation }`. `page` and `pageSize` are ignored.

**PA-5.3 `GET /papers` without `date`.** Paginated list, newest sale date first: `{ total, page, pageSize, items: [{ paper, workflow }] }`. Items carry no sheets and no propagation.

**PA-5.4 Paging rules (binding):**

| Input | Result |
|---|---|
| `page` omitted | 1 |
| `page` 0 or negative | treated as 1 |
| `page` or `pageSize` not an integer (`abc`, `1.5`) | 400 |
| `pageSize` omitted or 0 | 50 |
| `pageSize` above 200 | 200 |
| `pageSize` negative | 1 |

The response echoes the page and size actually applied.

**PA-5.5 `GET /papers/:paperId`** returns `{ paper (with sheets), workflow, propagation }`, or 404 `Order paper not found`.

**PA-5.6 Paper id format.** A URL id must be digits only, 1 to 2147483647, otherwise 400 `Invalid id`. `007` is accepted as 7.

---

## 6. Night Submit (`POST /papers/:paperId/submit-night`)

No body. Meaning: "tonight's ordering is complete, lock it." After this, ordered quantities are permanently locked (OD-2.2).

**PA-6.1 Order of checks inside the transaction:** paper exists (404) -> status is DRAFT (409) -> readiness checks (400) -> transition is legal -> status NIGHT_SUBMITTED and `night_entry_submitted_at` stamped.

**PA-6.2 Readiness checks (binding).** Paper asks:
1. **Orders**, for every sheet: at least one order line with ordered quantity above 0 (OD-13.1). Blank cells and zeros do not count.
2. **Collections**, for every sheet: no negative stored night amount (CD-10.1).
3. **Vehicle Allocation**, NIGHT session: coverage and data integrity (VA-8).

**PA-6.3 No client-tray ledger check at night submit (binding, changed).** A sheet is NOT required to have a client-tray ledger line. A ledger line exists only if an order line resolves to a tray type and the summed quantity rounds to at least one tray (CT-6.4, CT-7.1); a sheet that orders only non-tray products, or only a fraction of a crate in total, has no ledger line and must still be submittable. The ledger is recalculated on every Orders save, so the former check could never catch a stale calculation. **This supersedes CT-12.1 for the night submit gate; CT-12.1 must be amended (Section 14, PA-14.3).**

**PA-6.4 All problems are reported together (binding, changed).** Every readiness check is read-only, so a failing check does not stop the next one. A failure returns 400 `{ message: "Night submission is not ready", details[] }` listing every failing check across all sheets and modules. Nothing is changed (all-or-nothing). Messages that belong to one sheet name that sheet. Duplicate lines are listed once. Same shape as VA-8.1, PD-54 and CS-12.1. A database or programming error is NOT collected: it fails the request immediately.

**PA-6.5 A deactivated, empty sheet does not block (binding, changed).** A sheet whose delivery group is now inactive AND that has no order line at all is skipped for the Orders check (PA-6.2 item 1). Reason: such a sheet could never satisfy "at least one order" and there is no other way to exclude it. A sheet of an inactive group that DOES have order lines is checked like any other, so recorded data is never left unchecked. An ACTIVE group's empty sheet still blocks (OD-6.15).

---

## 7. Morning Submit (`POST /papers/:paperId/submit-morning`)

No body. Meaning: "delivery and completion work is done; ready for admin sign-off."

**PA-7.1 Order of checks:** paper exists (404) -> status is MORNING_SUBMITTED, FINALIZED or REOPENED (409 `Morning entries were already submitted (paper is X)`) -> status is not NIGHT_SUBMITTED, e.g. DRAFT (400 `Cannot transition from DRAFT to MORNING_SUBMITTED`) -> completion checks (400) -> status MORNING_SUBMITTED and `morning_entry_submitted_at` stamped.

**PA-7.2 Completion checks (binding).** Paper asks, in this order:
1. **Orders**, for every sheet: the sheet has at least one line, and every line has a delivered quantity (OD-13.2, OD-13.3); no negative delivered quantity (OD-13.4).
2. **Collections**, for every sheet: no negative stored morning amount (CD-10.1).
3. **Vehicle Allocation**, MORNING session (VA-8).
4. **Purchase**: every allocation has a saved purchase decision; no stale or orphaned entries; zero-allocation sign-off where required (PD-54).
5. **Dairy Trays**: header exists, balances valid (DT-12.1).
6. **Distributor Transfer**: a transfer rule exists for every supplier and owner pair that needs one.
7. **Cash Settlement**: every route reconciles within the tolerance and deposits do not exceed available cash (CS-12.2, CS-12.3).

**PA-7.3** Delivered quantity 0, over-delivery and the 150% warning are defined by Orders (OD-7.4, OD-7.5), not by Paper.

**PA-7.4 All problems are reported together (binding, changed).** As PA-6.4, with `message: "Morning submission is not ready"`.

**PA-7.5 A deactivated, empty sheet does not block (binding, changed).** As PA-6.5, for the Orders checks (items 1 above: "at least one line", "delivered quantity", "negative quantity"). Collections checks still run for it.

---

## 8. Finalize (`POST /papers/:paperId/finalize`) - ADMIN only

No body. Meaning: "the day is financially closed."

**PA-8.1 Order of checks:** paper exists (404) -> already FINALIZED (409 `Paper is already FINALIZED`) -> status is not MORNING_SUBMITTED or REOPENED (400 `Cannot transition from X to FINALIZED`) -> previous paper rule (PA-8.2, PA-8.4) -> readiness checks (400) -> transition -> propagation (PA-8.7) -> status FINALIZED and `finalized_at` stamped.

**PA-8.2 Sequential finalization (binding).** The nearest paper with an EARLIER sale date must be FINALIZED, otherwise 409 `Cannot finalize: the previous paper (YYYY-MM-DD) is X. Finalize it first.` The nearest existing paper is used, so a missing date does not matter (generation is current-day only, PA-4.1, so a gap can never be filled later). This applies to re-finalizing a REOPENED paper too. The first paper ever has no predecessor and passes. Reason: tray balances and cash flow from day to day, so days must close in order.

**PA-8.3 Re-finalizing a REOPENED paper re-runs the completion checks (binding, changed).** A REOPENED paper can have delivered quantities, tray returns, purchases and collections edited, so "it passed once" says nothing about its current state. The completion checks of PA-7.2 are run again, EXCEPT the Vehicle Allocation gate (item 3). Allocations are locked while a paper is REOPENED (VA-2.4, VA-7.7), so an allocation problem that appeared after the original morning submit (a vehicle or a distributor-product link deactivated since) could not be corrected on the allocation screen and would make the paper impossible to re-finalize. Purchase keeps its own stale and orphan gate against the allocation (PD-37, PD-68), which is the safeguard that remains. The Vehicle Allocation gate still runs at night submit and at morning submit.

**PA-8.4 A failed propagation on the previous paper blocks (binding, changed).** If the previous paper has any `FAILED` outbox row, finalize is refused with 409 `Cannot finalize: background tray propagation for the previous paper (YYYY-MM-DD) has failed. Fix the cause and retry the propagation first.` Only FAILED blocks. `PENDING` and `PROCESSING` do not, because every Orders, Purchase and tray save already recalculates its own ledger synchronously (CT-10.1, DT-10.1) and propagation is the safety net for later days. A FAILED row stops blocking once an admin retries it successfully (PA-10.4).

**PA-8.5 The response reports propagation (binding, changed).** Finalize returns the paper row, the workflow block and `propagation` (the same summary as `GET /papers/:paperId/propagation`). Immediately after finalize it will normally read `IN_PROGRESS`; that is the true state (PA-2.5).

**PA-8.6 Finalize checks (binding).**
1. For a REOPENED paper: the completion checks of PA-8.3.
2. **Collections**, for every sheet: no negative stored admin amount (CD-10.1).
3. **Cash Settlement**: for a REOPENED paper, every route must reconcile route by route (CS-12.5). For a MORNING_SUBMITTED paper this check does nothing, because Cash Settlement data cannot change after morning submit (CS-2.1, CD-2.0), so the morning-submit result still holds.

All problems are reported together as 400 `{ message: "Finalization is not ready", details[] }` (same rule as PA-6.4). The same sheet-skip as PA-7.5 applies to the REOPENED re-check. The previous-paper rules of PA-8.2 and PA-8.4 are 409 and are raised before the checks.

**PA-8.7 What finalize triggers, in the same transaction (binding).** In this order:
1. **Client trays forward:** an outbox row. The worker later recalculates this paper's sheets and refreshes the opening and closing balances of every later sheet of each group (CT-10.5).
2. **Distributor transfer:** done immediately. Delivered quantities supplied by one distributor to a client owned by another are summed, validated against the transfer rules and stored, replacing the paper's previous transfer records (PA-8.8).
3. **Dairy trays forward:** an outbox row, same idea (DT-10.4).

If any step fails, the whole finalize is rolled back and the paper keeps its old status.

**PA-8.8** The distributor-transfer step is the only synchronous propagation. Its work grows with the number of delivered lines on the paper, and it is why submit and finalize have their own time limit (PA-11.3).

---

## 9. Reopen (`POST /papers/:paperId/reopen`) - ADMIN only

Body: `{ reason }`.

**PA-9.1 Reason (binding).** Required, a string, trimmed before validation, non-empty after trimming, at most 1000 characters. `""`, whitespace only, a number, a missing field or an unknown extra field are rejected (400).

**PA-9.2 Order of checks:** paper exists (404) -> already REOPENED (409 `Paper is already REOPENED`) -> status is not FINALIZED (400 `Cannot transition from X to REOPENED`) -> status REOPENED, `reopened_at` = now, `reopen_reason` = the reason.

**PA-9.3 Reopen only unlocks (binding).** It runs no readiness check, has no chronological rule (an older paper can be reopened while newer ones are finalized) and does not undo earlier propagation. Corrections made while REOPENED trigger their own recalculation in the modules that own the data (OD-6.13, CT-5.10, CT-10.2, DT-5.10, DT-10.2), each of which refuses a correction that would leave a later day inconsistent (CT-6.6, DT-6.5). Re-finalizing then requires the previous paper to be finalized (PA-8.2).

**PA-9.4 The response reports propagation (binding, changed).** Reopen returns the paper row, the workflow block and `propagation`, as PA-8.5.

**PA-9.5 What reopen allows** is decided by the other modules (PA-2.4). Ordered quantities, vehicle allocations, direct collections and bank deposits stay locked.

---

## 10. Propagation (background work)

**PA-10.1 Why it exists.** A changed tray balance can ripple through many later days. Doing all of it inside the finalize click would be slow and fragile. Finalize therefore stores a note (outbox row) in the same transaction as the status change, so it cannot be lost. A relay hands pending notes to a queue every 5 seconds; a worker processes them in chunks of 20 sheets or papers, retries transient failures up to 5 times with backoff, and fails business-rule failures at once (CT-10.6, DT-10.5).

**PA-10.2 `GET /papers/:paperId/propagation` (EMPLOYEE).** 404 if the paper is missing, otherwise `{ status, pending, processing, failed, done, failures[] }`. `status` is `FAILED` if any row failed, otherwise `IN_PROGRESS` if any is pending or processing, otherwise `COMPLETE`. Counts include every row ever created for the paper; a FAILED row stays visible until it is retried. `failures[]` carries each failed row's id, type, attempts, `last_error` and time. Counts are returned separately, so a `FAILED` status never hides that other rows are still running.

**PA-10.3 `GET /papers/propagation/problems` (ADMIN).** Up to 200 rows across all papers that are `FAILED`, or `PENDING` / `PROCESSING` and untouched for more than 10 minutes. Oldest first. A row being worked on keeps itself fresh, and a row stuck in PROCESSING for 2 minutes is re-queued by the relay (CT-10.6), so only rows that really stopped moving appear.

**PA-10.4 `POST /papers/:paperId/propagation/retry` (ADMIN).** Sets every FAILED row of that paper back to PENDING with attempts reset to 0 and returns `{ requeued: n }` (0 means nothing had failed). It does not fix the cause: if the underlying conflict (for example a return above its balance) still exists, the job fails again with the same detail. Retrying a failure that cannot succeed is harmless.

**PA-10.5** The route `propagation/problems` is declared before `:paperId`, so it is not read as a paper id.

---

## 11. Transactions, Concurrency and Errors

**PA-11.1 Atomic (binding).** Generate, submit-night, submit-morning, finalize and reopen each run as one serializable transaction. If anything fails, nothing is saved. The readiness checks and the status change see the same snapshot, so nobody can edit data between "validated" and "submitted".

**PA-11.2 No concurrency token on Paper actions (binding).** Unlike Orders, Collections and the others, Paper endpoints take no `expectedUpdatedAt`. Double clicks and simultaneous users are resolved by the status check plus the serializable transaction: the loser gets 409 (`... already ...`) or the generic conflict message.

**PA-11.3 Time limits (binding, changed).**
- Generate and reopen use the shared limit (`TRANSACTION_CONFIG.TIMEOUT_MS`, 10 s).
- Submit-night, submit-morning and finalize use `PAPER_TRANSACTION_TIMEOUT_MS` (30 s), because they run every other module's checks and finalize also rebuilds distributor transfers. The value is a placeholder (PA-14.1).
- A transaction that still exceeds its limit saved nothing and returns 409 `The request took too long and nothing was saved. Please retry.` instead of a generic 500.

**PA-11.4 Retries.** On a database serialization conflict the system makes at most 3 total attempts (waits 100 ms, then 200 ms), then returns 409 `Your request conflicted with another update and could not be completed. Please retry.` (same as OD-6.2, VA-5.2).

**PA-11.5 Error body.** `{ statusCode, message, requestId, ... }`. Several-problem errors add `details[]`. Unexpected errors are masked as `Internal server error`. Database errors are translated: unique violation 409, foreign-key violation 409, record not found 404. The request id is also in the `x-request-id` header and the server log.

**PA-11.6 Bodyless endpoints** (submit-night, submit-morning, finalize, retry) ignore any body that is sent. Endpoints with a declared body reject unknown fields.

---

## 12. HTTP Status Conventions

| Situation | Status |
|---|---|
| Invalid id, invalid date format, bad paging value, invalid or missing reopen reason, generate for a date other than the sale date, no active groups, wrong stage for a transition, readiness check failed | 400 |
| Paper not found, no papers in the system | 404 |
| Already submitted / finalized / reopened, previous paper not finalized, previous paper propagation failed, serialization retry exhausted, transaction timed out | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

---

## 13. The Workflow Block

**PA-13.1 Values (binding):**

| Status | activeExecutionSession | canSubmitNight | canSubmitMorning | canFinalize | canReopen |
|---|---|---|---|---|---|
| DRAFT | NIGHT | yes | no | no | no |
| NIGHT_SUBMITTED | MORNING | no | yes | no | no |
| MORNING_SUBMITTED | none | no | no | yes | no |
| FINALIZED | none | no | no | no | yes |
| REOPENED | none | no | no | yes | no |

The only exception is the `LATEST` paper of `GET /papers/today`, where every `can*` flag is `false` (PA-5.1).

**PA-13.2 Flags are advisory (binding).** They say whether an action is allowed at this STATUS. They do not say the readiness checks would pass, and another user can change the status after they are returned. Every endpoint rechecks status and readiness inside its own transaction, and the frontend must handle 409.

---

## 14. Open Items and Resolved Items

**Still open**

| ID | Item | Current behavior |
|---|---|---|
| PA-14.1 | `PAPER_TRANSACTION_TIMEOUT_MS` (30 s) is a placeholder. It was not measured against the largest real paper, in particular a REOPENED re-finalize (all completion checks, then the transfer rebuild, then the outbox writes). | One constant in `paper.constants.ts`. |
| PA-14.2 | The shared `AllExceptionsFilter` does not map the transaction-timeout error. Paper maps it itself for the three heavy actions (PA-11.3); generate and reopen, which are light, would still show a generic 500 on a timeout. | Outside the Paper module. |
| PA-14.3 | **CT-12.1 must be amended.** It says every sheet needs a client-tray ledger line at night submit. PA-6.3 removes that requirement. Suggested wording: "Night submit no longer requires a tray ledger line. A sheet may legitimately have none." | `ClientTraysValidationService.validateTrayCalculationExists` is no longer called by Paper and is left in place (unused). |
| PA-14.4 | PA-8.3 (no Vehicle Allocation gate on re-finalize) and PA-8.4 (failed propagation blocks the next finalize) change documented behavior and need business-owner approval before release. | Implemented as written above. |
| PA-14.5 | An inactive group that has only zeroed (cancelled) order lines is not "empty" under PA-6.5, so it still blocks night submit. | As written. |

**Resolved**

| ID | Resolution | Where |
|---|---|---|
| PA-14.6 | FINALIZED is defined as financially closed, with later days' tray balances refreshed in the background. | PA-2.5, PA-8.5 |
| PA-14.7 | No audit trail is added to Paper. Only the latest reopen reason is kept. | PA-2.6 |
| PA-14.8 | A paper cannot be generated for any day other than the current business day. | PA-4.1 |
| PA-14.9 | Reopen has no chronological rule and does not undo propagation. | PA-9.3 |

---

## 15. Change Log (this version)

| ID | Type | Summary |
|---|---|---|
| PA-8.3 | Changed | Re-finalize of a REOPENED paper no longer re-runs the Vehicle Allocation gate (allocations are locked while reopened) |
| PA-2.5 / 8.5 / 9.4 | Changed | Finalize and reopen responses carry `propagation`; FINALIZED defined as financially closed |
| PA-8.4 | Changed | Finalize is refused while the previous paper has FAILED propagation |
| PA-6.5 / 7.5 / 4.4 | Changed | An empty sheet of a deactivated group no longer blocks submission; groups activated after generation get a sheet while DRAFT |
| PA-6.3 | Changed | Night submit no longer requires a client-tray ledger line (supersedes CT-12.1) |
| PA-6.4 / 7.4 / 8.6 | Changed | Readiness failures are collected across all modules and reported together as `{ message, details[] }` |
| PA-11.3 | Changed | Submit and finalize get a 30 s limit; a timed-out transaction returns a retryable 409 |
| PA-5.1 | Changed | The `LATEST` paper of `/papers/today` is offered read-only (all `can*` flags false) |
| PA-4.6 | Changed | The generation race recovery recognises every unique-violation shape the driver can produce |
| PA-1 to PA-13 (rest) | Kept | Existing behavior confirmed as business rules |

---

## 16. Frontend Contract Summary

1. Call `GET /papers/today`. If `type` is `LATEST`, show the paper as read-only (the flags already say so) and offer "Generate today's paper".
2. Drive the buttons from `workflow` only as a hint. Always handle 409 by reloading the paper.
3. On a 400 from submit-night, submit-morning or finalize, show `details[]` as a list. It contains every problem, not only the first.
4. After finalize or reopen, read `propagation` from the response. Show `IN_PROGRESS` as "later days' tray balances are updating" and `FAILED` with `failures[]`. Poll `GET /papers/:paperId/propagation` until `COMPLETE`.
5. If finalize answers 409 about the previous paper's propagation, send the admin to the propagation screen to fix the cause and retry.
6. Send generate with no body. If a `date` is sent it must be the sale date.
7. A reopen reason is mandatory, trimmed, at most 1000 characters. Only the latest one is kept.
8. On a 409 "took too long, nothing was saved", the action can simply be repeated.