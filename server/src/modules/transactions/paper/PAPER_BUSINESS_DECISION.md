# Paper Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/paper/` only (controller, service, repository, `paper-date.util.ts`, `services/paper-validation.service.ts`, DTOs, constants), plus the paper's own workflow block (`WorkflowBuilder.buildPaperWorkflow`), the status transitions in `WorkflowStateService.validateTransition`, and the `DISMISSED` propagation status / retry and dismiss methods of `PropagationOutboxRepository`.
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 14 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`PA-n`) are stable. Cite them in code comments, PRs and reviews. Section 15 lists what changed in this version. Sections 17 to 20 were added in the previous version (their IDs are `PA-17.x` to `PA-20.x`). Revision 2 (the decisions that followed the behavioral specification discovery) amends the IDs listed in Section 15 and adds `PA-10.7`, `PA-10.8` and `PA-14.16`; where this file used to disagree with the implementation, this version follows the implementation.

**Reference pattern:** Paper owns no business data of its own. It decides WHEN the day may move to the next stage by asking the other modules whether they are ready, and it triggers the follow-up work on finalize. Where this file says "as in Orders / Client Trays / Collections / Vehicle Allocation / Purchase / Dairy Trays / Cash Settlement", the behavior is defined in `ORDERS_BUSINESS_DECISION.md` (OD-n), `CLIENT_TRAYS_BUSINESS_DECISION.md` (CT-n), `COLLECTION_BUSINESS_DECISION.md` (CD-n), `VEHICLE_ALLOCATION_BUSINESS_DECISION.md` (VA-n), `PURCHASE_BUSINESS_DECISION.md` (PD-n), `DAIRY_TRAYS_BUSINESS_DECISION.md` (DT-n) and `CASH_SETTLEMENT_BUSINESS_DECISION.md` (CS-n). Paper never re-implements their rules; it only calls their gates. Distributor Transfer has no decision file; what Paper relies on is in PA-8.7, PA-8.8 and PA-8.11.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Paper | `order_paper`: one record per business day. Everything else (sheets, allocation, purchases, trays, cash, transfers) hangs off it and is deleted with it. |
| Order date | The day orders are taken. Always sale date minus 1. |
| Sale date | The day the goods are delivered and sold. Rates are resolved as of this date. Unique per paper. |
| Sheet | One delivery group's sheet on the paper (`order_sheet`). One per group, created at generation. |
| No-operation sheet | A sheet an employee marked as "this route has no business on this paper" (`order_sheet.no_operation`, PA-17). |
| Status | `DRAFT`, `NIGHT_SUBMITTED`, `MORNING_SUBMITTED`, `FINALIZED`, `REOPENED`. |
| Readiness check | A read-only gate that Paper asks another module to run before a status change. |
| Propagation | Background recalculation of client-tray and dairy-tray balances for later days, recorded as outbox rows and run by a queue worker. |
| Outbox row | One `propagation_outbox` record. Status `PENDING`, `PROCESSING`, `DONE`, `FAILED` or `DISMISSED`. |
| Workflow block | `{ status, activeExecutionSession, canSubmitNight, canSubmitMorning, canFinalize, canReopen, canRevertMorning, canMarkNoOperation }`. Advisory only (PA-13.2). |
| Delivery paper | The paper whose SALE date is today (IST). It is delivered and completed today. It was generated yesterday. |
| Ordering paper | The paper whose SALE date is tomorrow (IST). Orders are taken for it today. |
| Backfill | Generating a paper for a sale date earlier than the ordering paper's (PA-4.8). |
| Warning | A finding that is reported and recorded but never blocks (PA-8.9). |

---

## 1. Access and Roles

**PA-1.1** All Paper endpoints require login (JWT). Employee endpoints also pass for `ADMIN` through the role hierarchy.

| Endpoint | Role |
|---|---|
| `POST /papers` (generate) | EMPLOYEE (a past `date` needs ADMIN, PA-4.8) |
| `GET /papers/current`, `GET /papers`, `GET /papers/:paperId` | EMPLOYEE |
| `GET /papers/:paperId/propagation` | EMPLOYEE |
| `GET /papers/:paperId/readiness` | EMPLOYEE |
| `POST /papers/:paperId/sheets/no-operation` | EMPLOYEE |
| `POST /papers/:paperId/submit-night`, `submit-morning` | EMPLOYEE |
| `POST /papers/:paperId/finalize`, `reopen`, `revert-morning` | ADMIN |
| `POST /papers/:paperId/propagation/retry`, `propagation/dismiss`, `GET /papers/propagation/problems` | ADMIN |
| `GET /papers/:paperId/audit` | ADMIN |

**PA-1.2** Throttles, per user per minute and per endpoint (each endpoint has its own counter): generate, submit-night, submit-morning, finalize, reopen, revert-morning, propagation retry and propagation dismiss 10; no-operation 20; readiness 30. The other endpoints use the global limit. Exceeding a limit returns 429.

**PA-1.3** Every authenticated employee may read every paper, including propagation status and readiness. There is no per-group or per-branch scoping of paper reads. *(As implemented, kept; confirmed in revision 2.)* The audit log is admin-only (PA-20.3).

---

## 2. Workflow: statuses and transitions

**PA-2.1 Transitions (binding):**

```
DRAFT -> NIGHT_SUBMITTED -> MORNING_SUBMITTED -> FINALIZED -> REOPENED -> FINALIZED
              ^                     |
              '-- revert (admin) ---'   (PA-18)
```

No step can be skipped. The only ways back are reopen (from FINALIZED) and revert (from MORNING_SUBMITTED, PA-18). Any other transition is rejected with 400 `Cannot transition from X to Y`.

**PA-2.2 Status matrix of the Paper actions (binding):**

| Paper status | Generate | Submit night | Submit morning | Finalize | Reopen | Revert morning | Mark no-operation |
|---|---|---|---|---|---|---|---|
| DRAFT | returns it (PA-4.3) | Yes | No (400) | No (400) | No (400) | No (400) | Yes |
| NIGHT_SUBMITTED | returns it | No (409) | Yes | No (400) | No (400) | No (400) | No (400) |
| MORNING_SUBMITTED | returns it | No (409) | No (409) | Yes | No (400) | Yes | No (400) |
| FINALIZED | returns it | No (409) | No (409) | No (409) | Yes | No (400) | No (400) |
| REOPENED | returns it | No (409) | No (409) | Yes | No (409) | No (400) | No (400) |

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

**PA-2.6 History is in the audit log (binding, replaces the former "no audit trail" rule).** The paper row keeps its milestone timestamps (`night_entry_submitted_at`, `morning_entry_submitted_at`, `finalized_at`, `reopened_at`) and only the LATEST `reopen_reason`. `finalized_at` is overwritten on every re-finalize, and `reopened_at` / `reopen_reason` stay on the row after re-finalize. These columns are therefore "latest value" fields only. Who did what, when and why, and the full history of every action, is in the audit log (Section 20).

**PA-2.7 Reverting is not reopening.** Revert (PA-18) undoes the morning submit before any financial close. Reopen unlocks a financially closed paper. They are separate actions with separate rules.

---

## 3. Dates

**PA-3.1 Business timezone is `Asia/Kolkata` (binding).** Every date decision uses the Indian calendar day, whatever the server's own timezone. 12:30 am IST belongs to the new day even though it is still the previous day in UTC.

**PA-3.2 Order date and sale date (binding).** Sale date = order date + 1 day, for every paper, including backfilled ones. Both are unique in the database, so two papers can never exist for the same day. Both are stored as calendar dates. The offset has one source (`DATE_CONFIG.GENERATION_SALE_DATE_OFFSET_DAYS`); the repository no longer adds its own +1.

**PA-3.3 Two papers are alive at the same time (binding).** The delivery paper (sale date = today) is being completed. The ordering paper (sale date = tomorrow) is being ordered. `GET /papers/current` returns both by name (PA-5.1).

**PA-3.4 Strict dates.** A date input must be `YYYY-MM-DD` and a real calendar date. `2026-02-31` and `2026-1-5` are rejected, because JavaScript would silently roll Feb 31 into March. A bad shape is rejected by the DTO (400 `date must be in YYYY-MM-DD format`); a well-formed but impossible date is 400 `Invalid date format`.

**PA-3.5** `DATE_CONFIG.MAX_FUTURE_DAYS`, the `SUCCESS_MESSAGES` block, `ERROR_MESSAGES.INVALID_PAPER_ID` and `ERROR_MESSAGES.NO_PAPERS_FOUND` exist in the constants file but nothing uses them. They are not rules. Responses carry no success message.

---

## 4. Generate (`POST /papers`)

Body: optional `{ date?: "YYYY-MM-DD", reason?: string }`. The frontend normally sends no body. Unknown fields are rejected (400).

**PA-4.1 Which dates can be generated (binding, changed).** `date` is the SALE date. Without `date`, the ordering paper (tomorrow, IST) is generated. A `date` later than that is rejected: 400 `Papers cannot be generated for a future date. The latest date that can be generated is YYYY-MM-DD`. A `date` earlier than that is a backfill (PA-4.8). (This replaces the former "current business day only" rule.)

**PA-4.2 What is created (binding).** In one serializable transaction: the paper in DRAFT; one sheet per ACTIVE delivery group, each copying that group's delivery session; the dairy-tray header for the paper (the Dairy Trays gate at morning submit fails without it, PD-64); and one audit entry (PA-20). If there is no active group: 400 `No active groups found to generate sheets`, and nothing is created.

**PA-4.3 Generating twice is safe (binding).** If a paper with that sale date already exists, it is returned and no second paper is created, whatever its status and whatever the caller's role. The response carries the paper's real `status` and `workflow`. Nothing is audited for a call that returns an existing paper, except when it adds sheets to a DRAFT paper (PA-4.4).

**PA-4.4 A group activated after generation gets its sheet while the paper is DRAFT (binding).** When generate is pressed again on an existing DRAFT paper, a sheet is created for every active group that has none. Existing sheets are never changed or removed. Once the paper is past DRAFT it is returned unchanged and no sheet is added. **Adding sheets is audited (revision 2):** one `GENERATED` entry with `from_status` and `to_status` DRAFT and `details`: `saleDate`, `existingPaper: true`, `sheetsAdded` (count) and `groupIds`. A call that adds nothing writes nothing.

**PA-4.5 A group deactivated after generation keeps its sheet.** Its sheet is subject to the readiness checks like any other, except as PA-6.5 / PA-7.5 allow.

**PA-4.6 Concurrent generation.** Two requests for the same date can both pass the "exists" check. The unique sale date makes the loser fail; the loser then re-reads by sale date and returns the winner's paper. A unique violation that finds no paper for that date is NOT treated as success and is re-thrown. The violation is recognised in all the shapes the database driver can surface (`P2002`, `23505`, and the driver-adapter variants), as in the repositories.

**PA-4.7 Response** is the paper row, its sheets (id, group id and name, session, `no_operation`) and the workflow block. The HTTP status is 200 (PA-12).

**PA-4.8 Backfill (binding, new).** A paper for a past sale date can be generated when it was missed. Rules, checked only when a paper would actually be CREATED (PA-4.3):
1. The caller must be `ADMIN` (else 403 `Only an administrator can generate a paper for a past date`). The role is read from the JWT.
2. `reason` is mandatory, trimmed, at most 1000 characters (else 400 `A reason is required to generate a paper for a past date`).
3. The date is within the backfill window (PA-4.9).
4. The paper is created exactly like any other (PA-4.2) and the audit entry is `GENERATED_BACKFILL` with the reason.
Sheets are created for the groups that are active NOW, not as they were on that date. Rates are resolved as of the paper's own sale date (OD-9.1), so historical rates apply.

**PA-4.9 Backfill window (binding, accepted value).** A paper can be generated at most `DATE_CONFIG.MAX_BACKDATE_DAYS` (31) days before the ordering date. Older: 400 `A paper can only be generated up to 31 days back`. 31 is accepted as the current value (the same size as the tray recalculation window, CT-11.2); measurement is still pending (PA-14.10).

**PA-4.10 What a backfilled paper means for the days after it (binding, accepted trade-off).**
- Tray opening balances are calculated live from the latest earlier closing and carry across gaps (CT-6.3, DT-6.3), so the backfilled paper's own screens are correct from the start.
- Later papers' STORED openings become stale until the backfilled paper is finalized. Finalize queues the forward propagation, which refreshes opening and closing on every later sheet, including FINALIZED ones, without reopening them (CT-11.5, DT-11.5).
- If a later paper holds a return that would exceed its refreshed balance, that propagation job FAILS with the list in `last_error` (CT-6.6, DT-6.5). It then shows in the propagation problems list and blocks the next finalize (PA-8.4) until an admin fixes the cause and retries, or dismisses it (PA-10.6).
- Sequential finalization (PA-8.2) checks only the nearest earlier paper. A backfilled paper can therefore be finalized after papers that come after it were finalized. This is the one accepted exception to "days close in order", and it exists only because of backfill.

---

## 5. Read Endpoints

**PA-5.1 `GET /papers/current` (binding, replaces `GET /papers/today`).** Returns the two papers that are alive today, by name:
`{ dates: { delivery, ordering }, delivery, ordering }`.
`dates.delivery` is today (IST) and `dates.ordering` is tomorrow. `delivery` is the paper whose sale date is today, `ordering` the paper whose sale date is tomorrow. Each is `{ paper, workflow, propagation }` or `null` when that paper does not exist. The workflow flags are always the paper's real ones. The old `type: TODAY | LATEST` answer and its read-only workflow are removed: a paper is never presented as "latest", and the screen decides what to offer from `delivery`, `ordering` and their workflow flags. A `null` `ordering` means "generate it" (PA-4.1); a `null` `delivery` means it was missed and an admin can backfill it (PA-4.8). The server decides "today" per request; a screen left open across IST midnight shows the old day until it reloads (PA-14.16).

**PA-5.2 `GET /papers` with `date`.** The date is parsed strictly (400 `Invalid date format`) and matched against the SALE date. Missing paper: 404 `Order paper not found`. Returns `{ paper, workflow, propagation }`. `page` and `pageSize` are not used for this lookup, but they are still validated like in PA-5.4: a non-integer value is 400 even when `date` is given.

**PA-5.3 `GET /papers` without `date`.** Paginated list, newest sale date first: `{ total, page, pageSize, items: [{ paper, workflow }] }`. Items carry no sheets and no propagation. When no paper exists the answer is 200 with `total: 0` and `items: []` (never 404).

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

**PA-5.6 Paper id format.** A URL id must be digits only, 1 to 2147483647, otherwise 400 `Invalid id`. `007` is accepted as 7. `current` and `propagation/problems` are declared before `:paperId`, so they are not read as a paper id.

---

## 6. Night Submit (`POST /papers/:paperId/submit-night`)

No body. Meaning: "tonight's ordering is complete, lock it." After this, ordered quantities are permanently locked (OD-2.2).

**PA-6.1 Order of checks inside the transaction:** paper exists (404) -> status is DRAFT (409) -> readiness checks (400) -> transition is legal -> status NIGHT_SUBMITTED, `night_entry_submitted_at` stamped, audit entry written.

**PA-6.2 Readiness checks (binding).** Paper asks:
1. **Orders**, for every sheet that is not exempt (PA-6.5, PA-17.2): at least one order line with ordered quantity above 0 (OD-13.1). Blank cells and zeros do not count.
2. **Collections**, for every sheet: no negative stored night amount (CD-10.1).
3. **Vehicle Allocation**, NIGHT session: coverage and data integrity (VA-8).

**PA-6.3 No client-tray ledger check at night submit (binding).** A sheet is NOT required to have a client-tray ledger line. A ledger line exists only if an order line resolves to a tray type and the summed quantity rounds to at least one tray (CT-6.4, CT-7.1); a sheet that orders only non-tray products, or only a fraction of a crate in total, has no ledger line and must still be submittable. **This supersedes CT-12.1, which has been amended (PA-14.3 resolved).**

**PA-6.4 All problems are reported together (binding).** Every readiness check is read-only, so a failing check does not stop the next one. A failure returns 400 `{ message: "Night submission is not ready", details[] }` listing every failing check across all sheets and modules. Nothing is changed (all-or-nothing). Messages that belong to one sheet name that sheet. Duplicate lines are listed once. Same shape as VA-8.1, PD-54 and CS-12.1. A database or programming error is NOT collected: it fails the request immediately.

**PA-6.5 Exempt sheets at night submit (binding, changed).** The Orders check (PA-6.2 item 1) is skipped for a sheet that is (a) marked no-operation (PA-17), whether or not it has order lines (a route whose lines were all zeroed is the PA-14.5 case), or (b) of a deactivated group AND has no order line at all. A sheet of an inactive group that DOES have order lines is checked like any other, so recorded data is never left unchecked. An ACTIVE group's unmarked empty sheet still blocks (OD-6.15). The Collections check still runs for every sheet.

---

## 7. Morning Submit (`POST /papers/:paperId/submit-morning`)

No body. Meaning: "delivery and completion work is done; ready for admin sign-off."

**PA-7.1 Order of checks:** paper exists (404) -> status is MORNING_SUBMITTED, FINALIZED or REOPENED (409 `Morning entries were already submitted (paper is X)`) -> status is not NIGHT_SUBMITTED, e.g. DRAFT (400 `Cannot transition from DRAFT to MORNING_SUBMITTED`) -> completion checks (400) -> status MORNING_SUBMITTED, `morning_entry_submitted_at` stamped, audit entry written.

**PA-7.2 Completion checks (binding).** Paper asks, in this order:
1. **Orders**, for every sheet that is not exempt (PA-7.5, PA-17.3): the sheet has at least one line, and every line has a delivered quantity (OD-13.2, OD-13.3); no negative delivered quantity (OD-13.4).
2. **Collections**, for every sheet: no negative stored morning amount (CD-10.1).
3. **Vehicle Allocation**, MORNING session (VA-8).
4. **Purchase**: every allocation has a saved purchase decision; no stale or orphaned entries; zero-allocation sign-off where required (PD-54).
5. **Dairy Trays**: header exists, balances valid (DT-12.1).
6. **Distributor Transfer**: a transfer rule exists for every supplier and owner pair that needs one. Every pair without a rule is reported as its own detail, not only the first (PA-7.4).
7. **Cash Settlement**: every route reconciles within the tolerance and deposits do not exceed available cash (CS-12.2, CS-12.3).

**PA-7.3** Delivered quantity 0, over-delivery and the 150% warning are defined by Orders (OD-7.4, OD-7.5), not by Paper.

**PA-7.4 All problems are reported together (binding).** As PA-6.4, with `message: "Morning submission is not ready"`. This includes every missing transfer rule: with one missing pair the detail is `Transfer rule not found for supplier X and owner Y`; with several, each pair is a detail of its own. When the paper has no allocation and no zero-allocation sign-off, the 400 body also carries `requiredActions: ["SIGN_OFF_ZERO_ALLOCATION"]` (PA-19.5), so the screen does not have to parse the message text. `requiredActions` is `[]` otherwise.

**PA-7.5 Exempt sheets at morning submit (binding, changed).** The Orders checks (item 1 above) are skipped for a sheet that has NO order line at all AND is either marked no-operation (PA-17) or belongs to a deactivated group. A marked sheet that HAS lines (for example one created by a morning save, OD-7.6) is validated like any other. Collections checks still run for every sheet.

---

## 8. Finalize (`POST /papers/:paperId/finalize`) - ADMIN only

No body. Meaning: "the day is financially closed."

**PA-8.1 Order of checks:** paper exists (404) -> already FINALIZED (409 `Paper is already FINALIZED`) -> status is not MORNING_SUBMITTED or REOPENED (400 `Cannot transition from X to FINALIZED`) -> previous paper rule (PA-8.2, PA-8.4) -> readiness checks (400) -> transition -> propagation (PA-8.7) -> status FINALIZED, `finalized_at` stamped, audit entry written.

**PA-8.2 Sequential finalization (binding).** The nearest paper with an EARLIER sale date must be FINALIZED, otherwise 409 `Cannot finalize: the previous paper (YYYY-MM-DD) is X. Finalize it first.` The nearest existing paper is used, so a missing date does not matter. This applies to re-finalizing a REOPENED paper too. The first paper ever has no predecessor and passes. Reason: tray balances and cash flow from day to day, so days must close in order. Only the nearest EARLIER paper is checked; papers after it are not (PA-4.10).

**PA-8.3 Re-finalizing a REOPENED paper re-runs the completion checks, except two gates (binding, changed).** A REOPENED paper can have delivered quantities, tray returns, purchases and collections edited, so "it passed once" says nothing about its current state. The completion checks of PA-7.2 run again EXCEPT:
- **Vehicle Allocation (item 3):** allocations are locked while REOPENED (VA-2.4, VA-7.7), so a failure could not be corrected. Purchase keeps its own stale and orphan gate against the allocation (PD-37, PD-68).
- **Cash Settlement (item 7), including CS-12.5:** a reopen correction can change a client's cash, and therefore a route's net cash, but cannot change the cash that was physically counted and deposited, and direct collections and bank deposits stay frozen (CS-2.4). A route can therefore legitimately not match its counted denominations, and the deposit checks could fail with no way to fix them. Blocking on this would make the paper impossible to re-finalize and, through PA-8.2, would block every later day. These checks become warnings instead (PA-8.9).
Every other check of PA-7.2 still runs and still blocks.

**PA-8.4 A failed propagation on the previous paper blocks (binding).** If the previous paper has any `FAILED` outbox row, finalize is refused with 409 `Cannot finalize: background tray propagation for the previous paper (YYYY-MM-DD) has failed. An administrator must retry it (or dismiss it with a reason) first.` Only FAILED blocks. `PENDING`, `PROCESSING` and `DISMISSED` do not, because every Orders, Purchase and tray save already recalculates its own ledger synchronously (CT-10.1, DT-10.1) and propagation is the safety net for later days. A FAILED row stops blocking once an admin retries it successfully (PA-10.4), dismisses it (PA-10.6), or a newer job of the same kind for that paper completes (PA-10.7). Only the previous paper is checked; an older failure stays visible in the problems list (PA-10.3) but blocks nothing.

**PA-8.5 The response reports propagation and warnings (binding).** Finalize returns the paper row, the workflow block, `propagation` (the same summary as `GET /papers/:paperId/propagation`) and `warnings[]` (PA-8.9, empty when none). Immediately after finalize `propagation` will normally read `IN_PROGRESS`; that is the true state (PA-2.5).

**PA-8.6 Finalize checks (binding).**
1. For a REOPENED paper: the completion checks of PA-8.3.
2. For a MORNING_SUBMITTED paper: the distributor transfer rule check (PA-8.11), every missing pair reported. Nothing else needs re-checking, because nothing can have changed since the morning submit.
3. **Collections**, for every sheet: no negative stored admin amount (CD-10.1).
All problems are reported together as 400 `{ message: "Finalization is not ready", details[] }` (same rule as PA-6.4). The same exemptions as PA-7.5 apply to the REOPENED re-check. The previous-paper rules of PA-8.2 and PA-8.4 are 409 and are raised before the checks.

**PA-8.7 What finalize triggers, in the same transaction (binding).** In this order:
1. **Client trays forward:** an outbox row. The worker later recalculates this paper's sheets and refreshes the opening and closing balances of every later sheet of each group (CT-10.5).
2. **Distributor transfer:** done immediately. Delivered quantities supplied by one distributor to a client owned by another are summed, validated against the transfer rules and stored, replacing the paper's previous transfer records (PA-8.8).
3. **Dairy trays forward:** an outbox row, same idea (DT-10.4).
If any step fails, the whole finalize is rolled back and the paper keeps its old status.

**PA-8.8** The distributor-transfer step is the only synchronous propagation. Its work grows with the number of delivered lines on the paper, and it is why submit and finalize have their own time limit (PA-11.3).

**PA-8.9 Cash Settlement on re-finalize is a warning (binding, new).** When a REOPENED paper is re-finalized, Paper computes the same route-mismatch and deposit findings Cash Settlement reports in its `submission` block (CS-4.4) and returns them in `warnings[]`, each prefixed `Cash settlement: `. They never block. They are written into the finalize audit entry (PA-20.2), so the difference an admin finalized through is on record. Cash Settlement's own screen keeps showing `summary.reconciliationDifference` (CS-3.6). The CS-12.5 gate is no longer called by Paper (see the amendment in the Cash Settlement file).

**PA-8.10 `finalized_at` is overwritten on re-finalize** (see PA-2.6). The first finalize time is in the audit log.

**PA-8.11 Distributor Transfer as seen by Paper (documented, no separate decision file exists).**
- The finalize step builds the paper's transfer records from delivered quantities (PA-8.7) and needs a transfer rule for every supplier and owner pair. A missing rule is reported as a readiness problem at morning submit, at finalize of a MORNING_SUBMITTED paper and at re-finalize, together with every other problem; every missing pair is listed.
- `GET /distributor-transfer/:paperId` is a live read. `POST /distributor-transfer/:paperId/generate` is allowed only while the paper is REOPENED and uses `order_paper.updated_at` as its concurrency token.
- The paper's status changes, revert, reopen and finalize all advance `order_paper.updated_at`, which Cash Settlement (CS-10.2) and Distributor Transfer also use as their token. A Collections save that creates a positive `cash_collection` or changes a stored one advances it too (CD-7.2); Collections saves that change only office cash, cheque, online or bank deposit do not. A Paper action or such a Collections save therefore makes an open Cash Settlement or Distributor Transfer screen stale on its next save (409), and the reverse. This is intended and the reason Paper needs no token of its own (PA-11.2). Marking a sheet no-operation does NOT advance it.

---

## 9. Reopen (`POST /papers/:paperId/reopen`) - ADMIN only

Body: `{ reason }`.

**PA-9.1 Reason (binding).** Required, a string, trimmed before validation, non-empty after trimming, at most 1000 characters. `""`, whitespace only, a number, a missing field or an unknown extra field are rejected (400).

**PA-9.2 Order of checks:** paper exists (404) -> already REOPENED (409 `Paper is already REOPENED`) -> status is not FINALIZED (400 `Cannot transition from X to REOPENED`) -> status REOPENED, `reopened_at` = now, `reopen_reason` = the reason, audit entry written with the same reason.

**PA-9.3 Reopen only unlocks (binding).** It runs no readiness check, has no chronological rule (an older paper can be reopened while newer ones are finalized) and does not undo earlier propagation. Corrections made while REOPENED trigger their own recalculation in the modules that own the data (OD-6.13, CT-5.10, CT-10.2, DT-5.10, DT-10.2), each of which refuses a correction that would leave a later day inconsistent (CT-6.6, DT-6.5). Re-finalizing then requires the previous paper to be finalized (PA-8.2). **Reopen and finalize are allowed whatever the paper's propagation state** (`IN_PROGRESS` or `FAILED` included): propagation reads the latest data when it runs, and a pending job of the same kind is reused instead of duplicated (PA-10.8).

**PA-9.4 The response reports propagation (binding).** Reopen returns the paper row, the workflow block and `propagation`, as PA-8.5.

**PA-9.5 What reopen allows** is decided by the other modules (PA-2.4). Ordered quantities, vehicle allocations, direct collections and bank deposits stay locked.

---

## 10. Propagation (background work)

**PA-10.1 Why it exists.** A changed tray balance can ripple through many later days. Doing all of it inside the finalize click would be slow and fragile. Finalize therefore stores a note (outbox row) in the same transaction as the status change, so it cannot be lost. A relay hands pending notes to a queue every 5 seconds; a worker processes them in chunks of 20 sheets or papers, retries transient failures up to 5 times with backoff, and fails business-rule failures at once (CT-10.6, DT-10.5).

**PA-10.2 `GET /papers/:paperId/propagation` (EMPLOYEE).** 404 if the paper is missing, otherwise `{ status, pending, processing, failed, done, dismissed, failures[] }`. `status` is `FAILED` if any row failed, otherwise `IN_PROGRESS` if any is pending or processing, otherwise `COMPLETE`. Counts include every row ever created for the paper. A FAILED row stays visible until it is retried, dismissed or superseded (PA-10.7). `failures[]` carries each failed row's id, type, attempts, `last_error` and time. A DISMISSED row is counted in `dismissed` and does not affect `status`.

**PA-10.3 `GET /papers/propagation/problems` (ADMIN).** Up to 200 rows across all papers that are `FAILED`, or `PENDING` / `PROCESSING` and untouched for more than 10 minutes. Oldest first. A row being worked on keeps itself fresh, and a row stuck in PROCESSING for 2 minutes is re-queued by the relay (CT-10.6), so only rows that really stopped moving appear. DISMISSED rows do not appear.

**PA-10.4 `POST /papers/:paperId/propagation/retry` (ADMIN).** Sets every FAILED row of that paper back to PENDING with attempts reset to 0 and `last_error` cleared, and returns `{ requeued: n }` (0 means nothing had failed). It does not fix the cause: if the underlying conflict (for example a return above its balance) still exists, the job fails again with the same detail. Retrying a failure that cannot succeed is harmless. Audited when n > 0 (PA-20).

**PA-10.5** The route `propagation/problems` is declared before `:paperId`, so it is not read as a paper id.

**PA-10.6 `POST /papers/:paperId/propagation/dismiss` (ADMIN, new).** Body `{ reason }` (trimmed, mandatory, at most 1000 characters). Every FAILED row of that paper becomes `DISMISSED` and the response is `{ dismissed: n }`. Dismissed rows stay in the table with their error, are never retried, never appear in the problems list and never block finalize (PA-8.4). Dismissing does NOT repair the tray balances of later days. It is a deliberate decision, for a failure that cannot or need not be fixed, that the admin accepts those balances as they are, or will rebuild them through the range recalculation (CT-11.1, DT-11.1). It is audited with the reason and every dismissed row's id, type and error (PA-20.2).

**PA-10.7 A completed newer job supersedes older failures (binding, new in revision 2).** When an outbox row reaches `DONE`, every older `FAILED` row of the same paper, the same type and the same resume point becomes `DISMISSED` automatically. Reason: a failure that a later run of the same work already repaired must not keep the paper in `FAILED` or block the next paper's finalize (PA-8.4). The rows are kept with their error. This is done by the system, not by an admin, so it writes no audit entry; it shows in the `dismissed` count.

**PA-10.8 Retry and dismiss are not gated by paper status (binding, new in revision 2).** They act on whatever FAILED rows the paper has (only 404 if the paper is missing). `enqueue` never creates a second PENDING row for the same paper, type and resume point; the existing one will read the latest data when it runs.

---

## 11. Transactions, Concurrency and Errors

**PA-11.1 Atomic (binding).** Generate, submit-night, submit-morning, finalize, reopen, revert, mark no-operation and the audit entry of each run as one serializable transaction. If anything fails, nothing is saved. The readiness checks and the status change see the same snapshot, so nobody can edit data between "validated" and "submitted". The propagation retry and dismiss run in a plain transaction together with their audit entry.

**PA-11.2 No concurrency token on Paper actions (binding).** Unlike Orders, Collections and the others, Paper endpoints take no `expectedUpdatedAt`. Double clicks and simultaneous users are resolved by the status check plus the serializable transaction: the loser gets 409 (`... already ...`) or the generic conflict message. Paper actions still advance `order_paper.updated_at`, which other modules use as their token (PA-8.11).

**PA-11.3 Time limits (binding, accepted values).**
- Generate, reopen, revert and mark no-operation use the shared limit (`TRANSACTION_CONFIG.TIMEOUT_MS`, 10 s).
- Submit-night, submit-morning and finalize use `PAPER_TRANSACTION_TIMEOUT_MS` (30 s), because they run every other module's checks and finalize also rebuilds distributor transfers. The value is accepted as the current one and still has to be measured before go-live (PA-14.1). Readiness uses the same limit.
- A Paper write transaction that still exceeds its limit saved nothing and returns 409 `The request took too long and nothing was saved. Please retry.` instead of a generic 500. This now applies to every Paper write, not only the three heavy ones.

**PA-11.4 Retries.** On a database serialization conflict the system makes at most 3 total attempts (waits 100 ms, then 200 ms), then returns 409 `Your request conflicted with another update and could not be completed. Please retry.` (same as OD-6.2, VA-5.2).

**PA-11.5 Error body.** `{ statusCode, message, requestId, ... }`. Several-problem errors add `details[]`. Unexpected errors are masked as `Internal server error`. Database errors are translated: unique violation 409, foreign-key violation 409, record not found 404. The request id is also in the `x-request-id` header and the server log.

**PA-11.6 Bodyless endpoints** (submit-night, submit-morning, finalize, retry) ignore any body that is sent. Endpoints with a declared body reject unknown fields.

---

## 12. HTTP Status Conventions

| Situation | Status |
|---|---|
| Successful write (every Paper POST, including generate) and every successful read | 200 |
| Invalid id, invalid date format, future date, bad paging value, invalid or missing reason, backfill without reason or older than the window, no active groups, wrong stage for a transition or for revert / mark no-operation, sheet not in the paper, readiness check failed | 400 |
| Paper not found (an empty paper list is NOT an error: 200 with an empty `items`, PA-5.3) | 404 |
| Already submitted / finalized / reopened, previous paper not finalized, previous paper propagation failed, serialization retry exhausted, transaction timed out | 409 |
| Not authenticated / lacks role, backfill by a non-admin | 401 / 403 |
| Throttled | 429 |

---

## 13. The Workflow Block

**PA-13.1 Values (binding):**

| Status | activeExecutionSession | canSubmitNight | canSubmitMorning | canFinalize | canReopen | canRevertMorning | canMarkNoOperation |
|---|---|---|---|---|---|---|---|
| DRAFT | NIGHT | yes | no | no | no | no | yes |
| NIGHT_SUBMITTED | MORNING | no | yes | no | no | no | no |
| MORNING_SUBMITTED | none | no | no | yes | no | yes | no |
| FINALIZED | none | no | no | no | yes | no | no |
| REOPENED | none | no | no | yes | no | no | no |

`activeExecutionSession` names the session whose submission comes next. It does not say which Vehicle Allocation sessions are editable: both are editable in DRAFT (VA-2.1), and the Vehicle Allocation workflow block is the source for that.

**PA-13.2 Flags are advisory (binding).** They say whether an action is allowed at this STATUS. They do not say the readiness checks would pass (use PA-19), and another user can change the status after they are returned. Every endpoint rechecks status and readiness inside its own transaction, and the frontend must handle 409. The flags are never masked by which paper it is (PA-5.1).

---

## 14. Open Items and Resolved Items

**Still open**

| ID | Item | Current behavior |
|---|---|---|
| PA-14.1 | `PAPER_TRANSACTION_TIMEOUT_MS` (30 s) is accepted as the current value but was not measured against the largest real paper, in particular a REOPENED re-finalize. The app has not been deployed, so there is no production load data on serialization conflicts either. | One constant in `paper.constants.ts`. Measure before go-live. |
| PA-14.10 | `MAX_BACKDATE_DAYS` (31) is accepted as the current value; the business may still change it. | One constant in `paper.constants.ts`. |
| PA-14.11 | Backfill into a period whose later papers are already FINALIZED (PA-4.10) is implemented on the existing propagation machinery but has not been exercised on real data. | Failures show as FAILED rows and can be retried or dismissed. |
| PA-14.12 | A no-operation sheet is not blocked from receiving orders in Orders (Orders is outside Paper). The flag only removes the "must have an order" requirement. | PA-17.4. |
| PA-14.13 | Paper does not stop an employee from running a day's actions on the "wrong" business day (the submit endpoints accept any paper id). | Advisory flags only (PA-13.2). |
| PA-14.15 | A paper generated by mistake (for example a stray DRAFT) can never be removed or skipped, and PA-8.2 makes it block the finalize of every later paper until it has been taken through the whole lifecycle. There is no delete, cancel or skip action. | As implemented (PA-8.2). Decision of revision 2: not built now, because it needs a schema change (a new status or column) that touches every module. Recommended design for later: an admin "void paper" action with a mandatory reason, an audit entry, and PA-8.2 skipping voided papers. |

**Resolved**

| ID | Resolution | Where |
|---|---|---|
| PA-14.2 | The timeout-to-409 mapping covers every Paper write. | PA-11.3 |
| PA-14.3 | CT-12.1 amended: night submit needs no tray ledger line. | PA-6.3 |
| PA-14.4 | PA-8.3 and PA-8.4 approved in this version, with the changes recorded above. | PA-8.3, PA-8.4, PA-10.6 |
| PA-14.5 | A route with no business, including one with only zeroed lines, is marked no-operation. | PA-17 |
| PA-14.6 | FINALIZED is defined as financially closed, with later days' tray balances refreshed in the background. | PA-2.5, PA-8.5 |
| PA-14.7 | An audit trail IS added to Paper (supersedes the earlier "none"). | PA-2.6, Section 20 |
| PA-14.8 | A paper cannot be generated for a future date. Past dates are a controlled admin backfill. | PA-4.1, PA-4.8 |
| PA-14.9 | Reopen has no chronological rule and does not undo propagation. | PA-9.3 |
| PA-14.14 | An error found after morning submit and before finalize can be corrected by an admin revert. | PA-18 |
| PA-14.16 | The server decides "today" at each request. A screen open across IST midnight keeps showing the old day until it reloads or runs any action (every status action refreshes `current`, PA-16). | PA-5.1, PA-16 |
| PA-14.17 | A stale FAILED row no longer blocks once a newer job of the same kind completed. | PA-10.7 |
| PA-14.18 | Retry and dismiss are not gated by paper status; reopen and finalize are allowed in any propagation state. | PA-10.8, PA-9.3 |

---

## 15. Change Log

**Revision 2 (decisions after the behavioral specification discovery)**

| ID | Type | Summary |
|---|---|---|
| PA-7.2.6 / PA-7.4 / PA-8.6 / PA-8.11 | Changed (code) | Every supplier and owner pair without a transfer rule is reported, not only the first |
| PA-4.3 / PA-4.4 / PA-20.1 | Changed (code) | Adding sheets to a DRAFT paper on re-generate is audited as `GENERATED` with `existingPaper: true` |
| PA-4.7 / PA-12 | Changed (code) | Every Paper POST answers HTTP 200 (was 201) |
| PA-10.4 | Changed (code) | Retry clears `last_error` |
| PA-10.7 / PA-8.4 / PA-10.2 | New (code) | A completed newer job supersedes older FAILED rows of the same paper, type and resume point |
| PA-10.8 / PA-9.3 | New | Retry and dismiss are not gated by status; reopen and finalize allowed in any propagation state |
| PA-5.2 / PA-5.3 / PA-12 | Changed (doc follows code) | Paging parameters are still validated with `date`; an empty list is 200, not 404 |
| PA-6.5 / PA-17.2 / PA-17.4 | Clarified (doc follows code) | At night a marked sheet is exempt whether or not it has lines; at morning only when it has none. This removes the conflict between PA-6.5 and PA-17.4 |
| PA-1.2 / PA-1.3 | Clarified | Throttle counter is per endpoint and per user; read access unchanged |
| PA-3.5 | Clarified | `NO_PAPERS_FOUND` is unused too |
| PA-11.3 / PA-4.9 / PA-14.1 / PA-14.10 | Confirmed | 30 s and 31 days accepted as current values, measurement still pending |
| PA-14.15 | Decided | Void-paper action not built now; design recorded |
| PA-14.16 to PA-14.18 | New (resolved) | Midnight rollover, stale FAILED rows, status gating |
| PA-16 | Changed | The screen reloads on any 409 and refreshes `current` after every status action |
| PA-19.4 | Clarified | Readiness collectors must never write (standing rule) |

**Previous version**

| ID | Type | Summary |
|---|---|---|
| PA-18 | New | Admin can revert MORNING_SUBMITTED to NIGHT_SUBMITTED with a reason |
| PA-8.3 / PA-8.9 | Changed | Re-finalizing a REOPENED paper no longer runs the Vehicle Allocation or Cash Settlement gates; cash findings are returned as warnings and audited |
| PA-17 | New | Routes with no business are marked no-operation in DRAFT and exempt from the empty-sheet checks |
| PA-6.5 / PA-7.5 | Changed | Exemption rules written in terms of PA-17 and the deactivated-group rule |
| PA-4.1 / PA-4.8 to PA-4.10 | Changed / New | Past papers can be generated by an admin with a reason, within a window; future dates rejected |
| PA-5.1 | Changed | `GET /papers/today` and its `TODAY` / `LATEST` answer replaced by `GET /papers/current` with `delivery` and `ordering` |
| PA-19 | New | `GET /papers/:paperId/readiness` |
| PA-20 | New | Audit log for every Paper action |
| PA-10.6 / PA-8.4 | New / Changed | Admin can dismiss FAILED propagation rows; dismissed rows never block |
| PA-8.6 / PA-8.11 | Changed | Distributor transfer rules checked at finalize of a MORNING_SUBMITTED paper; transfer behavior documented |
| PA-11.3 | Changed | Timeout-to-409 mapping covers every Paper write |
| PA-3.2 | Changed | One source for the sale-date offset |
| PA-13.1 | Changed | `canRevertMorning` and `canMarkNoOperation` added; `activeExecutionSession` clarified |
| PA-1 to PA-3, PA-9, PA-10.1 to PA-10.5, PA-11.4 to PA-11.6 (rest) | Kept | Existing behavior confirmed as business rules |
| PA-19.2 / PA-19.5 | Changed / New | Readiness returns `requiredActions[]`; DRAFT readiness warns when no allocation exists and no sign-off is recorded; NIGHT_SUBMITTED readiness lists the sign-off as a required action |
| PA-7.4 | Changed | Morning submit 400 carries `requiredActions[]` |
| PA-17.2 / PA-16 | Clarified | Order for a fully closed day: mark, night submit, sign-off, morning submit |
| PA-14.15 | New (open) | Stray papers cannot be removed or skipped; decision needed |
| PA-8.11 | Amended | Collections saves that change a `cash_collection` amount advance `order_paper.updated_at` (CD-7.2) |

---

## 16. Frontend Contract Summary

1. Call `GET /papers/current`. Use `ordering` and `delivery` by name. If `ordering` is `null`, offer "Generate" (no body). If `delivery` is `null`, tell an admin it was missed and offer a backfill with `date` and a reason.
2. Drive the buttons from `workflow` as a hint. On ANY 409 the screen reloads the selected paper and `current` (keeping the error message visible). After every successful status action (submit, finalize, reopen, revert, mark no-operation) it refreshes `current` too, so the flags of both papers stay real.
3. Before an irreversible action, call `GET /papers/:paperId/readiness` and show `problems[]` and `warnings[]`. `action` says which action it is about; `action: null` means nothing more to submit or finalize. If `requiredActions` contains `SIGN_OFF_ZERO_ALLOCATION`, show the Purchase sign-off button (PD-38); do not match on message text. The `PaperReadiness` type carries `requiredActions`.
4. On a 400 from submit-night, submit-morning or finalize, show `details[]` as a list. It contains every problem, not only the first (the shared `extractErrorMessage` renders one "• detail" line per problem).
5. A route with no business today: `POST /papers/:paperId/sheets/no-operation` with `{ sheetIds, noOperation: true }` while the paper is DRAFT. A whole closed day is every sheet marked, then night submit, then the zero-allocation sign-off (possible only from NIGHT_SUBMITTED, PD-66), then morning submit.
6. After finalize or reopen, read `propagation` from the response. Show `IN_PROGRESS` as "later days' tray balances are updating" and `FAILED` with `failures[]`. Poll `GET /papers/:paperId/propagation` until `COMPLETE`. Show `warnings[]` from finalize.
7. If finalize answers 409 about the previous paper's propagation, send the admin to the propagation screen to retry, fix the cause, or dismiss with a reason.
8. A reopen, revert or dismiss reason is mandatory, trimmed, at most 1000 characters.
9. On a 409 "took too long, nothing was saved", the action can simply be repeated.

---

## 17. No-Operation Routes (new)

**PA-17.1 Purpose.** A route (sheet) that has no business on a given paper, for any reason, must not stop the day. An employee marks it instead of entering fake orders. There is no holiday calendar; the business decides per paper and per route.

**PA-17.2 Night effect.** A marked sheet is exempt from the Orders "at least one order > 0" check (PA-6.5), whether or not it has order lines (so a route whose lines were all zeroed can be marked and passes). A paper in which every sheet is marked passes the Orders check everywhere; the remaining gates still apply (with no demand, Vehicle Allocation passes with an empty allocation, and Purchase needs the zero-allocation sign-off, PD-38). The sign-off can be recorded only while purchases are editable (PD-66), so never in DRAFT: for a fully closed day the order is night submit, then sign-off, then morning submit. Readiness announces this step (PA-19.5).

**PA-17.3 Morning effect.** A marked sheet with no order line is exempt from the Orders morning checks (PA-7.5). A marked sheet that has lines is validated normally.

**PA-17.4 The flag is only about the empty-sheet rule (binding, clarified in revision 2).** At night it removes the Orders "must have an order" requirement for the sheet, even if the sheet has lines (PA-6.5, PA-17.2). At morning it removes the Orders requirements only for a sheet with no order line; a marked sheet that has lines is checked like any other (PA-7.5, PA-17.3). It does not block anything in Orders, Collections, Trays or Cash. Orders can still be entered for a marked sheet; positive orders on it still count in Vehicle Allocation and the other modules. Nothing else reads the flag.

**PA-17.5 Endpoint.** `POST /papers/:paperId/sheets/no-operation`, body `{ sheetIds: number[] (1 to 200, unique), noOperation: boolean }`. Only while the paper is DRAFT (else 400 `Routes can only be marked or unmarked as no-operation while the paper is DRAFT (paper is X)`). Every sheet id must belong to the paper (else 400). Employees can mark and unmark freely until night submit. Returns the refreshed paper (`{ paper, workflow, propagation }`).

**PA-17.6 Idempotent.** Setting a value a sheet already has changes nothing and writes no audit entry. The call does not advance `order_paper.updated_at`.

**PA-17.7 Data.** `order_sheet.no_operation Boolean @default(false)`. Sheets created by generation start unmarked.

---

## 18. Revert Morning Submit (new)

**PA-18.1 Purpose.** An error found after the morning submit but before the financial close must be correctable without finalizing the paper first.

**PA-18.2 Endpoint.** `POST /papers/:paperId/revert-morning` (ADMIN), body `{ reason }` (PA-9.1 rules). Order of checks: paper exists (404) -> status is MORNING_SUBMITTED (else 400 `Only a MORNING_SUBMITTED paper can be reverted to NIGHT_SUBMITTED (paper is X)`) -> transition legal -> status NIGHT_SUBMITTED, `morning_entry_submitted_at` cleared, audit entry written with the reason. Response: the paper row and the workflow block.

**PA-18.3 Why back to NIGHT_SUBMITTED, not to REOPENED (binding).** Nothing was finalized, so there is no propagation and no ledger to undo, and the morning submit itself left nothing behind except the status and its timestamp (PA-7). NIGHT_SUBMITTED re-opens the widest correction surface: delivered quantities, morning collections, direct collections, bank deposits, route expenses and denominations, purchases, trays and the MORNING allocation (PA-2.4). REOPENED would keep direct collections, deposits and allocation locked and forbid new order lines (OD-7.11), and it is meant for financially closed days.

**PA-18.4 Consequences (informational).**
- The grid keeps showing delivered quantities, because the morning-entry-saved flag stays (OD-3.4).
- A changed MORNING allocation can make saved purchases stale; that is the designed behavior (PD-65) and blocks the next morning submit until re-saved.
- The morning submit must pass the full completion checks again (PA-7.2).
- Revert has no previous-paper rule and no chronological rule.
- Revert advances `order_paper.updated_at`, so open Cash Settlement and Distributor Transfer screens become stale (PA-8.11).
- Not available from DRAFT, NIGHT_SUBMITTED, FINALIZED or REOPENED. A night submit is still permanent (OD-2.2).

---

## 19. Readiness (new)

**PA-19.1 Purpose.** Submit and finalize are effectively irreversible, and their only "dry run" used to be the real thing. Readiness runs the same checks and commits nothing.

**PA-19.2 Endpoint.** `GET /papers/:paperId/readiness` (EMPLOYEE). 404 if the paper is missing. Response `{ paperId, status, action, ready, problems[], warnings[], requiredActions[] }`.

| Paper status | `action` | Checks run |
|---|---|---|
| DRAFT | `SUBMIT_NIGHT` | PA-6.2 |
| NIGHT_SUBMITTED | `SUBMIT_MORNING` | PA-7.2 |
| MORNING_SUBMITTED, REOPENED | `FINALIZE` | PA-8.2, PA-8.4 and PA-8.6 |
| FINALIZED | `null` | none (`ready: false`, empty lists) |

`problems[]` holds everything that would block, including the previous-paper block for finalize (which the real action reports as a 409 before the other checks). `warnings[]` holds the PA-8.9 findings and the PA-19.5 DRAFT notice. `requiredActions[]` holds steps the user must take, as data (PA-19.5). `ready` is true only when there is an action and no problem.

**PA-19.3 Same checks, same exemptions.** Readiness uses the very same collectors as the real actions, including PA-6.5, PA-7.5 and PA-8.3, so the two cannot disagree except through concurrent edits.

**PA-19.4 It is a snapshot.** Another user can change data right after it returns, so the real action rechecks everything (PA-13.2). It runs in a repeatable-read transaction (not serializable), so it cannot cause serialization failures for employees saving at the same time. It is throttled to 30 per minute per user (PA-1.2). **Standing rule (revision 2):** a readiness collector must never write. The database cannot enforce a read-only transaction here, so this is a review rule: the collectors of Orders, Collections, Vehicle Allocation, Purchase, Dairy Trays, Distributor Transfer and Cash Settlement were reviewed and only read. Any new collector must keep it that way.

**PA-19.5 The zero-allocation sign-off is announced (binding, new).** A paper with no allocation above 0 and no recorded sign-off cannot pass morning submit (PD-38, PD-54). Paper reports this in three places, all using the Purchase test `isZeroAllocationSignOffPending` (PD-70):
1. **DRAFT readiness:** a non-blocking entry in `warnings[]`: `Purchase: no vehicle allocation exists yet. If none is saved, a zero-allocation sign-off is required after night submit and before morning submit`. It is a warning because the sign-off cannot be recorded in DRAFT (PD-66) and a MORNING allocation may still be saved. It never changes `ready`.
2. **NIGHT_SUBMITTED readiness:** `requiredActions` contains `SIGN_OFF_ZERO_ALLOCATION`. The same fact is also in `problems[]` as the Purchase gate message, because the morning submit is blocked by it.
3. **Morning submit 400:** the error body carries `requiredActions` (PA-7.4).
`requiredActions` is `[]` for MORNING_SUBMITTED, REOPENED and FINALIZED. `SIGN_OFF_ZERO_ALLOCATION` is the only value today; a new value needs a new decision. Nothing else about readiness or the gates changes.

---

## 20. Audit Log (new)

**PA-20.1 What is recorded.** One row in `paper_audit_log` per Paper action, written in the same transaction as the action, so an action and its record succeed or fail together.

| `action` | Written by | Notes |
|---|---|---|
| `GENERATED` | generate (new paper), or generate that adds sheets to an existing DRAFT paper (PA-4.4) | new paper: `details`: sale date, sheet count. Added sheets: `details`: `saleDate`, `existingPaper: true`, `sheetsAdded`, `groupIds` |
| `GENERATED_BACKFILL` | generate for a past date | `reason` mandatory |
| `NIGHT_SUBMITTED` | submit-night | from and to status |
| `MORNING_SUBMITTED` | submit-morning | from and to status |
| `MORNING_REVERTED` | revert-morning | `reason` |
| `FINALIZED` | finalize | `details.warnings` when there were any (PA-8.9) |
| `REOPENED` | reopen | `reason` |
| `SHEET_OPERATION_CHANGED` | mark no-operation | `details`: `noOperation`, changed count, sheet ids, route names |
| `PROPAGATION_RETRIED` | propagation retry | `details.requeued` |
| `PROPAGATION_DISMISSED` | propagation dismiss | `reason`, `details.dismissed[]` (id, type, error) |

Each row also has the paper, the acting user (`user_id`, kept as null if the user is later deleted), `from_status`, `to_status` and `created_at`. A call that changes nothing (an existing paper returned by generate with no sheet to add, a retry with nothing failed, a no-op marking) writes nothing. Automatic supersession of old FAILED rows (PA-10.7) is a system action and is not audited.

**PA-20.2 Scope (binding).** Only Paper actions are audited. Edits inside other modules (quantities, returns, collections, purchases) are not, and the other modules' "no audit trail" decisions are unchanged (CT-14.1, DT-14.1, VA-12.1, CS and PD logs).

**PA-20.3 Read.** `GET /papers/:paperId/audit` (ADMIN) returns the newest 500 entries, newest first, each with the user's id, username and name. 404 if the paper is missing. Audit rows are deleted only with their paper.

**PA-20.4 What the audit log does not replace.** The paper row's own timestamps and `reopen_reason` keep their "latest value" meaning (PA-2.6). The audit log is the history.

**PA-20.5 Data.** New table `paper_audit_log` and enum `PaperAuditAction` (migration `20261022_paper_lifecycle_audit`, additive only).