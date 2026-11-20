# Client Trays Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Client Trays module. No automated tests are included.

## Evidence and Labels

`CLIENT_TRAYS_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its CT-n items are treated as confirmed requirements. The Client Trays code (controller, service, repository, builder, validation, propagation, DTOs, interceptor), the shared `TrayCalculationService`, the propagation queue, the Orders, Paper and Workflow code and decision files, and the frontend Client Trays feature files were used as supporting evidence only.

**Not available** (each would shrink the Unknowns list): existing Client Trays tests and issue/bug history, Swagger output, UI mockups, `COLLECTION_BUSINESS_DECISION.md` and `DAIRY_TRAYS_BUSINESS_DECISION.md`, the frontend `http` and `error` helpers (`getApiErrorStatus`, `extractErrorMessage`), `paper.types.ts`, the AG Grid version and config, the Prisma version (affects D-10), and the migration that backfilled `category`.

**Labels:** **\[C\]** confirmed requirement (CT/OD/PA id). **\[O\]** observed in code only. **\[I\]** inferred assumption. **\[U\]** unknown, needs a decision.

**Impl column (section C):** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. U-n points to an open question in section E. Seam means it can only be exercised with DB seeding or a fault injection, not through the public API. Nothing was compiled or run; every Impl cell is a reading of the code.

**Revision note:** the owner answered Q1 to Q16 after this was first written (several were delegated to Claude and are marked so in section F). The Impl cells in section C were updated where an answer changes them, and section F records the decisions, the discrepancy status and the new scenarios. Sections D and E show the state before the decisions. The code changes are implemented but not yet compiled or run.

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /client-trays/sheet/:sheetId` | EMPLOYEE (ADMIN passes) | global 300/min | Milk and non-milk tray grids, workflow, sheet with token |
| `POST /client-trays/sheet/:sheetId/save` | EMPLOYEE | 10/min | Set returned trays per (client, tray type, category) |
| `POST /client-trays/sheet/:sheetId/reconcile-inactive` | ADMIN | 5/min | Same body and rules, but only inactive tray types can change |
| `POST /client-trays/recalculate` | ADMIN | 5/min | Queue a background recalculation for papers in a sale-date range |

**Indirect triggers (no Client Trays endpoint):** every Orders save that processes entries recalculates the sheet ledger in the same transaction (CT-10.1). A REOPENED Orders correction also runs a forward conflict dry run and queues a cascade. Paper finalize queues a forward propagation (CT-10.5). Night submit, morning submit and re-finalize call no Client Trays gate (PA-6.3, CT-12.2).

**UI:** `ClientTraysPage` (remounted per sheet), `ClientTraysToolbar`, two `ClientsGrid` instances (milk, non-milk), and an ADMIN-only `ClientTraysAdminPanel` (reconcile toggle, range recalculation).

### A2. What each paper status allows \[C: CT-2.1 to 2.4\]

| Paper status | View | Save returns | Grid quantity basis |
| --- | --- | --- | --- |
| DRAFT | Yes | No (400) | Ordered |
| NIGHT\_SUBMITTED, before a morning save in Orders | Yes | Yes | Ordered |
| NIGHT\_SUBMITTED, after a morning save (also after a PA-18 revert) | Yes | Yes | Delivered |
| MORNING\_SUBMITTED | Yes | No (400) | Delivered |
| FINALIZED | Yes | No (400) | Delivered |
| REOPENED | Yes | Yes (queues a cascade) | Delivered |

### A3. Ledger line lifecycle

1. **Created** by an Orders recalculation (or a cascade carry-forward) when the line has a non-zero opening or taken above 0. Return starts at 0, stored as 0 \[C: CT-4.6, 7.1, 10.4\].
2. **Return entered** by an employee through save (only editable value) \[C: CT-4.1\].
3. **Recalculated** on every Orders save, finalize propagation or admin range recalculation: opening from the latest earlier closing in the same group, taken from order lines, returns preserved \[C: CT-10.1, 6.3\].
4. **Cascaded:** later sheets get new opening and closing only \[C: CT-10.3\].
5. **Removed** when opening and taken are both 0 and the return is 0. Never removed while a positive return exists; the change is refused instead \[C: CT-7.2, 6.6\].
6. **Stranded (legacy):** a stored return above its balance. Displayed, blocks every save on that sheet until repaired \[C: CT-5.13, pending approval\].

### A4. Side effects and downstream consumers

- **Concurrency token:** `order_sheet.client_trays_updated_at`, advanced once per successful tray save, inside the save transaction \[C: CT-9\]. \[O\] Orders recalculation and cascades do not advance it.
- **Outbox and queue:** a REOPENED save enqueues `CLIENT_TRAYS_CASCADE_FROM_SHEET` after a forward dry run \[C: CT-5.10\]. Range recalculation enqueues `CLIENT_TRAYS_FORWARD` per paper \[C: CT-11.1\].
- **Consumers:** the next sheet's opening reads this sheet's stored closing. Paper propagation status reports failures.
- **No audit trail** for individual returns \[C: CT-14.1\].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | Closing = opening + taken - returned, and no user action leaves it negative | CT-6.2, 5.5, 6.6 |
| INV-2 | A return never exceeds opening + taken, and never exceeds 2,000 per row | CT-5.5, 4.1, 5.12 |
| INV-3 | Returns are never capped, reduced or silently deleted to make a change fit | CT-6.6, 7.2 |
| INV-4 | Server numbers are authoritative; the client sends only returns | CT-5.4 |
| INV-5 | Ledger key is sheet + client + tray type + category; milk and non-milk never mix | CT-5.1, 6.1 |
| INV-6 | Taken = sum of quantities per (client, tray type, category), rounded once half-up | CT-6.4 |
| INV-7 | An untouched return is 0 and stored as 0, never empty | CT-4.6 |
| INV-8 | Each save is all-or-nothing, including the token | CT-5.2, 9.5 |
| INV-9 | `expectedUpdatedAt` is mandatory; omitted is 400; explicit null only for the first save | CT-9.2 |
| INV-10 | Balances are never dropped because a client, product or tray type is inactive | CT-7.4 |
| INV-11 | A cascade changes only opening and closing of later sheets | CT-10.3 |
| INV-12 | Finalized sheets change only through admin reopen, admin recalculation or an authorized cascade | CT-11.4, 11.5 |

**Security constraints**

- SEC-1: JWT required on all endpoints; an inactive user gets 401 \[I, from `JwtStrategy`\].
- SEC-2: the role comes from the DB-backed user, never the body.
- SEC-3: reconcile and range recalculation are ADMIN-only \[C: CT-1.2\].
- SEC-4: unknown body fields are stripped, not rejected, on save and reconcile only \[C: CT-4.5\]. Other routes keep the global reject.
- SEC-5: id format is digits only, 1 to 2147483647 \[C: CT-3.2, I from `ParseIdPipe`\].
- SEC-6: raw SQL in `replaceTrayTransactions` is parameterized \[O\].
- SEC-7: unexpected errors are masked with a request id \[I, from PA-11.5\].
- SEC-8: there is no per-group or per-sheet authorization \[U: Q7\].
- SEC-9: reads return the full `order_paper` and `master_group` rows (including `reopen_reason`) to every employee \[O, consistent with PA-1.3\].

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Access, throttling | CT-1.1 to 1.3 |
| Workflow matrix, error | CT-2.1 to 2.4 |
| Sheet view | CT-3.1 to 3.7 |
| Input validation | CT-4.1 to 4.7 |
| Save, balance rule, inactive types, reconcile, limit, stranded rows | CT-5.1 to 5.13 |
| Ledger calculation | CT-6.1 to 6.6 |
| Row management | CT-7.1 to 7.4 |
| Visibility | CT-8.1 to 8.5 |
| Concurrency token | CT-9.1 to 9.5 |
| Recalculation and propagation | CT-10.1 to 10.8 |
| Admin recalculation | CT-11.1 to 11.5 |
| Gates | CT-12.1 to 12.3 (and PA-6.3) |
| Statuses | CT-13 |
| Data model, tray rules | CT-14.1 to 14.5 |
| Cross-module | OD-6.13, OD-7.9, PA-8.7, PA-10.x, PA-2.5 |

**Approved (Q10):** CT-5.13 was marked pending owner approval. It is now approved as written and implemented (D-5, section F).

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | Save, reconcile and recalculate have no `@HttpCode`, so success is 201. Orders fixed the same issue with `@HttpCode(200)` | `client-trays.controller.ts`, Orders DISC-1 |
| O-2 | An identical-values save is a change: token advances, rows rewritten, and on REOPENED a cascade is queued | `client-trays.service.ts` |
| O-3 | The token is advanced only by tray saves. Orders recalculation, cascades and propagation rewrite ledger rows without touching it | `client-trays.service.ts`, `client-trays-propagation.service.ts` |
| O-4 | A malformed token is a 400 raised before the transaction, so it wins over 404 and over a wrong-status 400 | `parseExpected` placement |
| O-5 | Loose ISO tokens: any parseable timestamp is accepted; a different value is 409 | `optimistic-concurrency.service.ts` |
| O-6 | The `TRAY_ROW_NOT_FOUND` check throws on the first bad entry; balance problems are collected | `client-trays-validation.service.ts` |
| O-7 | The service-level 2,000 check and `RETURN_EXCEEDS_LIMIT` message are unreachable through the API; the DTO `@Max` fires first | DTO, validation service |
| O-8 | A transaction timeout (10 s) returns 409 "took too long and nothing was saved" | `transaction-runner.ts` |
| O-9 | New taken keeps accruing on inactive tray types if a rule or a frozen line still points at them | `buildTakenMap` |
| O-10 | A line with a null tray type is resolved from live rules on every recalculation (so "frozen" only holds for non-null) | `resolveFrozenTrayTypeId` |
| O-11 | `getOpeningBalances` reads every earlier ledger row of the group and de-duplicates with `distinct`; it is re-run per cascade step and per dry-run step | repository, propagation service |
| O-12 | UI sends every active-tray Returned cell of both grids on each save, edited or not; blank becomes 0; no client-side validation | `ClientTraysPage.tsx` |
| O-13 | UI save with zero collectable entries returns silently with no message | `handleSave` |
| O-14 | UI clears edits on every 409 (including a timeout 409 and a return-discrepancy 409) and reloads | page `onError`, hook `onError` |
| O-15 | `useClientTrays` turns off refetch on focus and reconnect; the app `QueryClient` leaves `staleTime` at 0 and retries only network and 5xx | hook, `QueryProvider.tsx` |
| O-16 | Dead code: `validateTrayCalculationExists`, `calculateTraysTaken`, `getClientsByGroupAndCategory`, a commented `getTrayTypes` | repository, validation, calculation service |
| O-17 | No DB constraint enforces closing >= 0 or return <= balance; both are application rules | `schema.prisma` |

### B3. Inferred (assumptions)

- **I-1:** An inactive user token gets 401 (from `JwtStrategy`, outside the CT file).
- **I-2:** A double click on Save yields one success and one 409 (follows from CT-9 token rules).
- **I-3:** A tray save concurrent with a Paper status change has exactly one winner (PA-11.1 serializable).
- **I-4:** Delivery session of the group is irrelevant to Client Trays; the ledger carries by group.
- **I-5:** Unexpected DB errors give a masked 500 with nothing saved.
- **I-6:** `extractErrorMessage` prints `details[]` as bullet lines (suggested by the comment in `PaperContext.tsx`; the helper was not provided).
- **I-7:** AG Grid infers a number cell type from row data, so an edited Returned cell holds a number. Not verified; the grid version was not provided.

### B4. Unknowns

See section E.

## C. Behavioral Scenario Matrix

Scenario ids use the prefix T- to avoid clashing with the Orders S- ids.

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-01 | No, garbage or expired JWT; call view, save, reconcile, recalculate | 401 | none | CT-1.1 | OK |
| T-02 | Valid EMPLOYEE or ADMIN JWT; view and save | Allowed | none | CT-1.1 | OK |
| T-03 | EMPLOYEE calls reconcile-inactive or recalculate | 403 | none | CT-1.2 | OK |
| T-04 | Deactivated user with an unexpired token | 401 | none | I-1 | OK |
| T-05 | 11th save in 60 s by one user; 6th reconcile or recalculate | 429; another user unaffected | none | CT-1.3 | OK |
| T-06 | Employee edits a sheet of any group | Allowed | - | CT-1.4 | OK (decided, CT-1.4) |
| T-07 | Sheet id `abc`, `0`, `-1`, `2147483648` | 400 `Invalid id`; `007` read as 7 | none | CT-3.2 | OK |
| T-08 | Missing sheet id on view, save, reconcile | 404 `Sheet not found` | none | CT-3.2, 5.3 | OK |
| T-09 | Successful save, reconcile, recalculate | 200 | per scenario | CT-13, CT-5.9 | OK |

### C2. Sheet view

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-10 | DRAFT sheet, GET | Ordered-based numbers; `workflow.editable` false; `sheet.client_trays_updated_at` null until first save | none | CT-2.1, 2.3, 3.1 | OK |
| T-11 | NIGHT\_SUBMITTED, no Orders morning save | Ordered-based; editable true | none | CT-2.1, 6.5 | OK |
| T-12 | NIGHT\_SUBMITTED after an Orders morning save (or after a PA-18 revert) | Delivered-based; editable true | none | CT-6.5 | OK |
| T-13 | MORNING\_SUBMITTED, FINALIZED: delivered, editable false. REOPENED: delivered, editable true | as stated | none | CT-2.1, 2.3 | OK |
| T-14 | Any sheet | Pinned `Client` column, then one group per brand ("X Tray"), then one per colour, each with Opening, Trays, Returned, Closing; fields `tray_<id>`, `_opening`, `_returned`, `_closing`; only Returned editable, and only for an active tray type | none | CT-3.3, 8.4 | OK |
| T-15 | Clients with a line in a category | One row per such client, sorted by name, every tray column filled with 0 where no line | none | CT-3.4, 8.1, 8.5 | OK |
| T-16 | Row with a legacy null return | Shows 0, never empty | none | CT-3.5, 4.6 | OK |
| T-17 | Mixed rows | Totals per grid: client count and opening, taken, returned, closing per tray type | none | CT-3.6 | OK |
| T-18 | Same client and tray type in milk and non-milk | Appears in both grids with separate numbers | none | CT-3.7, 6.1 | OK |
| T-19 | Client with an opening balance but no order lines, deactivated or moved group | Row still shown, name looked up regardless of status | none | CT-8.2 | OK |
| T-20 | Client with no balance and no delivery on this sheet | Not shown | none | CT-8.3 | OK |
| T-21 | Inactive tray type with an open balance | Column shown; Returned not editable | none | CT-8.4 | OK |
| T-22 | Previous sheet has no line for the client but an older one closed at 4 | Opening 4 (carries across the gap). A latest closing of 0 gives opening 0. A client in a new group starts at 0 | none | CT-6.3, 15.7 | OK |
| T-23 | Order lines 0.4 + 0.4 + 0.4, then 10.5, then 10.4 crates, same client and tray type | Taken 1, 11, 10 (sum then round once, half-up) | none | CT-6.4 | OK |
| T-24 | Cancelled line, or null delivered once delivered is in use | Contributes 0 | none | CT-6.5 | OK |
| T-25 | Product with no tray type and no matching rule | No trays. With several matching rules, most specific wins, then lowest id. A line with a stored tray type ignores later rule changes | none | CT-14.4, 14.5 | OK |
| T-26 | Stored return above its balance (legacy) | View still renders the row; no error | none | CT-5.13 | OK |

### C3. Save: request validation and token

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-30 | NIGHT\_SUBMITTED, token empty, valid entry, `expectedUpdatedAt: null` | Success with `clientTraysUpdatedAt` (new token) | Ledger written; token set once | CT-9.2, 5.9 | OK |
| T-31 | `expectedUpdatedAt` omitted, on save and reconcile | 400 | none | CT-9.2 | OK |
| T-32 | Token already set, send null | 409 stale message | none | CT-9.2, 9.3 | OK |
| T-33 | Token `abc` | 400 `Invalid expectedUpdatedAt` | none | CT-9.2 | OK |
| T-34 | Parseable but different token (date-only) | 409; unparseable gives 400 | none | CT-9.6 | OK (CT-9.6) |
| T-35 | `entries` is `[]` or has 5001 items | 400 | none | CT-4.3 | OK |
| T-36 | `returned` 0 and 2000 (with enough balance) | Accepted | stored | CT-4.1 | OK |
| T-37 | `returned` 2001, -1, 7.5, `"5"`, null, omitted | 400 | none | CT-4.1 | OK |
| T-38 | `clientId` or `trayTypeId` 0 or 1.5; `category` missing or `FOO` | 400 | none | CT-4.2 | OK |
| T-39 | Same (client, tray type, category) twice | 400 `Duplicate entry for client X, tray type Y, CATEGORY...`. Same client and tray type in different categories is accepted | none | CT-4.4 | OK |
| T-40 | Extra fields at top level and inside an entry | Stripped; request succeeds | none | CT-4.5 | OK |
| T-41 | Duplicate entry together with a stale token | 400 (duplicate) first | none | CT-4.7 | OK |
| T-42 | Paper DRAFT, MORNING\_SUBMITTED, FINALIZED | 400 `Tray cannot be edited in the current workflow state`, even with a stale token (status is checked before the token) | none | CT-2.2, 5.3 | OK |
| T-43 | Stale token, otherwise valid payload | 409 | none | CT-9.3 | OK |

### C4. Save: balance and ledger rules

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-50 | Return <= opening + taken | Accepted; closing = opening + taken - returned | Ledger rewritten | CT-5.5, 6.2 | OK |
| T-51 | Return larger than today's taken but within opening + taken | Accepted | same | CT-5.5 | OK |
| T-52 | Several returns above their balance in one request | 400 `One or more returns were rejected` with `details[]` listing every client and the balance; nothing saved; token rolled back | none | CT-5.5, 5.2, 9.5 | OK |
| T-53 | Entry for a client or tray type with no line in that category's grid | 400 `Tray row not found for client X` | none | CT-5.6 | OK (first error only, wording not binding) |
| T-54 | Client in grid, tray column exists, client has no line for it | `returned` 0 accepted; 1 rejected by the balance rule | none | CT-5.6 | OK |
| T-55 | Inactive tray type, normal save | Echoing the stored value accepted; any other value 400 `... is inactive and read-only` | none | CT-5.7 | OK |
| T-56 | Reconcile route: active tray type entry 400; inactive tray type change accepted; non-admin 403 | as stated | ledger rewritten | CT-5.11 | OK |
| T-57 | Reconcile on REOPENED | Same rules, plus conflict dry run and cascade | outbox row | CT-5.11, 5.10 | OK |
| T-58 | Ledger lines not in the request | Keep their stored return (0 if none) | unchanged | CT-4.6 | OK |
| T-59 | Save recalculates the ledger | Obsolete stored rows of this sheet deleted, even when the new ledger is empty; no other sheet touched | rows deleted | CT-5.8, 7.3 | OK |
| T-60 | A stranded legacy return exists anywhere on the sheet | Any save 409 `This change would leave returned trays higher...` with `details[]` (date, client, tray); nothing capped. Setting the stranded return within its balance (0 for a no-balance row) repairs an active type; inactive types via reconcile | none until repaired | CT-5.13 | OK (approved, CT-5.13) |
| T-61 | Save succeeds | Response token replaces the local one; a second save with it succeeds with no reload; the old token 409s | token advanced | CT-9.4 | OK |
| T-62 | One bad entry among 50 | Whole request fails | rollback | CT-5.2 | OK |
| T-63 | Admin-route entry over 2000 for a row | 400 with `... exceeds the limit of 2000 per row` | none | CT-5.12 | Seam (D-6, wording not binding) |

### C5. Recalculation and propagation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-70 | Orders save that processes entries (any status) | Sheet ledger recalculated in the same transaction: opening from earlier sheets, taken from lines, returns preserved as stored | ledger rewritten | CT-10.1, OD-6.13 | OK |
| T-71 | Orders save that would leave a stored return above its balance on this sheet | 409 with `details[]` (date, client, tray, returned, outstanding); whole Orders save rolled back, token unchanged | none | CT-6.6, OD-6.13 | OK |
| T-72 | REOPENED Orders correction that would strand a return on a later sheet of the group | 409; nothing saved; no outbox row | none | CT-6.6, 10.2 | OK |
| T-73 | REOPENED Orders correction, no conflict | Sheet recalculated; one `CLIENT_TRAYS_CASCADE_FROM_SHEET` row PENDING with `resume_from_id` = sheet | outbox | CT-10.2 | OK |
| T-74 | Return save on NIGHT\_SUBMITTED | No dry run, no outbox | none | CT-5.10 | OK |
| T-75 | Return save on REOPENED | Dry run over later sheets; on conflict 409 and nothing saved; else saved and cascade queued | outbox | CT-5.10 | OK |
| T-76 | Cascade runs | Later sheets (including FINALIZED, without reopening) get new opening and closing only; their taken and returned unchanged | rows updated | CT-10.3, 11.5 | OK |
| T-77 | Cascade reaches a client with a carried non-zero balance and no line | Carry-forward line created with return 0, also across gaps | row created | CT-10.4, 6.3 | OK |
| T-78 | Cascade or recalculation meets a return above balance | Job FAILED immediately (no retries), details in `last_error`; nothing capped. After returns are fixed, admin retry succeeds | outbox FAILED | CT-6.6, 10.6, PA-10.4 | OK |
| T-79 | Paper finalize | Forward propagation queued; every sheet of the paper recalculated, then each group's later sheets cascaded | outbox | CT-10.5, PA-8.7 | OK |
| T-80 | Long chain (more than 20 steps) | Job runs in chunks of 20 and resumes without skipping a group; rerun is idempotent | partial commits between chunks | CT-10.6 | OK |
| T-81 | Row stuck PROCESSING 2 minutes; two identical PENDING requests | Re-queued; duplicates merged | outbox | CT-10.6 | OK |
| T-82 | Change made, job not finished | Later sheets can show previous balances | transient | CT-10.7 | D-13 |
| T-83 | Morning submit, night submit, re-finalize | No Client Trays gate; no return-completeness check | none | CT-12.1, 12.2, PA-6.3 | OK |

### C6. Administrative range recalculation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-90 | ADMIN, valid range with papers | `{ papersQueued, fromDate, toDate, operations[{ paperId, operationId }] }`; returns immediately | one outbox row per paper | CT-11.1 | OK |
| T-91 | Shape not `YYYY-MM-DD`, impossible date (`2026-02-31`), `fromDate` after `toDate` | 400 | none | CT-11.2 | OK |
| T-92 | 31 days inclusive, then 32 days | 31 accepted; 32 gives 400 `The date range cannot exceed 31 days` | none | CT-11.2 | OK |
| T-93 | Range with no papers | 200, `papersQueued` 0, empty `operations` | none | CT-11.2 | OK |
| T-94 | Range includes FINALIZED papers | Queued without reopening; later sheets outside the range also refreshed | outbox | CT-11.3, 11.4 | OK |
| T-95 | Same paper requested twice while the first row is PENDING | Same `operationId` returned (merged) | no new row | O \[merge in enqueue\] | U (spec silent) |
| T-96 | Open sheet in UI during range recalculation | Sheet is not reloaded; token unchanged | none | hook comment | OK |

### C7. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-100 | Two users save with the same token concurrently | Exactly one succeeds; the other 409 (stale, or conflicted-with-another-update after 3 attempts) | one write | CT-5.2, 9 | OK |
| T-101 | Double click, same payload and token | First succeeds, second 409 | one write | I-2 | OK |
| T-102 | Re-save identical values with the fresh token | No-op: nothing written, current token returned, no dry run or cascade on REOPENED | none | CT-5.14 | OK (CT-5.14) |
| T-103 | Save succeeded but the response was lost; retry with the old token | 409 although data was saved | - | - | OK (CT-9.6, accepted) |
| T-104 | Serialization conflicts exhaust 3 attempts | 409 `Your request conflicted with another update...` | rollback | CT-5.2 | OK |
| T-105 | Transaction exceeds 10 s | 409 `The request took too long and nothing was saved. Please retry.` | rollback | CT-5.2 | OK (accepted, CT-5.2) |
| T-106 | Unexpected exception after the token was touched | Masked 500 with `requestId`; token and ledger rolled back | rollback | I-5, CT-9.5 | Seam |
| T-107 | User A loads; Orders (user B) lowers taken; A saves a return that is now too high with the old token | Token still matches (Orders does not advance it); server revalidates on live numbers and answers 400 over-return | none | CT-5.4, CT-9.1 | OK (accepted, CT-9.1) |
| T-108 | Tray save races Paper morning submit or finalize | One wins; a losing save gets 400 (status) | serializable | I-3 | OK |
| T-109 | REOPENED return save while a cascade rewrites the same later sheet | Serializable conflict, retried; or 409 | rollback | CT-10.6 | U |

### C8. Frontend behavior

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-120 | Workflow editable | Only Returned cells of active tray types are editable; pinned total row never editable; non-editable status shows the explanatory message and disables Save | none | CT-3.3, 8.4, 2.3 | OK |
| T-121 | Save pressed | Entries for every active Returned cell of both grids (edited or not) with `sheet.client_trays_updated_at` as the token | request | O-12 | OK |
| T-122 | Save succeeds | Token taken from the response, edits cleared, sheet reloaded, success toast | cache updated | CT-9.4 | OK |
| T-123 | Save returns a 409 meaning the sheet changed (stale token, race, retries exhausted) | Edits cleared, sheet reloaded, error toast | none | CT-9.7 | OK (CT-9.7) |
| T-124 | Save returns 400 over-return | Edits kept; toast with message and details (I-6) | none | CT-5.5 | OK |
| T-125 | Grid has no collectable cells (no tray lines, or reconcile mode with no inactive types) and Save is pressed | Toast Nothing to save; nothing is sent | none | CT-4.8 | OK (CT-4.8) |
| T-126 | ADMIN toggles reconcile mode | Edits dropped, sheet reloaded, only inactive Returned cells editable and sent, route `reconcile-inactive`; button hidden for non-admins | request | CT-5.11 | OK |
| T-127 | User types `7.5`, `-3`, `abc` or clears a cell | Blank is sent as 0; anything else that is not a whole number from 0 to 2000 stops the save with a toast naming the clients | none | CT-4.8 | OK (CT-4.8) |
| T-128 | Window regains focus or the network reconnects with unsaved edits | Sheet is not refetched; token unchanged | none | hook comment | OK (CT-9.7) |
| T-129 | Same sheet remounted or a second observer of the query key mounts with unsaved edits | `staleTime` 0 refetch on mount could swap the token. Page is remounted per sheet and clears edits, so a second observer is the only risk | possible | O-15 | Accepted (CT-9.7) |
| T-130 | Admin submits a range | Success toast with count; admin panel lists `paper #, operation #` | none | CT-11.1 | OK |

## D. Discrepancies and Gaps

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Spec silent, code differs from sibling module | Save, reconcile and recalculate return 201 (no `@HttpCode`). Orders had the same issue and was fixed to 200 (Orders DISC-1). The CT file states no status for success. | Low |
| D-2 | Spec gap, UI differs from Orders | The UI clears unsaved edits on every 409, including "took too long, nothing was saved" and a return-discrepancy 409 ("correct the returns first"). Orders OD-12.10 keeps edits on the timeout 409. For a discrepancy 409 the user loses edits to unrelated rows. | Low to Medium |
| D-3 | Spec gap | A save that changes nothing still advances the token, rewrites rows and, on REOPENED, enqueues a cascade plus runs the forward dry run. Orders OD-12.8 deliberately does the opposite. The UI makes this likely because it sends every cell on each save (O-12). | Medium |
| D-4 | Spec gap | CT-9.1 does not say which writes advance `client_trays_updated_at`. Orders recalculation and cascades change the sheet's ledger without moving the token, so an open screen is never detected as stale. Safety is preserved only because the server revalidates against live numbers (CT-5.4). | Low to Medium |
| D-5 | Governance | CT-5.13 is implemented but marked "PENDING OWNER APPROVAL" and is a behavior change. A save is refused on any sheet that holds a stranded legacy return, even when the user is editing an unrelated row. | **Medium** |
| D-6 | Doc differs from code | CT-5.12 says an over-limit return gives 400 with the `exceeds the limit of 2000 per row` message. Through the API the DTO `@Max(2000)` fires first, so the user sees the validator text; the service check is only reachable by a direct call. Same pattern as Orders D-1. | Low |
| D-7 | Doc differs from code | CT-5.5 says all problems in one request are reported together. `Tray row not found for client X` throws at the first bad entry and hides balance problems on later entries. It also names neither the tray type nor the category. | Low |
| D-8 | Spec gap | Inactive tray types keep accruing new taken (via a rule that still points at them, or a frozen line). Employees cannot return them; only an admin can reconcile. CT-8.4 and CT-14.4 do not say whether new takes on inactive types are intended. | Medium |
| D-9 | Spec gap | CT-14.4 says a line's tray type is frozen at creation. A line created with no matching rule stores null and is then resolved from live rules on every recalculation, so a later rule change silently starts producing trays for an old line. The doc describes fallback only "for a line with no stored tray type" and does not distinguish legacy from "no rule at creation". | Low to Medium |
| D-10 | Non-functional risk | `getOpeningBalances` reads every earlier ledger row of the group and de-duplicates with `distinct`. It runs on every view, save, Orders recalculation, cascade step and dry-run step, so cascade cost grows quadratically with history, inside a 10 s (or queue chunk) serializable transaction. Whether `distinct` is native or in-memory depends on the Prisma version (not provided); the schema has no index covering this lookup by group and date. | **Medium (unverified)** |
| D-11 | UI gap | The UI sends blank as 0, performs no integer or sign validation, and does nothing when there are no collectable entries (no message, Save looks broken). Clearing a cell silently sets a stored return to 0. | Low |
| D-12 | Dead code | `validateTrayCalculationExists` (CT-12.1 documents it as kept), `calculateTraysTaken` (documented as kept), `getClientsByGroupAndCategory`, and a commented-out `getTrayTypes`. Not removed here. | Info |
| D-13 | Doc inconsistency | CT-3.5 says opening is calculated live from the previous sheet; CT-10.7 says later sheets can show the previous opening until a job completes. Both hold depending on depth: the next sheet is correct at once, sheets two or more steps ahead lag until the cascade finishes. | Low |
| D-14 | Observability | CT-11.5 relies on the outbox row as the only record of a cascade or range recalculation. Per-entry changes to finalized-history balances are not audited (CT-14.1). Accepted, but not testable beyond outbox rows. | Info |
| D-15 | Spec gap | A transaction timeout returns 409 in code (O-8); the CT file lists only serialization conflicts. The 10 s default is used here, not the longer Paper limit. | Low |

**Scenarios the current implementation appears unable to satisfy or that cannot be asserted**

- **T-63:** the specified limit message is not reachable through the API (D-6).
- **T-103:** a lost response cannot be retried safely (same decision as Orders OD-12.9, not yet recorded for Client Trays).
- **T-107:** staleness caused by Orders or cascade writes cannot be detected through the token (D-4).
- **T-125, T-127:** the UI gives no feedback (D-11).
- **T-106:** reachable only with fault injection.
- **T-80, T-109:** need a paper chain longer than one chunk and real concurrency; only observable with a queue worker and a real database.
- **CT-5.13 (T-60):** cannot be treated as final until approved (D-5).

## E. Open Questions (decisions needed)

Each question lists the owner. "(current)" marks what the code does today. No answer is recommended.

**Q1 (Product, D-3). Save that changes nothing.**

- A. Treat it as a change: advance the token, rewrite rows, queue a cascade on REOPENED (current).
- B. Compare with stored values; if nothing changed, return the current token and do no write, no dry run, no outbox row.
- C. Advance the token as now, but skip the dry run and outbox row when nothing changed.
- D. Other.

**Q2 (Product + Eng, D-4). What advances the Client Trays token?**

- A. Only tray saves (current).
- B. Also any Orders recalculation or cascade that rewrites this sheet's ledger.
- C. Only Orders recalculation of this same sheet, not cascades.
- D. Other.

**Q3 (Product, D-8). New taken on an inactive tray type.**

- A. Allowed to accrue; admin reconciles later (current).
- B. Tray rules and lines pointing at an inactive type produce no new taken.
- C. Allowed, but the Orders save warns or flags it.
- D. Other.

**Q4 (Product + Eng, D-9). Line with no tray type at creation.**

- A. Resolve from live rules on every recalculation (current).
- B. Freeze it as "no tray" at creation; only genuinely legacy lines use rules.
- C. Same as A, but a rule change applies only to lines created after it.
- D. Other.

**Q5 (Eng, D-1). Success status of save, reconcile and recalculate.**

- A. 201 (current).
- B. 200, as Orders.
- C. Any 2xx; not binding.

**Q6 (Eng + Product, D-2). Frontend reload on 409.**

- A. Clear edits and reload on every 409 (current).
- B. Keep edits on the timeout 409, clear on the others (as Orders OD-12.10).
- C. Keep edits on a return-discrepancy 409 as well, and reload only the data.
- D. Other.

**Q7 (Product, SEC-8). Who may edit which sheet?**

- A. Any employee, any group's sheet (current, as Orders OD-1.3).
- B. Only employees assigned to that group.
- C. Reads open, writes scoped.
- D. Other.

**Q8 (Eng, D-15). Transaction timeout.**

- A. 409 retryable (current, as Orders OD-6.2).
- B. 503.
- C. Use the longer Paper limit for tray saves.
- D. Other.

**Q9 (Eng + Product, T-34, T-103). Token strictness and lost-response retry.**

- A. Any parseable ISO-8601 token accepted, mismatch 409; a retry after a lost response gets 409 (current, as Orders OD-12.9, OD-12.10).
- B. Full timestamp only.
- C. Support an idempotency key or treat an identical payload as already applied.
- D. Other.

**Q10 (Product, D-5). CT-5.13 stranded-return rule.**

- A. Approve as written: any stranded return blocks every save on the sheet.
- B. Approve, but block only saves that touch the stranded row or its tray type.
- C. Reject: return to the previous behavior (500 or negative closing).
- D. Other.

**Q11 (Product). Client moved to another group with an open balance.**

- A. Balance stays in the old group; the new group starts at 0 (current, CT-6.3, 8.2).
- B. Balance transfers to the new group on the move.
- C. Block the move while a balance is open.
- D. Other.

**Q12 (Eng, D-10). Opening-balance lookup at scale.**

- A. Keep as is; measure on the largest real history first.
- B. Limit the look-back to a fixed number of days.
- C. Keep a denormalized current-balance table per (group, client, tray type, category).
- D. Add an index and a native `distinct` query only.

**Q13 (Eng, D-6, D-7). Wording of rejections.**

- A. Only the 400 status is binding for validation errors (as Orders OD-5.3).
- B. The CT-5.12 and CT-5.6 messages are binding, and `Tray row not found` lists every bad entry with tray type and category.
- C. Remove the unreachable service-level limit check.

**Q14 (Product, D-11). UI validation and empty save.**

- A. No client-side checks; silent no-op when nothing to send (current).
- B. Validate whole number, 0 to 2000, before sending; show a message when nothing can be saved.
- C. B, plus show the available balance beside each Returned cell.
- D. Other.

**Q15 (Eng, T-128, T-129). Sheet-query refetch policy** (needs `QueryClient` and observer review).

- A. Add Client Trays to the written spec: no refetch on focus or reconnect, reload only after a save, 409 or mode switch (current hook).
- B. Disable all automatic refetch for the sheet query, including mount.
- C. Allow refetch, but adopt the new token only when there are no unsaved edits.
- D. Other.

**Q16 (Eng, D-12). Dead code.**

- A. Leave `validateTrayCalculationExists`, `calculateTraysTaken` and the others until every caller is ruled out (current).
- B. Remove them in a separate cleanup.

## F. Revision After Decisions (Q1 to Q16)

All sixteen questions are answered and recorded in `CLIENT_TRAYS_BUSINESS_DECISION.md`. Code changes are implemented but not yet compiled or run.

### F1. Decision log

| Q | Decision | Effect | Spec reference |
| --- | --- | --- | --- |
| Q1 | Delegated: a save that changes nothing is a no-op (no write, no token advance, no cascade) | Code changed | CT-5.14 |
| Q2 | Delegated: only tray saves advance the token; saves are revalidated on live numbers | Documented | CT-9.1 |
| Q3 | Delegated: inactive tray types keep accruing taken; returned through reconciliation | Documented | CT-8.6 |
| Q4 | Delegated: a null tray type is resolved from live rules (accepted) | Documented | CT-14.4 |
| Q5 | 200 as Orders | Code changed | CT-13, CT-5.9 |
| Q6 | As Orders; edits also kept on a return-discrepancy 409 | Code changed (UI) | CT-9.7 |
| Q7 | Any employee, any group | Documented | CT-1.4 |
| Q8 | As Orders: timeout stays 409 | Documented | CT-5.2 |
| Q9 | Any parseable ISO-8601 token; a lost-response retry gets 409 | Documented | CT-9.6 |
| Q10 | Delegated: approved as written | Documented | CT-5.13 |
| Q11 | Balance moves to the new group with the client | Decided, NOT implemented | CT-6.7, CT-15.8 |
| Q12 | Delegated: keep the query, add an index on order\_sheet.group\_id, measure before go-live | Code changed (index) | CT-10.9, CT-15.9 |
| Q13 | As Orders: only the 400 status is binding | Documented | CT-5.12 |
| Q14 | Delegated: validate before sending, report an empty save | Code changed (UI) | CT-4.8 |
| Q15 | Delegated: no refetch on focus or reconnect, refetch on mount | Documented | CT-9.7 |
| Q16 | Leave dead code | No change | CT-12.1 |

### F2. Discrepancy status

| ID | Status | Note |
| --- | --- | --- |
| D-1 | Resolved | Save, reconcile and recalculate return 200 |
| D-2 | Resolved | Reload on stale, race and exhausted retries; edits kept on timeout and on a discrepancy 409 |
| D-3 | Resolved | A save that changes nothing is a no-op (CT-5.14) |
| D-4 | Accepted | Token advances only on tray saves; documented, server revalidates |
| D-5 | Resolved | CT-5.13 approved. A stranded return on an inactive tray type still blocks normal saves until an admin reconciles it |
| D-6 | Accepted | Only the 400 status is binding |
| D-7 | Accepted | Only the 400 status is binding; first offending entry reported |
| D-8 | Accepted | Documented as CT-8.6 |
| D-9 | Accepted | Documented in CT-14.4 |
| D-10 | Partly mitigated | Index added; cost still unmeasured, and the Prisma version is still unknown |
| D-11 | Resolved | UI validates, blank is 0, an empty save is reported |
| D-12 | Unchanged | Dead code left in place |
| D-13 | Unchanged | Wording difference between CT-3.5 and CT-10.7 |
| D-14 | Accepted | Outbox row remains the only operation record |
| D-15 | Accepted | Timeout stays 409 |
| D-16 | New, open | The decided rule CT-6.7 is not implemented: the code still leaves the balance in the old group and starts the new group at 0 |
| D-17 | New, low | The UI tells the 409 kinds apart by the response body (a details list, or the text took too long and nothing was saved), which breaks if that wording changes |

### F3. New and changed scenarios

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| T-140 | Save whose resulting ledger equals the stored one, matching token | 200 with the current token | No write, row updated\_at unchanged, token unchanged | CT-5.14 | Implemented, not yet run |
| T-141 | Same, on a sheet never saved (token null) | 200, clientTraysUpdatedAt null | Token stays null | CT-5.14 | Implemented, not yet run |
| T-142 | Same payload with a stale token | 409 (token compared first) | none | CT-5.14, 9.3 | Implemented, not yet run |
| T-143 | One return changed | Token advances once, ledger written | Token and rows | CT-5.14 | Implemented, not yet run |
| T-144 | Stored return is null (legacy), save sends 0 | Counts as a change: stored becomes 0, token advances | Row rewritten | CT-4.6, 5.14 | Implemented, not yet run |
| T-145 | Stored opening or closing differs from the live values, save echoes the returns | Counts as a change: derived values refreshed, token advances | Rows rewritten | CT-5.8, 5.14 | Implemented, not yet run |
| T-146 | REOPENED paper, no-op save | No forward dry run, no outbox row | none | CT-5.10, 5.14 | Implemented, not yet run |
| T-147 | Successful save, reconcile and recalculate | HTTP 200 | per scenario | CT-13 | Implemented, not yet run |
| T-148 | UI: save gets a 409 for a stale token, a race or exhausted retries | Edits cleared, sheet reloaded | none | CT-9.7 | Implemented, not yet run |
| T-149 | UI: save gets the timeout 409 | Edits kept, no reload, error toast | none | CT-9.7 | Implemented, not yet run |
| T-150 | UI: save gets a discrepancy 409 (details list) | Edits kept, no reload, toast with the details | none | CT-9.7 | Implemented, not yet run |
| T-151 | UI: values 7.5, -1, 2001 or abc in a Returned cell | Toast naming the clients; no request sent | none | CT-4.8 | Implemented, not yet run |
| T-152 | UI: blank Returned cell | Sent as 0 | request | CT-4.6, 4.8 | Implemented, not yet run |
| T-153 | Stranded return on an inactive tray type, normal save | 409 with details; admin reconcile with a value within the balance repairs it | none until repaired | CT-5.13, 5.11 | OK |
| T-154 | New order line whose tray type is inactive | Taken accrues on the inactive tray type; its Returned cell stays read-only | ledger row | CT-8.6 | OK |
| T-155 | Line stored with no tray type, a matching rule added later, sheet recalculated | Trays now appear for that line (accepted) | ledger row | CT-14.4 | OK |
| T-156 | After the group\_id index migration | Opening balances, views and cascades give identical results | none | CT-10.9 | Implemented, not yet run |
| T-157 | Client moved to another group with an open balance | Balance moves to the new group, none left in the old group | transfer | CT-6.7 | NOT implemented (D-16), expected to fail |

### F4. Still open

- **CT-15.8:** the balance transfer on a group move needs a design for recording it and a hook in the client master-data update flow. T-157 fails until then.
- **CT-15.9:** measure the opening-balance lookup, a 31-day range recalculation and a forward propagation on the largest real history.
- **Not run:** none of the code changes have been compiled or tested.
- **Residual:** another component mounting the same sheet query during edits (CT-9.7), and the AG Grid cell type for edited values (I-7). The UI validation accepts either a number or a numeric string.
- **Frontend paths** were inferred from the Orders feature folder and may need moving.

**Stopping here, as requested: no automated tests were written.**
