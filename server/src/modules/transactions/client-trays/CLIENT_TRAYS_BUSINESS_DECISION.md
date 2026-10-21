# Client Trays Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/client-trays/` only (controller, service, repository, builder, DTOs, `services/*`, constants), plus the shared tray calculation (`TrayCalculationService`) and the ledger key utility it uses for client trays.
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 15 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`CT-n`) are stable. Cite them in code comments, PRs and reviews. "Business decision #n" refers to the numbered list of decisions approved by the business owner; Section 16 maps them to CT IDs.

Where a rule is marked **(as implemented)** it describes existing behavior that was reviewed and kept. It is binding only because the business owner approved leaving it unchanged.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Order paper | One per business day. Holds one sheet per delivery group. |
| Sheet | One delivery group's daily sheet (`order_sheet`). Client trays are tracked per sheet. |
| Tray | A returnable crate. One order unit (for example one crate) equals one tray. |
| Tray type | A brand + colour combination (`master_tray_type`), for example "X Blue". |
| Tray rule | Master-data rule that maps a product (brand, group, type, packaging) to a tray type. |
| Ledger line | One saved row in `client_tray_transaction` for one sheet + client + tray type + category. |
| Ledger key | Client + tray type + category (CT-5.1). |
| Category | `MILK` or `NON_MILK`. Each category has its own independent tray ledger (CT-6.1). |
| Opening | Trays the client owed at the end of the previous sheet of the same group. |
| Taken | Trays that went out on this sheet. Calculated from order quantities. Nobody types it. |
| Returned | Trays the client handed back. The only value an employee enters. |
| Closing | Opening + Taken − Returned. Becomes tomorrow's opening. |
| Available balance | Opening + Taken for a ledger line. The most that can be returned (CT-5.5). |
| Frozen field | Value captured when an order line is created and never changed by later saves (the line's tray type). |
| Concurrency token | `order_sheet.client_trays_updated_at`, exposed as `sheet.client_trays_updated_at` on load and `clientTraysUpdatedAt` on save. Sent back as `expectedUpdatedAt`. |
| Cascade | Background job that refreshes opening and closing balances of later sheets of the same group. |
| Return discrepancy | A stored return that is higher than the line's available balance after a quantity or balance change (CT-6.6). Always refused, never capped or deleted. |
| Reconciliation | The admin-only correction of returns on an inactive tray type (CT-5.11). |
| Forward propagation | Background job that fully recalculates a paper's own sheets, then cascades to later sheets. |

---

## 1. Access and Roles

**CT-1.1** The sheet view and the save endpoint require login (JWT) and the `EMPLOYEE` role. `ADMIN` also passes via the role hierarchy. *(Authorization unchanged, business decision #31.)*

**CT-1.2** Two Client Trays endpoints require the `ADMIN` role: the range recalculation (CT-11.1, business decision #26) and the inactive tray type reconciliation (CT-5.11, CT-15.5). Both are new. Neither changes any existing endpoint's authorization.

**CT-1.3** Save is throttled to 10 requests per minute per user. Range recalculation and reconciliation are each throttled to 5 requests per minute per user. Sheet view uses the global limit. Exceeding a limit returns 429.

---

## 2. Workflow: what can be done at each paper status

**CT-2.1 Status matrix (binding, as implemented):**

| Paper status | View sheet | Save returns | Grid shows quantities from |
|---|---|---|---|
| DRAFT | Yes | No | Ordered |
| NIGHT_SUBMITTED, before the morning delivered quantities are saved in Orders | Yes | Yes | Ordered |
| NIGHT_SUBMITTED, after the morning delivered quantities are saved in Orders | Yes | Yes | Delivered |
| MORNING_SUBMITTED | Yes | No | Delivered |
| FINALIZED | Yes | No | Delivered |
| REOPENED | Yes | Yes | Delivered |

*(Business decisions #5 and #30: ordered quantities stay in use until morning delivered quantities are saved in Orders; return editing follows the existing paper-status restrictions.)*

**CT-2.2** A save outside NIGHT_SUBMITTED or REOPENED returns HTTP 400 `Tray cannot be edited in the current workflow state`.

**CT-2.3** `workflow.editable` in the sheet view is true only in NIGHT_SUBMITTED and REOPENED.

**CT-2.4** Employees can correct returns during night submission (NIGHT_SUBMITTED). After morning submit, returns can be changed again only if an admin reopens the paper. *(Business decision #5.)*

---

## 3. Sheet View (`GET /client-trays/sheet/:sheetId`)

**CT-3.1** The response contains `sheet` (including `client_trays_updated_at`, the concurrency token, null until the first save), `workflow`, `milkTrayGrid` and `nonMilkTrayGrid`.

**CT-3.2 Sheet not found is 404** `Sheet not found`. A non-numeric sheet id is rejected with 400.

**CT-3.3 Columns.** A pinned "Client" column, then one group per brand ("X Tray"), then one group per colour ("Blue Tray"), each with four sub-columns: Opening, Trays, Returned, Closing. Only Returned is editable, and only for an active tray type (CT-8.4). Field names are `tray_<trayTypeId>_opening`, `tray_<trayTypeId>`, `tray_<trayTypeId>_returned`, `tray_<trayTypeId>_closing`.

**CT-3.4 Rows.** One row per client that has a ledger line in that grid's category (CT-8.1). Every row shows every tray column of its grid, with zeros where the client has no line for that tray type. Rows are sorted by client name.

**CT-3.5 Values.**
- Opening, Trays (taken) and Closing are calculated live from the previous sheet, the order lines and the stored returns. They are not read back from stored opening/taken/closing.
- Returned shows the stored value. An untouched return is 0 (CT-4.6), so the screen never shows an empty return.

**CT-3.6 Totals.** Per grid: client count, and opening, taken, returned and closing per tray type.

**CT-3.7** Milk and non-milk grids are fully independent (CT-6.1). A client with the same tray type in both categories appears in both grids with separate numbers.

---

## 4. Input Validation Rules (save request)

Body: `{ entries: [{ clientId, trayTypeId, category, returned }], expectedUpdatedAt }`

**CT-4.1 Returned quantity (binding).** A whole number from 0 to 2,000. Decimals (`7.5`), negatives, strings (`"5"`), null, and omitted are rejected with 400. The maximum is 2,000 trays for the total return of one ledger row on a sheet (CT-5.12). *(Business decisions #2 and #3, CT-15.6: maximum 2,000, subject to the balance rule in CT-5.5.)*

**CT-4.2 Identifiers.** `clientId` and `trayTypeId` are whole numbers of 1 or more. `category` is required and must be `MILK` or `NON_MILK`.

**CT-4.3 Entries array.** Required, 1 to 5,000 items. An empty array is rejected with 400. *(Business decision #19.)*

**CT-4.4 Duplicates.** The same client + tray type + category more than once in one request is rejected with 400 `Duplicate entry for client X, tray type Y, CATEGORY. Each client, tray type and category can appear only once.` The same client and tray type in different categories is not a duplicate. *(Business decision #18.)*

**CT-4.5 Unknown fields are stripped, not rejected.** Extra properties at the top level and inside each entry are removed before validation. This applies to the Client Trays save endpoint only. *(Business decision #20. This intentionally differs from Orders OD-5.5, which rejects unknown fields.)*

**CT-4.6 Untouched returns are zero, with no save needed (binding).** A return nobody entered is 0 from the moment the ledger line is calculated. It is stored as 0, never as empty, and nothing in the workflow waits for a save to make it 0. On save, every ledger line that is not in the request keeps its stored return. *(Business decision #3, CT-15.4.)*

**CT-4.7 Validation order.** Request-shape checks (CT-4.1 to CT-4.5) and the duplicate check run before the database transaction starts, so a malformed request never touches data. The token check, status check and balance checks run inside the transaction.

---

## 5. Save (`POST /client-trays/sheet/:sheetId/save`)

**CT-5.1 Ledger key (binding).** A ledger line is identified by sheet + client + tray type + **category**. The database enforces this with a unique key on all four. *(Business decision #9.)*

**CT-5.2 Atomic.** The whole request is one serializable transaction. If anything fails, nothing is saved and the concurrency token is rolled back too. On a database serialization conflict the system makes at most 3 total attempts, then returns 409 `Your request conflicted with another update and could not be completed. Please retry.`

**CT-5.3 Order of checks inside the transaction:** sheet exists (404) → paper status allows editing (400, CT-2.2) → concurrency token (409, CT-9) → every entry validated against the server's own calculated ledger (400) → write.

**CT-5.4 The server's numbers are authoritative.** Opening, taken and balances are always recalculated on the server. The client sends only returns. Nothing the client sends can change opening or taken.

**CT-5.5 Balance rule (binding).** An entry's `returned` must not exceed that ledger line's available balance (opening + taken). A client may return more than today's delivery, because trays accumulate from earlier days. A client may not return more than the total outstanding, so closing can never become negative through a save. A violation is rejected with 400 and the message lists every offending client and the available balance: `Client "X": 26 <brand> <colour> tray returned exceeds the outstanding balance of 25`. All balance problems in one request are reported together in `details`. *(Business decisions #1 and #4.)*

**CT-5.6 Cell must exist.** An entry for a client or tray type that has no ledger line in that category's grid is rejected with 400 `Tray row not found for client X`. This covers an unknown client, a client with no ledger line in that category, and a tray type that is not a column in that category. A client that does appear in that category's grid, with a tray type that is a column there but that the client has no line for, is accepted only with `returned = 0` (otherwise CT-5.5 rejects it because the available balance is 0).

**CT-5.7 Inactive tray types are read-only for ordinary users.** On the normal save, an entry for an inactive tray type is accepted only if `returned` equals the stored value (the frontend echoing back what it received). A different value is rejected with 400 `Client "X": <brand> <colour> tray is inactive and read-only`. Changing them is the job of the admin reconciliation route (CT-5.11). *(Business decision #10, CT-15.5.)*

**CT-5.8 What is written.** The complete calculated ledger for the sheet: each line gets its opening, taken, the returned value (CT-4.6) and closing. Lines that no longer qualify are removed (CT-7.3). The write is restricted to this sheet.

**CT-5.9 Response** `{ success: true, message: "Tray returns saved successfully", clientTraysUpdatedAt }`, where `clientTraysUpdatedAt` is the NEW token (CT-9.4). *(Business decision #16.)*

**CT-5.10 Save on a REOPENED paper queues a cascade, after a conflict check.** Because a changed closing balance must reach later sheets, a save on a REOPENED paper first checks every later sheet of the group in memory. If any of them would be left with returns above its balance, the whole save is refused with 409 (CT-6.6). Otherwise the save succeeds and a forward cascade for this sheet is queued through the existing propagation queue (CT-10.2). A save on NIGHT_SUBMITTED does neither.

**CT-5.11 Reconciling inactive tray types: `POST /client-trays/sheet/:sheetId/reconcile-inactive` (ADMIN only, binding).** The body and every rule are the same as the normal save (token, status, balance rule, limit, cascade on a reopened paper), with one difference: only inactive tray types can be changed. An entry for an active tray type is rejected with 400 `Client "X": <brand> <colour> tray is active. Use the normal save instead of reconciliation`. It is not a way around CT-10.8, because the master data stays unchanged. *(CT-15.5.)*

**CT-5.12 The 2,000 limit is on the row's total (binding).** The limit applies to the total returned for one ledger row (sheet + client + tray type + category). A save sets that total, it does not add to it, so the limit holds across saves. It is checked in the request (CT-4.1) and again in the service, so the admin route is covered too. Over the limit: 400 `Client "X": 2001 <tray> returned exceeds the limit of 2000 per row`. *(CT-15.6.)*

---

## 6. Ledger Calculation

**CT-6.1 Milk and non-milk ledgers are separate (binding).** Balances are maintained independently per category, even when the same tray type is used in both. A return entered for milk never reduces a non-milk balance. *(Business decision #9.)*

**CT-6.2 Formula.** `Closing = Opening + Taken − Returned`, where an empty return counts as 0.

**CT-6.3 Opening balance (as implemented, extended by category).** The closing balance of the immediately previous sheet of the SAME delivery group (latest earlier sale date), per client + tray type + category. Only non-zero closings carry forward. **Balances carry across gaps (binding, CT-15.7):** for each client + tray type + category, the opening is the most recent earlier closing in the same group, even when the immediately previous sheet has no line for it. If the latest earlier closing is 0, or there is none, opening is 0. A client who changes group starts from 0 in the new group.

**CT-6.4 Taken is aggregated before rounding (binding).** Quantities of all order lines for the same client + tray type + category are summed first and rounded once, half-up. They are NOT rounded line by line. Examples: three lines of 0.4 crates total 1.2 crates and give 1 tray; 10.5 crates gives 11 trays; 10.4 gives 10. *(Business decision #6. This replaces the old per-line rounding for Client Trays.)*

**CT-6.5 Ordered vs delivered quantity (binding, as implemented).**
- Ordered quantity is used in DRAFT, and in NIGHT_SUBMITTED until the morning delivered quantities have been saved in Orders.
- Delivered quantity is used after that, and always in MORNING_SUBMITTED, FINALIZED and REOPENED.
- A cancelled line contributes 0.
- A line with no delivered quantity entered yet contributes 0 once delivered quantities are in use.

**CT-6.6 A correction that would leave returns above the balance is blocked (binding).** Closing can never go negative, and a stored return is never capped or reduced to make it fit. If a quantity correction (an Orders save, a cascade, or an admin recalculation) would leave any stored return higher than that line's available balance, on this sheet or on any later sheet of the group, the change is refused until the returns are corrected first.
- An Orders save: refused with 409, nothing is saved, and the response lists each client, tray and the sale date: `2026-01-05, client "X": 5 <tray> returned but only 3 outstanding`. This is checked in the same transaction as the Orders save, so no half-applied correction exists. On a REOPENED paper the check also covers every later sheet.
- A return save on a REOPENED paper: refused with 409 in the same way (CT-5.10).
- A background cascade or admin recalculation that meets a conflict: the job fails and shows as FAILED, with the same list in `last_error`, in the paper propagation status. Nothing is capped. After the returns are fixed the admin retries the failed job.
*(CT-15.1.)*

---

## 7. Ledger Row Management

**CT-7.1 A ledger line exists only while it carries activity (binding).** A line is kept if its opening is non-zero OR its taken is greater than 0. *(Business decisions #7 and #12.)*

**CT-7.2 Zero-activity lines are removed, but never with a positive return (binding).** A line is removed whenever opening and taken are both 0 and its return is 0. A line that still holds a positive return is never removed or hidden. The change that would do so is refused instead (CT-6.6). The ledger builder also refuses to drop such a row as a last safeguard. *(Business decision #11, CT-15.2.)*

**CT-7.3 Obsolete rows are deleted safely (binding).** Whenever a sheet's ledger is rewritten, stored lines that are not part of the newly calculated ledger are deleted. This includes the case where the new ledger is empty. Deletion is restricted to the sheet being written. *(Business decision #13.)*

**CT-7.4 Historical balances are never dropped because of master data (binding).** An outstanding balance is never removed merely because the client, product or tray type is no longer active. *(Business decision #14.)*

---

## 8. Visibility of Clients and Tray Types

**CT-8.1 Who appears (binding).** A client appears in a category's grid if it has a ledger line in that category: a non-zero opening balance, or taken greater than 0 on the current sheet. This includes a new client receiving deliveries with no previous balance. *(Business decision #7.)*

**CT-8.2 Outstanding balances stay visible (binding).** A client with an outstanding balance remains visible even with no current order lines, and even if the client is inactive or has moved to another group. Client names are looked up by id regardless of status. *(Business decision #8.)*

**CT-8.3 A client with no balance and no delivery on this sheet is not shown**, even if they appear on other sheets.

**CT-8.4 Inactive tray types with open balances stay visible as read-only columns.** The Returned column for an inactive tray type is not editable, so employees can see and reconcile historical balances without changing them. *(Business decision #10.)*

**CT-8.5 Tray-type columns** shown in a grid are exactly the tray types that have a ledger line in that category.

---

## 9. Concurrency Token

**CT-9.1 Sheet-level (binding).** The token is `order_sheet.client_trays_updated_at`. Concurrency control stays at the sheet level, not per client or per row. *(Business decision #17.)*

**CT-9.2 Mandatory (binding).** `expectedUpdatedAt` is required on every save.
- **Omitted → always 400.** It is never treated as `null`.
- **Explicit `null`** is accepted only for the first save on a sheet whose token is still empty. If a token already exists, `null` produces the normal 409.
- **A value** must be ISO-8601 and equal the current token, else 409. A malformed value is 400 `Invalid expectedUpdatedAt`.
- A missing or stale token is rejected. There is no unchecked save path.
*(Business decision #15. Same contract as Orders OD-12.7.)*

**CT-9.3 Stale response.** 409 `Client Trays data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.`

**CT-9.4 Save returns the new token (binding).** The frontend replaces its local token with `clientTraysUpdatedAt` and can save again without reloading. *(Business decision #16.)*

**CT-9.5 Rollback.** The token is advanced inside the same transaction as the data. If the save fails for any reason, the token is rolled back with it.

---

## 10. Recalculation and Propagation

**CT-10.1 Orders-driven recalculation (as implemented).** After every Orders save that processes entries, the affected sheet's ledger is recalculated in the same transaction (opening from the previous sheet, taken from the order lines, returns preserved exactly as stored, including empty). A failure rolls back the Orders save.

**CT-10.2 Reopened corrections propagate forward (binding).** When delivered quantities are corrected on a REOPENED paper, the affected sheet is recalculated and a forward cascade is queued in the same transaction. The same applies when returns are saved on a REOPENED paper (CT-5.10). The cascade refreshes opening and closing of every later sheet of the same delivery group, whatever its paper status (CT-11.4). Before the change is saved, the conflict check in CT-6.6 runs over those later sheets. *(Business decision #25. Verified: the existing outbox → queue → processor mechanism handles delivered-quantity corrections and is reused unchanged.)*

**CT-10.3 What a cascade changes and what it never changes (binding, as implemented).** Later sheets receive only refreshed opening and closing balances. Their taken and returned values are never touched by someone else's correction. Only the corrected sheet is fully recalculated. *(Business decision #28, verified in code, no change made.)*

**CT-10.4 Carry-forward rows.** A cascade creates a ledger line on a later sheet for a client whose carried-forward balance is non-zero and who has no line yet. Because balances carry across gaps (CT-6.3), this also applies when earlier sheets in between had no line for that client. A carry-forward line has a return of 0 (CT-4.6).

**CT-10.5 Finalizing a paper queues a forward propagation** for that paper: every sheet of the paper is fully recalculated, then each group's later sheets are cascaded. *(As implemented.)*

**CT-10.6 Reliability of queued jobs (as implemented).**
- The job request is stored in an outbox row in the same database transaction as the change, so it cannot be lost.
- A relay dispatches pending outbox rows every 5 seconds. Duplicate pending requests for the same target are merged.
- Each job runs in a serializable transaction in chunks of 20 sheets and resumes where it stopped.
- A job is retried up to 5 times with exponential backoff, then marked FAILED.
- A row stuck in PROCESSING for 2 minutes is re-queued.
- Progress, failures and retry are visible through the existing paper propagation endpoints.
- The list of a paper's sheets is read in a fixed order (by sheet id) so a resumed job never skips a group.

**CT-10.7 Eventual consistency.** Later sheets are refreshed in the background, shortly after the change. Between the change and job completion, later sheets can show the previous opening. The propagation status endpoints show whether a paper still has work in progress.

**CT-10.8 Master data is not changed while a paper is being worked on (binding, operational).** No tray rule, tray type or other master-data change is made while a paper is in progress. This is a business procedure, not enforced by code. *(Business decision #24.)*

---

## 11. Administrative Recalculation and Correction

**CT-11.1 `POST /client-trays/recalculate` (ADMIN only).** Body: `{ fromDate, toDate }`, both `YYYY-MM-DD` sale dates, inclusive. Queues a forward propagation (CT-10.5) for every paper whose sale date is in the range. Response `{ papersQueued, fromDate, toDate, operations }`, where `operations` lists `{ paperId, operationId }` for each queued job. `operationId` is the propagation outbox row, so every run can be followed, including any failure and its reason, in the existing paper propagation status (`GET /papers/:id/propagation`). It returns immediately; the work runs in the background. *(Business decision #26, CT-15.3.)*

**CT-11.2 Date rules.** Both dates must be real calendar dates in `YYYY-MM-DD` form (else 400). `fromDate` must not be after `toDate` (400). The range cannot exceed 31 days (400). A range with no papers is valid and queues nothing.

**CT-11.3 Effect.** Each paper in the range has all its sheets fully recalculated (taken from order lines, current tray rules for lines without a frozen tray type, returns preserved). Every later sheet of the same group, including sheets outside the range, has opening and closing refreshed (CT-10.3).

**CT-11.4 Finalized historical sheets change only through an explicit administrative process (binding).** Reopening a paper is admin-only. Returns and delivered quantities of a finalized sheet can be changed only after an admin reopens the paper. Tray balances of finalized sheets can be rebuilt in bulk only through CT-11.1. No employee-level action alters a finalized sheet.

**CT-11.5 Correction cascades may update derived balances on finalized sheets (binding).** A cascade started by an authorized correction (a reopened paper's quantity or return change, or the admin range recalculation) updates opening and closing on later FINALIZED sheets without reopening them. It never changes their taken or returned values. The only record of the operation is its propagation outbox row (type, paper, status, attempts, last error, time), which is the operation-level tracking. No per-entry audit trail is added (CT-14.1). *(Business decisions #25 and #27, CT-15.3.)*

---

## 12. Submission and Finalization Gates (validators owned by Client Trays)

**CT-12.1 Night submit: tray calculation must exist.** Every sheet must have at least one ledger line, otherwise 400 `Tray calculation failed`. *(As implemented.)*

**CT-12.2 No return-completeness check (binding).** Because an untouched return is 0 (CT-4.6), morning submit and re-finalize no longer require returns to be entered or saved. The check and its error `Tray returns incomplete for: ...` are removed. *(CT-15.4. This replaces business decision #29, which asked for every incomplete client to be listed, because nothing can be incomplete any more.)*

**CT-12.3** Submission still depends on the return rules that remain: a return can never exceed its balance (CT-5.5) and a conflicting correction is blocked (CT-6.6).

---

## 13. HTTP Status Conventions

| Situation | Status |
|---|---|
| Format/validation errors, wrong paper status, over-return, return over the 2,000 limit, inactive tray type changed (normal save), active tray type (reconciliation), duplicate entry, unknown tray row, empty entries, invalid date range | 400 |
| Sheet not found | 404 |
| Stale or missing-match token, serialization retry exhausted, return discrepancy (CT-6.6) | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

---

## 14. Data Model and Audit

**CT-14.1 No per-entry audit trail at this stage.** Who changed which return, and when, is not recorded. *(Business decision #32.)*

**CT-14.2 Fields removed.** `client_tray_transaction.remarks`, `client_tray_transaction.expected_trays_taken` and `order_sheet.client_tray_morning_saved_at` are removed. The existing `updated_at` timestamps are considered sufficient. *(Business decisions #33, #34, #35.)*

**CT-14.3 Field added.** `client_tray_transaction.category` (required). Existing rows are backfilled by inferring the category; the migration stops if a row cannot be inferred and that row must be resolved manually.

**CT-14.4 Frozen tray type (binding, as implemented).** An order line's tray type is captured when the line is created and never changed by later tray-rule changes. For a line with no stored tray type, the active tray rules are used. *(Business decision #21.)*

**CT-14.5 Tray rule matching (binding, as implemented).** A rule matches when each of its brand, product group and product type is either empty (wildcard) or equal to the product's. If the rule applies to packaging, the packaging type must also match. The most specific matching rule wins (most filled-in fields). Among equally specific rules, the lowest rule id wins. Overlapping or ambiguous wildcard rules are left as they are. A product with no matching rule produces no trays. *(Business decisions #22 and #23.)*

---

## 15. Open Items

**None.** All seven items that were open in the previous version were decided by the business owner and are now binding rules above. A new ambiguity must be recorded here and decided before any code change.

### Resolved items

| Former item | Decision | Where it is now |
|---|---|---|
| CT-15.1 Negative closing after an upstream correction | Block conflicting quantity corrections until the return discrepancy is resolved. Never silently cap returns. | CT-6.6, CT-5.10, CT-10.2 |
| CT-15.2 A return disappearing with its row | Never silently delete a row that has a positive recorded return. | CT-7.2, CT-6.6 |
| CT-15.3 "Explicit administrative correction process" | Authorized correction cascades may update derived balances on finalized sheets, with operation-level tracking. | CT-11.1, CT-11.4, CT-11.5 |
| CT-15.4 Carry-forward lines and the completeness check | Untouched returns are zero without requiring a save. | CT-4.6, CT-12.2 |
| CT-15.5 Reconciling an inactive tray type | Inactive tray types stay read-only for ordinary users. A controlled administrative reconciliation route exists. | CT-5.7, CT-5.11, CT-1.2 |
| CT-15.6 Scope of the 2,000 limit | The limit is on the total return for the logical ledger row on the sheet, across saves. | CT-4.1, CT-5.12 |
| CT-15.7 Clients with a balance but no line on a day | Outstanding balances carry across gaps, using the most recent applicable prior balance. | CT-6.3, CT-10.4 |

---

## 16. Change Log (this version)

| ID | Type | Summary |
|---|---|---|
| CT-5.5 / 4.1 / 6.6 | Changed | Return may exceed today's delivery but not the available balance. Max 2,000. Untouched returns are 0 (#1, #2, #3, #4) |
| CT-6.4 | Changed | Quantities aggregated per client, tray type and category before a single rounding (#6) |
| CT-6.5 / 2.1 / 2.4 | Kept | Ordered-until-morning-saved workflow and status restrictions (#5, #30) |
| CT-8.1 / 8.2 / 7.1 | Changed | Visibility follows tray balances and current activity; outstanding balances stay visible (#7, #8) |
| CT-5.1 / 6.1 / 3.7 | Changed | Milk and non-milk ledgers are separate (#9) |
| CT-8.4 / 5.7 | Changed | Inactive tray types with balances stay visible, read-only (#10) |
| CT-7.2 / 7.1 / 7.3 / 7.4 | Changed | Zero-activity rows removed; meaningful rows kept; obsolete rows deleted safely even if the set is empty; history never dropped (#11, #12, #13, #14) |
| CT-9.1 to 9.5 | Changed | Mandatory sheet-level token, new token returned on save (#15, #16, #17) |
| CT-4.4 / 4.3 / 4.5 | Changed | Duplicate entries rejected, empty saves rejected, unknown fields stripped (#18, #19, #20) |
| CT-14.4 / 14.5 | Kept | Frozen tray type, lowest-id tie-break, overlapping rules unchanged (#21, #22, #23) |
| CT-10.8 | Documented | No master-data changes during an active paper (#24) |
| CT-10.2 / 10.3 / 10.6 | Verified / Changed | Existing propagation reused. Return edits on reopened papers now queue a cascade. Sheet list read in fixed order (#25, #28) |
| CT-11.1 to 11.4 | Changed | Admin range recalculation. Finalized history changes only through admin process (#26, #27) |
| CT-12.2 | Superseded | Listing every incomplete client (#29) was replaced by removing the completeness check (CT-15.4) |
| CT-1.1 | Kept | Authorization unchanged (#31) |
| CT-14.1 / 14.2 / 14.3 | Changed | No audit trail. `remarks`, `expected_trays_taken`, `client_tray_morning_saved_at` removed. `category` added (#32, #33, #34, #35) |
| CT-6.6 / 5.10 / 7.2 | Changed | Quantity corrections that would leave returns above the balance are blocked, returns are never capped or silently deleted (CT-15.1, CT-15.2) |
| CT-11.1 / 11.4 / 11.5 | Changed | Admin recalculation returns tracked operation ids. Correction cascades may update finalized sheets (CT-15.3) |
| CT-4.6 / 12.2 / 12.3 | Changed | Untouched returns are 0 with no save required. Completeness check removed (CT-15.4). Replaces business decision #29 |
| CT-5.7 / 5.11 / 1.2 | Changed | Inactive tray types read-only for ordinary users. Admin reconciliation route added (CT-15.5) |
| CT-4.1 / 5.12 | Changed | 2,000 limit applies to the row's total return across saves (CT-15.6) |
| CT-6.3 / 10.4 | Changed | Balances carry across gaps using the most recent prior balance (CT-15.7) |