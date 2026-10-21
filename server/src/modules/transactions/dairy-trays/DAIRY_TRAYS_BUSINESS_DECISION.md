# Dairy Trays Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/dairy-trays/` only (controller, service, repository, builder, DTOs, interceptor, `services/*`, constants, util), plus `types/dairy-trays.types.ts` and the dairy-tray conversion in `TrayCalculationService` (`buildDairyTakenByKey`, tray-rule matching, closing formula).
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 15 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`DT-n`) are stable. Cite them in code comments, PRs and reviews. Section 16 maps the approved decision list to DT IDs.

**Reference pattern:** Dairy Trays follows **Client Trays** (`CLIENT_TRAYS_BUSINESS_DECISION.md`, CT-n) wherever the two are the same kind of rule. Section 17 records where they differ and why. Purchase (`PURCHASE_BUSINESS_DECISION.md`, PD-n) is the source of the tray quantities.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Order paper | One per business day. |
| Dairy tray paper | `dairy_tray_paper`: one header per order paper. Its `updated_at` is the concurrency token (DT-9.1). |
| Session | `NIGHT` or `MORNING`. Each is an independent ledger (DT-6.2). |
| Tray | A returnable crate the dairy expects back from our vehicles. One order unit (crate) is one tray. |
| Tray type | Brand + colour (`master_tray_type`). |
| Ledger line | One stored row in `dairy_tray_transaction` for one paper + vehicle + session + tray type. |
| Ledger key | Vehicle + session + tray type (DT-6.1). |
| Opening | Latest earlier stored closing for the same key, across gaps (DT-6.3). |
| Taken | Trays that came in on this paper. Calculated from purchase quantities. Nobody types it. |
| Returned | Trays handed back to the dairy. The only value an employee enters. |
| Closing | Opening + Taken - Returned. |
| Available balance | Opening + Taken. The most that can be returned (DT-5.5). |
| Carry-forward line | A ledger line that exists only because of a non-zero opening balance (no purchases on that paper). |
| Frozen tray type | Tray type stored on a purchase entry when it was saved (PD-33). |
| Concurrency token | `dairy_tray_paper.updated_at`, exposed as `dairyTraysUpdatedAt`, sent back as `expectedUpdatedAt`. |
| Cascade | Background job that refreshes opening and closing of later papers. |
| Return discrepancy | A stored return higher than the line's available balance after a change (DT-6.5). Always refused, never capped or deleted. |
| Reconciliation | The admin-only correction of returns for an inactive vehicle or tray type (DT-5.11). |

---

## 1. Access and Roles

**DT-1.1** The grid view and the save endpoint require login (JWT) and the `EMPLOYEE` role. `ADMIN` also passes via the role hierarchy.

**DT-1.2** Two endpoints require `ADMIN`: the range recalculation (DT-11.1) and the inactive reconciliation (DT-5.11).

**DT-1.3** Save is throttled to 10 requests per minute per user. Range recalculation and reconciliation are each throttled to 5 requests per minute per user. The grid view uses the global limit. Exceeding a limit returns 429.

---

## 2. Workflow: what can be done at each paper status

**DT-2.1 Status matrix (binding):**

| Paper status | View grid | Save returns |
|---|---|---|
| DRAFT | Yes | No |
| NIGHT_SUBMITTED | Yes | Yes |
| MORNING_SUBMITTED | Yes | No |
| FINALIZED | Yes | No |
| REOPENED | Yes | Yes |

**DT-2.2** A save outside NIGHT_SUBMITTED or REOPENED returns HTTP 400 `Dairy tray tracking cannot be edited in the current workflow state`.

**DT-2.3** `workflow.editable` is true only in NIGHT_SUBMITTED and REOPENED. The backend status matrix is authoritative; the frontend binds its input controls to `workflow.editable` and never decides editability on its own.

**DT-2.4 Recalculation is gated (binding).** The recalculation triggered by a Purchase save runs only while the paper allows dairy tray editing (DT-2.1), otherwise 400. The only ungated recalculation paths are the two explicit ones: the finalization forward job (DT-10.4) and the admin range recalculation (DT-11.1).

**DT-2.5** After morning submit, returns can be changed again only if an admin reopens the paper.

---

## 3. Grid View (`GET /dairy-trays/:paperId`)

**DT-3.1** The response contains `paper`, `workflow`, `dairyTraysUpdatedAt` (the concurrency token, `null` when the paper has no dairy tray header), `columns`, `rows` and `sessionTotals`. There is no combined `totals` (DT-3.7).

**DT-3.2** A missing paper is 404 `Paper not found`. A paper id must be digits only, 1 to 2147483647, otherwise 400 `Invalid id`.

**DT-3.3 The grid view is strictly read-only (binding).** It never creates the dairy tray header, never writes anything and never advances the token. With no header, the grid is still calculated live and `dairyTraysUpdatedAt` is `null`.The header is created only by write paths, all through getOrCreateDairyTrayPaper: (a) paper generation, (b) a zero-allocation sign-off (PD-64), including the idempotent repeat call, (c) a Purchase recalculation (DT-10.1), (d) the finalization forward job and the admin range recalculation (DT-10.4, DT-11.1) when the start paper has no header, and (e) a cascade step (DT-10.3) onto a later paper that has a carried balance but no header. No read path and no return save creates it.

**DT-3.4 Columns.** A pinned "Vehicle" column, then one group per brand ("X Tray"), then one group per colour ("Blue Tray"), each with four sub-columns: Opening, Trays, Returned, Closing. Only Returned is editable, and only for an active tray type (DT-8.3). Field names are `tray_<id>_opening`, `tray_<id>`, `tray_<id>_returned`, `tray_<id>_closing`. Every active tray type is a column. An inactive tray type is a column only while it has a ledger line.Tray type columns are ordered by brand name, then colour (ascending), and grouped by brand, in the same order on every response.

**DT-3.5 Rows.** One row per vehicle + session that has a ledger line (DT-6.1, DT-7.1). That includes vehicles with purchases on this paper and vehicles that only carry an outstanding balance. Each row carries `vehicleId`, `vehicleName`, `deliverySession` and `readOnly` (true for an inactive vehicle, DT-8.2). The frontend shows the session itself and sends it back on save. Rows are sorted by vehicle name, then NIGHT before MORNING.vehicleName is the vehicle's name, or its vehicle number when the vehicle has no name. It is never null in the response. Sorting and messages already use the same fallback.

**DT-3.6 Values** are calculated live from stored earlier balances, the paper's purchases and the stored returns. They are not read back from stored opening, taken or closing. Returned shows the stored value; an untouched return is 0 (DT-4.6).

**DT-3.7 Totals are per session only (binding).** NIGHT and MORNING are independent ledgers (DT-6.2), so the grid returns `sessionTotals.NIGHT` and `sessionTotals.MORNING` only (distinct vehicle count, plus opening, trays, returned and closing per tray type). There is no combined total, because vehicles and trays do not cross between sessions and a sum would mix two ledgers. The frontend shows each session's totals separately. This is a breaking change for any client that read `totals`.

---

## 4. Input Validation Rules (save request)

Body: `{ entries: [{ vehicleId, trayTypeId, deliverySession, returned }], expectedUpdatedAt }`

**DT-4.1 Returned quantity (binding).** A whole number from 0 to 2,000. Decimals (`12.5`), negatives, strings (`"40"`), null, blank and omitted are rejected with 400. The maximum applies to the total return of one ledger row on a paper (DT-5.12).

**DT-4.2 Identifiers.** `vehicleId` and `trayTypeId` are whole numbers 1 to 2147483647. `deliverySession` must be exactly `NIGHT` or `MORNING`.

**DT-4.3 Entries array.** Required, 1 to 5,000 items. An empty array is rejected with 400.

**DT-4.4 Duplicates.** The same vehicle + session + tray type more than once in one request is rejected with 400 `Duplicate entry for vehicle X, tray type Y, SESSION. Each vehicle, session and tray type can appear only once.` The same vehicle and tray type in NIGHT and MORNING is not a duplicate.

**DT-4.5 Unknown fields are stripped, not rejected.** Extra properties at the top level and inside each entry are removed before validation. This applies to the two save routes only (same as CT-4.5).

**DT-4.6 Untouched returns are zero, with no save needed (binding).** A return nobody entered is 0 from the moment the ledger line is calculated. It is stored as 0, never as empty. On save, every ledger line that is not in the request keeps its stored return. A return can be set to 0 but never cleared to blank.

**DT-4.7 Validation order.** Request-shape checks (DT-4.1 to DT-4.5) and the duplicate check run before the database transaction starts, so a malformed request never touches data. The status, header, token and balance checks run inside the transaction.

---

## 5. Save (`POST /dairy-trays/:paperId/save`)

**DT-5.1 Ledger key (binding).** A ledger line is identified by paper + vehicle + session + tray type. The database enforces this with a unique key on all four.

**DT-5.2 Atomic.** The whole request is one serializable transaction. If anything fails, nothing is saved and the concurrency token is rolled back too. On a database serialization conflict the system makes at most 3 total attempts, then returns 409 `Your request conflicted with another update and could not be completed. Please retry.`

**DT-5.3 Order of checks inside the transaction:** paper exists (404) -> status allows editing (400, DT-2.2) -> dairy tray header exists (400 `Dairy tray tracking has not been generated for this paper`) -> token (409, DT-9) -> every entry validated against the server's own calculated ledger (400) -> no stored return anywhere above its balance (409, DT-6.5) -> write -> on a REOPENED paper, forward conflict check (409) and cascade queued (DT-5.10).

**DT-5.4 The server's numbers are authoritative.** Opening, taken and balances are always recalculated on the server. The client sends only returns. Nothing the client sends can change opening or taken.

**DT-5.5 Balance rule (binding).** An entry's `returned` must not exceed that ledger line's available balance (opening + taken). A vehicle may return more than today's purchase, because trays accumulate from earlier days. It may not return more than the total outstanding, so closing can never become negative through a save. A violation is rejected with 400 and the message lists every offending vehicle, session, tray type and the available balance: `Vehicle "Tempo-1" (NIGHT): 26 Brand Blue tray returned exceeds the outstanding balance of 25`. All balance problems in one request are reported together in `details`.

**DT-5.6 Cell must exist.** An entry for a vehicle + session with no row in the grid, or for a tray type that is not a column, is rejected with 400 `Dairy tray row not found for vehicle X (SESSION)`. A cell inside an existing row and a visible column, but with no ledger line, is accepted only with `returned = 0` (otherwise DT-5.5 rejects it because the available balance is 0). A zero for such a cell stores nothing.

**DT-5.7 Inactive vehicles and tray types are read-only for ordinary users (binding).** On the normal save, an entry whose vehicle or tray type is inactive is accepted only if `returned` equals the stored value (the frontend echoing back what it received). A different value is rejected with 400 `Vehicle "X" (SESSION): <tray> is inactive (the vehicle or the tray type) and read-only`. Changing them is the job of the admin reconciliation route (DT-5.11).

**DT-5.8 What is written.** The complete calculated ledger for the paper: each line gets its opening, taken, the returned value (DT-4.6) and closing. Lines that no longer qualify are removed (DT-7.2, DT-7.3). The write is restricted to this paper.

**DT-5.9 Response** `{ success: true, message: "Dairy tray returns saved successfully", dairyTraysUpdatedAt }`, where `dairyTraysUpdatedAt` is the NEW token (DT-9.4).

**DT-5.10 Save on a REOPENED paper checks later papers, then queues a cascade (binding).** Because a changed closing balance must reach later papers, a save on a REOPENED paper first checks every later paper in memory. If any of them would be left with returns above its balance, the whole save is refused with 409 (DT-6.5). Otherwise the save succeeds and a forward propagation for this paper is queued through the existing outbox (DT-10.2). A save on NIGHT_SUBMITTED does neither.

**DT-5.11 Reconciling inactive vehicles and tray types: `POST /dairy-trays/:paperId/reconcile-inactive` (ADMIN only, binding).** Same body and every rule as the normal save (token, status, balance rule, limit, cascade on a reopened paper), with one difference: only entries whose vehicle or tray type is inactive can be changed. An entry where both are active is rejected with 400 `Vehicle "X" (SESSION): <tray> is active. Use the normal save instead of reconciliation`.

**DT-5.12 The 2,000 limit is on the row's total (binding).** A save sets the row's total return, it does not add to it, so the limit holds across saves. It is checked in the request (DT-4.1) and again in the service, so the admin route is covered too. Over the limit: 400 `Vehicle "X" (SESSION): 2001 <tray> returned exceeds the limit of 2000 per row`. The 2,000 cap is the approved upper bound for dairy volumes, the same as Client Trays.

**DT-5.13** Every successful save advances the token once, even if the submitted values equal the stored ones (same as CT-9.5).

---

## 6. Ledger Calculation

**DT-6.1 Ledger key (binding).** Vehicle + session + tray type.

**DT-6.2 NIGHT and MORNING are independent ledgers (binding).** A session's opening comes only from the same session of an earlier paper. Night's closing never flows into the same day's morning. A return entered for one session never reduces the other session's balance.

**DT-6.3 Opening balance (binding).** For each key, the most recent EARLIER stored closing, even when the immediately previous paper has no row for it (a gap). Only non-zero closings carry. If the latest earlier closing is 0, or there is none, opening is 0. Outstanding balances therefore never disappear because a vehicle skipped a day.

**DT-6.4 Taken is aggregated before rounding (binding, PD-28).** Purchase quantities are summed per vehicle + session + tray type and rounded once, half-up, to a whole number. Three purchases of 0.4 crates give 1 tray, not 0. One order unit is one tray. This rounding is for trays only; billing never uses it. The tray type of a purchase is its frozen tray type (PD-33). Without one, the most specific active tray rule wins (most filled-in fields, lowest rule id on a tie, DT-6.6). A purchase with no resolvable tray type produces no trays and no ledger line (approved policy).

**DT-6.5 A correction that would leave returns above the balance is blocked (binding).** Closing can never go negative, and a stored return is never capped or reduced to make it fit. If a purchase correction, a return save or a cascade would leave any stored return higher than that line's available balance, on this paper or on any later paper, the change is refused until the returns are corrected first.
- A Purchase save: refused with 409, the purchase save is rolled back too (same transaction), and the response lists each vehicle, session, tray and the sale date: `2026-01-05, vehicle "Tempo-1" (NIGHT): 5 Brand Blue tray returned but only 3 outstanding`. On a REOPENED paper the check also covers every later paper.
- A return save on a REOPENED paper: refused with 409 in the same way (DT-5.10).
- A background job that meets a conflict: the job fails and shows as FAILED, with the same list in `last_error`, in the paper propagation status. Nothing is capped. After the returns are fixed the admin retries the failed job.
- This applies to every Purchase write that changes entries, not only to saves: deletion through deletedEntryIds, purgeAll and admin reevaluateTrays are covered (DT-10.1).

**DT-6.6 Tray rules (as implemented, kept).** A rule matches when each of its brand, product group and product type is either empty (wildcard) or equal to the product's; if it applies to packaging, the packaging type must match too. Most specific wins, lowest id breaks ties. Only active rules take part in new resolutions. A rule change never alters a frozen purchase assignment.

---

## 7. Ledger Row Management

**DT-7.1 A ledger line exists only while it carries activity (binding).** Kept if its opening is non-zero OR its taken is greater than 0.

**DT-7.2 Zero-activity lines are removed, but never with a positive return (binding).** A line is removed when opening, taken and return are all 0. A line that still holds a positive return is never removed or hidden: the change that would do so is refused (DT-6.5). The ledger builder also refuses to drop such a row as a last safeguard.

**DT-7.3 Obsolete rows are deleted safely (binding).** Whenever a paper's ledger is rewritten, stored rows that are not part of the newly calculated ledger are deleted, including when the new ledger is empty. Deletion is restricted to the paper being written.

**DT-7.4 Historical balances are never dropped because of master data (binding).** An outstanding balance is never removed merely because the vehicle or tray type is no longer active.

**DT-7.5 Purchase key versus stored row (clarification of PD-28, binding).** The purchase calculation produces a key for every vehicle + session + tray type, including one with 0 trays (PD-28). That key is only a calculation key. Whether a row is stored is decided by DT-7.1: a key with opening 0, taken 0 and return 0 stores no row, which keeps the ledger clean. The Purchase decision file should carry a matching note under PD-28: "a zero purchase produces a calculation key with 0 trays; whether Dairy Trays stores a row for it is decided by Dairy Trays DT-7.1."

---

## 8. Visibility of Vehicles and Tray Types

**DT-8.1 Who appears (binding).** A vehicle + session appears if it has a ledger line: a non-zero opening balance, or taken greater than 0 on this paper. A stored positive return is always shown (DT-7.2). A vehicle with no balance and no purchase in a session is not shown for that session.

**DT-8.2 Inactive vehicles with balances stay visible (binding).** The row is shown with `readOnly: true` and handled under DT-5.7 and DT-5.11. Vehicle names are looked up by id regardless of status.

**DT-8.3 Inactive tray types with open balances stay visible (binding).** The column is shown with Returned not editable.

**DT-8.4** API acceptance and grid display use the same rule: every cell the save accepts is a cell the grid shows.

**DT-8.5 The `readOnly` contract (binding).** The backend sets `readOnly: true` on every row of an inactive vehicle. The frontend must disable the Returned inputs on those rows. The backend enforces the same rule independently (DT-5.7).

---

## 9. Concurrency Token

**DT-9.1 Header-level (binding).** The token is `dairy_tray_paper.updated_at`, one per order paper, exposed as `dairyTraysUpdatedAt` on the grid view and on every save response. It is NOT `order_sheet.client_trays_updated_at`, which belongs to Client Trays, so a Client Trays save never makes a dairy save stale, and the reverse.

**DT-9.2 Mandatory (binding).** `expectedUpdatedAt` is required on every save and on reconciliation.
- **Omitted -> always 400.** It is never treated as `null`.
- **Explicit `null`** produces the normal 409, because the header always carries a token.
- **A value** must be ISO-8601 and equal the current token, else 409. A malformed value is 400 `Invalid expectedUpdatedAt`.
- There is no unchecked save path.

**DT-9.3 Stale response.** 409 `Dairy Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.`

**DT-9.4 Save returns the new token (binding).** The frontend replaces its local token with `dairyTraysUpdatedAt` and can save again without reloading.

**DT-9.5 Rollback.** The token is advanced inside the same transaction as the data. If the save fails for any reason, the token is rolled back with it.

**DT-9.6 When the token moves (binding).** The token moves only when dairy tray data actually changes: a return save (DT-5.13), or a recalculation or cascade that changes at least one stored row (a Purchase save, finalization, admin recalculation). A recalculation that leaves every stored row identical does not move it. Purchase-driven recalculation does not need the token to be sent, but it advances it, which is correct because the calculated Taken and balances changed under anyone who has the grid open. Creating the header (paper generation, sign-off) sets its initial token and is not meant to move it afterwards; any natural `updated_at` update by the database on a write to the header is accepted. The server-side balance checks (DT-5.5, DT-6.5) protect the data in every case.

---

## 10. Recalculation and Propagation

**DT-10.1 Purchase-driven recalculation (binding, DEP-009).** After every Purchase save that changes entries, the paper's dairy tray ledger is recalculated in the same transaction (opening from earlier papers, taken from purchases, returns preserved exactly as stored). A failure, including a return conflict (DT-6.5), rolls back the Purchase save. If any stored row changed, the dairy tray token advances (DT-9.6).Which Purchase operations trigger it (binding, as implemented). Any Purchase write that changes at least one entry: a save with new or changed entries, deletion through deletedEntryIds, purgeAll, and admin reevaluateTrays (which moves taken trays between tray types). Each runs the recalculation in the same transaction. A resulting return conflict refuses the whole Purchase operation with 409 and rolls it back, including the deletion or purge. A no-op Purchase save does not trigger it. Admin rate recalculation (PD-23) never triggers it, because rates do not affect tray counts.

**DT-10.2 Reopened corrections propagate forward (binding).** A return save on a REOPENED paper queues a forward propagation in the same transaction (DT-5.10). A Purchase correction on a REOPENED paper runs the forward conflict check in the same transaction; its balances reach later papers when the paper is finalized again (DT-10.4). **Purchase corrections on a NIGHT_SUBMITTED paper (binding):** the current paper is recalculated immediately in the same transaction; later papers pick the change up when the paper is finalized (DT-10.4) or through the admin range recalculation (DT-11.1). This is the same as Client Trays.

**DT-10.3 What a cascade changes and never changes (binding).** Later papers receive only refreshed opening and closing balances. Their taken and returned values are never touched by someone else's correction. A non-zero carried balance with no row gets a carry-forward line with return 0, also across gaps. Only the start paper is fully recalculated.

**DT-10.4 Finalizing a paper queues a forward propagation** (PAPER_TO_DAIRY_TRAYS_PROPAGATION): the paper is fully recalculated, then every later paper is cascaded.

**DT-10.5 Reliability of queued jobs.** The request is stored in an outbox row in the same transaction as the change. A relay dispatches pending rows every 5 seconds and merges duplicates. Each job runs in a serializable transaction in chunks of 20 papers and resumes where it stopped. It is retried up to 5 times with exponential backoff, then marked FAILED. A row stuck in PROCESSING for 2 minutes is re-queued. Progress, failures and retry are visible through the existing paper propagation endpoints.Transient failures (serialization conflict, connection errors, timeouts) are retried up to 5 times with exponential backoff, then marked FAILED. Business-rule failures, meaning any HTTP error raised by the job (a 409 return conflict per DT-6.5, a 404 for a missing paper), are not retried: the job is marked FAILED on the first attempt, with the full detail list in last_error. After the cause is fixed, an admin retries through POST /papers/:id/propagation/retry, which resets the attempts. The merging of duplicate requests applies only to a PENDING row with the same type, paper and resume point; a request made while a matching row is PROCESSING creates a second, independent row.

**DT-10.6 Eventual consistency.** Later papers are refreshed in the background. Until the job completes, a later paper's stored opening may be stale; the grid view calculates opening live, so what a user sees stays self-consistent.

**DT-10.7 Master data is not changed while a paper is being worked on (operational, not enforced by code).** Tray rules, tray types and vehicles are not edited while a paper is in progress.

**DT-10.8 One job type (binding).** Return-save cascades, finalization and the admin range recalculation all use the existing `DAIRY_TRAYS_FORWARD` outbox job. No other dairy tray job type exists.

**DT-10.9 Post-deployment step (mandatory, operational).** Immediately after this version is deployed, an admin runs `POST /dairy-trays/recalculate` over the papers affected by the old rules (31 days per call), to rebuild openings across gaps and create carry-forward rows. Legacy rows with a negative closing or returns above the balance stay visible in the grid. Any save is refused with 409 until every offending return is corrected, all in the same request, and a recalculation job that meets one fails with the list in `last_error` (DT-6.5). A finalized paper needs an admin reopen first (DT-11.4).

---

## 11. Administrative Recalculation and Correction

**DT-11.1 `POST /dairy-trays/recalculate` (ADMIN only).** Body `{ fromDate, toDate }`, both `YYYY-MM-DD` sale dates, inclusive. Queues a forward propagation for every paper in the range. Response `{ papersQueued, fromDate, toDate, operations }`, where `operations` lists `{ paperId, operationId }`; `operationId` is the outbox row, followed through `GET /papers/:id/propagation`. It returns immediately.

**DT-11.2 Date rules.** Both must be real calendar dates (else 400). `fromDate` must not be after `toDate` (400). The range cannot exceed 31 days (400). A range with no papers is valid and queues nothing.

**DT-11.3 Effect.** Each paper in the range is fully recalculated; every later paper has opening and closing refreshed (DT-10.3).

**DT-11.4 Finalized history changes only through an explicit administrative process (binding).** Returns of a finalized paper can change only after an admin reopens it. Balances can be rebuilt in bulk only through DT-11.1.

**DT-11.5 Correction cascades may update derived balances on finalized papers (binding).** A cascade started by an authorized correction updates opening and closing on later FINALIZED papers without reopening them. It never changes their taken or returned values. The outbox row is the only record of the operation (DT-14.1).

---

## 12. Submission Gate (called by the paper's morning submit and re-finalize)

**DT-12.1 The gate reports everything at once (binding).** It fails with 400 `{ message, details[] }` if any of these hold:
1. the dairy tray header does not exist (`Dairy tray tracking has not been generated for this paper`);
2. a line with taken > 0 has no stored row (`Missing dairy tray entry for vehicle "X" (SESSION), <tray>`);
3. a stored return exceeds its available balance;
4. a closing balance would be negative.

**DT-12.2 No return-completeness rule (binding).** Because an untouched return is 0 (DT-4.6), the gate never requires returns to be entered, and submitting with all returns at 0 is valid.

**DT-12.3 Carry-forward lines are live until stored (binding).** A carry-forward line (opening only) on the current paper is calculated live for the grid, so the opening is always accurate. It is stored by the next save, Purchase recalculation or cascade, and it does not need a stored row to pass the gate. The next paper's opening still finds the older stored closing across the gap (DT-6.3), so no balance is lost.

**DT-12.4 The gate validates live values (binding).** It evaluates the current paper against stored earlier balances and the paper's purchases. It does not wait for background propagation to finish, and it does not compare stored opening, taken or closing with the live values.

**DT-12.5 Where the gate runs (binding, as implemented).** There is no Dairy Trays check at night submit (the paper is DRAFT, when dairy trays cannot be edited, DT-2.1). The gate in this section runs on morning submit and on re-finalize of a REOPENED paper only. Finalizing a MORNING_SUBMITTED paper does not run it again.

## 13. HTTP Status Conventions

| Situation | Status |
|---|---|
| Format/validation errors, wrong paper status, missing header, over-return, return over the 2,000 limit, inactive entry changed on the normal save, active entry on reconciliation, duplicate entry, unknown row, empty entries, invalid date range, gate not ready | 400 |
| Paper not found | 404 |
| Stale or missing-match token, serialization retry exhausted, return discrepancy (DT-6.5) | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

---

## 14. Data Model and Audit

**DT-14.1 No per-entry audit trail.** Who changed which return, and when, is not recorded. Accountability relies on table timestamps and propagation job records.

**DT-14.2 No schema change.** The token is the existing `dairy_tray_paper.updated_at`. The unused `dairy_tray_transaction.remarks` column stays as is.

**DT-14.3 Frozen tray type (as implemented).** A purchase entry's tray type is captured when the purchase is saved and never changed by later tray-rule changes (PD-33).

**DT-14.4 Unused legacy code is kept for now (operational).** The repository methods `getTrayTypes`, `getVehicles`, `getPreviousPaper`, `getPreviousTrayBalances`, and `TrayCalculationService.buildTakenMapFromPurchaseEntries`, are no longer used by this module. They stay through the initial deployment in case reports or other modules reference them, and are removed after a full codebase audit.

---

## 15. Open Items and Resolved Items

**No item is currently open.** A new ambiguity must be recorded here and decided before any code change.

### Resolved items

| Former item | Decision | Where it is now |
|---|---|---|
| O-1 Token column and token movement | Dairy Trays uses its own `dairy_tray_paper.updated_at` (`dairyTraysUpdatedAt`), never Client Trays' column. The token moves only when dairy tray data really changes; a Purchase recalculation that changes rows advances it. | DT-9.1, DT-9.6, DT-10.1 |
| O-2 Live versus stored carry-forward lines | Accepted. The grid is live; storing happens at the next save, recalculation or cascade. No code change. | DT-12.3 |
| O-3 Combined versus session totals | The combined `totals` is dropped. Totals exist per session only. | DT-3.1, DT-3.7 |
| O-4 NIGHT_SUBMITTED corrections do not cascade forward | Confirmed, same as Client Trays. | DT-10.2 |
| O-5 Gate and pending propagation | Confirmed. The gate validates live values and does not wait for the queue. | DT-12.4 |
| O-6 Job type reuse | Confirmed. `DAIRY_TRAYS_FORWARD` is the only dairy tray job type. | DT-10.8 |
| O-7 `readOnly` row flag | Confirmed. Backend sets it; frontend must disable inputs. | DT-8.5 |
| O-8 Zero purchase key versus stored row | Clarified. The purchase key is a calculation key; DT-7.1 decides storage. A matching note belongs under PD-28. | DT-7.5 |
| O-9 Legacy data | Mandatory post-deployment admin recalculation; legacy discrepancies stay visible and block saves with 409 until corrected. | DT-10.9 |
| O-10 2,000-tray cap | Confirmed for dairy volumes. | DT-4.1, DT-5.12 |
| O-11 Unused legacy methods | Kept through the initial deployment, removed after a codebase audit. | DT-14.4 |
| P-1 Header creation paths | Exhaustive list recorded; no read path creates it. |DT-3.3 |
| P-2 Opening balance and paper status | Status-agnostic, as implemented. A finalized-only rule needs a new owner decision. |DT-6.3 |
| P-3 Purchase operations that drive the recalculation | Saves, deletions, purge and tray re-evaluation; rate recalculation does not. |DT-6.5, DT-10.1 |
| P-4 Retry of business failures | Not retried; transient errors are. Duplicate merging only while PENDING. |DT-10.5 |
| P-5 Night submit | No Dairy Trays gate at night submit. |DT-12.5 |
| P-6 Column order and null vehicle name | Brand then colour; name falls back to vehicle number in the response. |DT-3.4, DT-3.5 |

## 16. Traceability: approved decisions to DT IDs

| Approved decision | Applied as |
|---|---|
| Returns cannot exceed available balance (400, detailed) | DT-5.5, DT-6.5 |
| Balances carry across gaps; most recent earlier closing | DT-6.3 |
| Vehicles with carried balances stay visible | DT-3.5, DT-8.1 |
| Purchases without a tray rule produce no trays or row | DT-6.4 |
| Submission and save gates enforce balance validity | DT-5.5, DT-12.1 |
| GET is read-only | DT-3.3 |
| Inactive tray types stay visible, read-only | DT-8.3, DT-5.7 |
| Inactive vehicles stay visible, read-only for employees | DT-8.2, DT-5.7, DT-5.11 |
| Obsolete rows cleaned only at zero opening/taken/return; positive returns protected | DT-7.1 to DT-7.3 |
| Corrections leaving returns above balance refused with 409 | DT-6.5, DT-10.1 |
| Saved rows must match valid ledger cells or carry-forward lines | DT-5.6, DT-8.4 |
| Cascade creates carry-forward rows (returned 0) | DT-10.3 |
| Last known balance recovered across gaps | DT-6.3 |
| Eventual consistency with live grid | DT-10.6, DT-3.6 |
| Recalculation gated by status and admin endpoints | DT-2.4, DT-11.1 |
| Master data names looked up regardless of status | DT-7.4, DT-8.2 |
| Token mandatory; GET returns it; save returns the new one | DT-9.1 to DT-9.6 |
| Backend status matrix authoritative | DT-2.3 |
| Returns on reopened papers queue a cascade | DT-5.10, DT-10.2 |
| Outbox, chunks of 20, retries, failure tracking | DT-10.5 |
| Finalization queues recalculation and forward propagation | DT-10.4 |
| Atomic saves, header never created by GET | DT-3.3, DT-5.2 |
| 2,000 cap on a row's total across saves | DT-4.1, DT-5.12 |
| Untouched returns are 0; no completeness check | DT-4.6, DT-12.2 |
| Empty entries rejected; 1 to 5,000 entries | DT-4.3 |
| Aggregate then round once; 1 order unit = 1 tray | DT-6.4 |
| Most specific rule wins; frozen assignments; active rules only | DT-6.6, DT-14.3 |
| Balance problems reported together | DT-5.5 |
| Unknown fields stripped | DT-4.5 |
| No clearing to blank | DT-4.6 |
| Sessions are independent ledgers | DT-6.2, DT-3.7 |
| Invalid ids are 400 | DT-3.2, DT-4.2 |
| Throttling 10 / 5 per minute | DT-1.3 |
| Up to 3 serialization attempts | DT-5.2 |
| No audit trail | DT-14.1 |
| Over-returns rejected; admin reconciliation path | DT-5.5, DT-5.11 |
| Consistent error messages and statuses | Section 13 |

---

## 17. Consistency with Client Trays and where Dairy Trays differs

| Topic | Client Trays | Dairy Trays |
|---|---|---|
| Balance rule, 2,000 cap, no negative closing | CT-5.5, CT-5.12 | Same (DT-5.5, DT-5.12) |
| Opening across gaps, non-zero only | CT-6.3 | Same (DT-6.3) |
| Rounding after aggregation | CT-6.4 | Same (DT-6.4) |
| Row retention and protection of positive returns | CT-7.1 to CT-7.3 | Same (DT-7.1 to DT-7.3) |
| Unknown fields stripped, empty entries rejected, 1 to 5,000 | CT-4.3, CT-4.5 | Same |
| Mandatory token, new token returned | CT-9 | Same, but its own column (`dairy_tray_paper.updated_at`), independent of Client Trays |
| Reopened save: forward check then cascade | CT-5.10 | Same (DT-5.10), via `DAIRY_TRAYS_FORWARD` |
| Admin reconciliation and range recalculation | CT-5.11, CT-11.1 | Same (DT-5.11, DT-11.1) |
| No return-completeness check | CT-12.2 | Same (DT-12.2) |
| Ledger key | client + tray type + category | vehicle + tray type + session |
| Scope of opening balance | per delivery group | one ledger for the whole dairy |
| Unit of cascade | sheet, then group | paper |
| Inactive entities | tray types only | tray types and vehicles |
| Gate | every sheet needs a ledger line | purchase-backed lines need a row; balance validity checked |
| Paper id format | digits only | digits only, 1 to 2147483647 |

---

## 18. Change Log (this version)

| ID | Type | Summary |
|---|---|---|
| DT-5.5 / 6.5 / 12.1 | Changed | Returns above the balance rejected (400); corrections leaving returns above balance refused (409); gate checks balance validity |
| DT-6.3 / 10.3 | Changed | Opening carries across gaps; cascade creates carry-forward rows |
| DT-3.5 / 8.1 to 8.3 | Changed | Carried balances, inactive vehicles and inactive tray types stay visible |
| DT-3.3 | Changed | GET no longer creates the header |
| DT-7.1 to 7.3 | Changed | Zero-activity rows cleaned safely; positive returns protected |
| DT-9 | Changed | Token mandatory, returned by GET, advanced and returned by save |
| DT-4.1 / 4.3 / 5.12 | Changed | Returned 0 to 2,000; entries 1 to 5,000; empty rejected |
| DT-4.5 | Changed | Unknown fields stripped |
| DT-5.5 | Changed | All balance problems reported together |
| DT-5.10 / 10.2 | Changed | Reopened return saves check later papers and queue a cascade |
| DT-5.11 / 11.1 | New | Admin reconciliation and range recalculation endpoints |
| DT-2.4 | Changed | Purchase-driven recalculation gated by status |
| DT-3.2 | Changed | Paper id validated 1 to 2147483647 |
| DT-3.7 | Changed | Combined totals removed; per-session totals only |
| DT-9.6 / 10.1 | Changed | Token advances whenever a recalculation or cascade changes stored rows |
| DT-10.2 | Confirmed | NIGHT_SUBMITTED Purchase corrections recalculate the current paper only |
| DT-10.8 / 10.9 | New | One job type; mandatory post-deployment admin recalculation |
| DT-7.5 | New | Purchase key versus stored row clarification |
| DT-8.5 | New | `readOnly` row contract |
| DT-12.3 / 12.4 | Confirmed | Carry-forward lines live until stored; gate validates live values |
| DT-14.4 | New | Unused legacy methods kept until audit |
| DT-3.3 | Clarified |Exhaustive list of header creation paths |
| DT-3.4 / 3.5 | Clarified / Changed | Column order recorded; vehicleName never null (falls back to vehicle number) |
| DT-6.3 | Clarified | Opening balance ignores paper status |
| DT-6.5 / 10.1 | Clarified |	Purchase deletes, purge and tray re-evaluation are subject to the same 409 guard; rate recalculation is not |
| DT-10.5 | Clarified | Business failures skip retries; duplicate merging only while PENDING |
| DT-12.5	| New | Gate runs only on morning submit and re-finalize of a REOPENED paper |
| Section 15 | Changed | All open items resolved |