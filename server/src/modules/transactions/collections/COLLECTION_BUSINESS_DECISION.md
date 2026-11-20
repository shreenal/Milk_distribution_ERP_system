# Collections Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/collections/` only (controller, service, repository, builder, DTOs, `services/*`, constants) plus `types/collection.types.ts`.
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 14 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`CD-n`) are stable. Cite them in code comments, PRs and reviews. Section 15 maps them to the numbered decisions they came from. Sections 7 and 8 are new in this version; they close the former numbering gap, and no existing ID was renumbered (CD-14.6).

**Reference pattern:** where this file says "as in Orders", the behavior copies `ORDERS_BUSINESS_DECISION.md` (OD-n). Where it says "as in Client Trays", it copies `CLIENT_TRAYS_BUSINESS_DECISION.md` (CT-n). Section 13 records which module's save pattern Collections follows and why.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Collection row | One `client_collection` record: money received from one client, on one sheet, for one category. Unique on (sheet, client, category). |
| Category | `MILK` or `NON_MILK`. Taken from the URL, never from the body. A client buying both has two rows per sheet. |
| Phase | Night (employee), Morning (employee), Admin (admin). Each phase owns its own columns and never writes another phase's columns. |
| Office cash collection | Cash collected at the office desk during the night phase. Formerly "office amount given" (CD-1.2). |
| Concurrency token | `order_sheet.collections_updated_at`, exposed as `collectionsUpdatedAt` / sent as `expectedUpdatedAt`. One token per sheet, shared by all phases and both categories. |
| Submitted row | One entry in a save request's `entries`. |
| Blank | `null`, `""` or an omitted amount field. |
| Historical client | A client who already has a collection row on this sheet + category, even if since deactivated, moved or de-authorized. |

---

## 1. Data Model

**CD-1.1** A collection row holds five amounts, split by phase:

| Phase | Who | Columns |
|---|---|---|
| Night | Employee | `office_cash_collection` |
| Morning | Employee | `cash_collection`, `cheque_collection` |
| Admin | Admin | `online_collection` (UPI), `bank_deposit` |

All are `Decimal(12,2)`, default 0.

**CD-1.2 Rename (binding).** `officeAmountGiven` / `office_amount_given` is now `officeCashCollection` / `office_cash_collection`. It means night cash collected at the office desk. It is part of the employee total.

**CD-1.3 No remarks (binding).** `employeeRemarks`, `adminRemarks` and their columns are removed from the schema, DTOs, grids and responses. Existing remark text is deleted by the migration.

**CD-1.4** Collections only records money. It never reads order quantities or bills and never checks that collected amounts are less than or equal to a bill. Any amount within CD-5 is accepted.

**CD-1.5** There is no delete. A row can only be overwritten (for example with zeros). No audit or history table exists or is required for now.

---

## 2. Workflow: what can be saved at each paper status

**CD-2.0 Status matrix (binding; answered by the workflow service):**

| Paper status | Night save | Morning save | Admin save |
|---|---|---|---|
| DRAFT | Yes | No | No |
| NIGHT_SUBMITTED | Yes | Yes | No |
| MORNING_SUBMITTED | No | No | Yes |
| FINALIZED | No | No | No |
| REOPENED | Yes | Yes | Yes |

Reopening re-opens all three phases. Admins may use employee endpoints through the role hierarchy. Employees cannot call admin endpoints (403).

**CD-2.1 Blank = 0 inside a submitted row (binding).** In a submitted row, a blank amount is stored as 0. Employees only fill in clients who actually paid. The frontend never has to type `0`. The frontend always sends the complete phase row for each client it edits (CD-8.3), so a blank cell is a cleared cell, never an omitted field. *(Q3.)*

**CD-2.2 A row for a client with no stored row creates nothing if every amount in it is 0.** Only a positive amount creates a row. This keeps empty rows out of the table, and a client only becomes "historical" once real money exists. Such a row is ignored entirely: no client rule (CD-6.2) is applied to it, so an inactive, moved, de-authorized or unknown client id in an all-zero row is not an error (as Orders OD-6.5d). *(Q2.)*

**CD-2.3 Status error messages (all 400):**
- Night: `Night collections cannot be edited in the current workflow state`
- Morning: `Cannot edit morning collections when paper is <STATUS>. Allowed statuses: NIGHT_SUBMITTED, REOPENED`
- Admin: `Admin collections cannot be edited in current workflow state`

---

## 3. Grid View (`GET /collections/sheet/:sheetId`)

**CD-3.1 Lean payload (binding).** The response is:
`{ sheet: { id, orderPaperId, groupId, groupName }, workflow, collectionsUpdatedAt, milkCollectionGrid, nonMilkCollectionGrid }`.
The raw order-sheet row is never returned. `collectionsUpdatedAt` is the concurrency token (ISO string, or `null` if never saved).

**CD-3.2 Sheet not found is 404.**

**CD-3.3 Which clients appear.** A client appears if it is active, in this sheet's group and authorized for the category, OR is a historical client (CD-6.2). A recorded collection must never vanish from the screen because of later master-data edits.

**CD-3.4 Row content.** A client with no stored row shows all amounts 0 and `collectionId: null`. Null means "never saved".

**CD-3.5 Calculations** (exact decimals, 2-decimal half-up, computed on read, never stored):
- Employee total = office cash + cash + cheque
- Admin total = online + bank deposit
- Grand total = employee total + admin total
- Grid totals are column sums plus `totalClients`.

**CD-3.6 Sorting.** Clients sort by client code, then by name. A client with no code sorts after all clients that have one, ordered by name among themselves. The comparison is natural (numbers inside a code or name compare by value, so `C9` sorts before `C10`) and case-insensitive, in a fixed locale (`en`) so the order does not depend on the server. *(Q11.)*

**CD-3.7 Columns.** Client Code, Client Name, Night (Office Cash Collection), Morning (Cash, Cheque), Total (Employee), Admin (Online (UPI), Bank Deposit), Total (Admin), Grand Total.

**CD-3.8 Admin columns are projected by role (binding, see CD-14.3).** For non-admin callers the backend omits Online Collection, Bank Deposit, Total (Admin) and Grand Total, from columns, rows and totals, on GET and on save responses. Admin callers receive everything.

---

## 4. Save Responses

**CD-4.1** Every successful save returns `{ success, changed, message, collectionsUpdatedAt, totals }`. `changed` is `true` when data was written and the token advanced and `false` for a no-op (CD-9.4), as in Cash Settlement (CS-11.1). *(Q14.)*

**CD-4.2** `collectionsUpdatedAt` is the new token if data changed, or the unchanged current token for a no-op (CD-9.4). `totals` are the recalculated totals of the saved category's grid, rebuilt from stored data after the write, projected per CD-3.8. The frontend replaces its token and totals without a GET. Row-level totals are not returned.

---

## 5. Input Validation (all amounts)

**CD-5.1 Blank amounts** are accepted and treated as 0 (CD-2.1).

**CD-5.2 Range.** An amount is a JSON number from 0 to 10,000,000 (see CD-14.1). Negatives, strings (`"500"`), NaN and Infinity are rejected.

**CD-5.3 Precision.** At most 2 decimal places. `1250`, `1250.5`, `1250.50` are valid. `1250.555` is **rejected** with a 400. It is never silently rounded. Over-limit values are rejected with a 400 and never reach the database.

**CD-5.4 Request shape.** `entries` has 0 to 1000 items. `clientId` is an integer 1 to 2147483647. Unknown fields are rejected (400). Remarks fields are unknown fields.

**CD-5.5 Duplicates.** The same `clientId` twice in one request is rejected: `Duplicate client entries found: <ids>. Each client can only appear once per save.` Each duplicated id is listed once in `<ids>`, however many times it was sent (defect D-16, fixed in the shared `duplicateKeys` helper).

**CD-5.6 Validation order.** Shape, range, precision and duplicate checks run before the database transaction starts.

---

## 6. Save Mechanics (all six save endpoints)

**CD-6.1 Partial saves (as in Orders).** Only submitted rows are processed. Clients not in the request are never touched, and nothing is deleted by omission. Stored rows are compared with the submitted rows by client, and only rows that would change something are written. The write is one bulk `INSERT ... ON CONFLICT (sheet, client, category) DO UPDATE` (the same upsert Orders and Client Trays use), restricted to the columns of the current phase. It never deletes.

**CD-6.2 Historical clients (as in Orders OD-6.5).**
- A submitted client who already has a row on this sheet + category may be updated even if since deactivated, moved or de-authorized. Live checks are not applied.
- A submitted client with no row AND at least one positive amount must be active, in this sheet's group and authorized for the category. Otherwise 400 `Client <id> does not belong to <CATEGORY> category.` An all-zero row for a client with no row is ignored and never checked (CD-2.2). *(Q2.)*
- One failing row fails the whole request and nothing is saved.

**CD-6.3 Atomic.** Each save is one serializable transaction with up to 3 total attempts on a serialization conflict, then 409 `Your request conflicted with another update and could not be completed. Please retry.` A transaction that exceeds its time limit (10 s) saves nothing and returns 409 `The request took too long and nothing was saved. Please retry.` This is accepted as is. *(Q8.)*

**CD-6.4 Check order inside the transaction:** sheet exists (404) -> status allows the phase (400) -> token matches (409) -> client rules for new rows that carry a positive amount (400) -> diff -> token advance (only if changes; also Cash Settlement's token when a cash amount changed, CD-7.2) -> write -> rebuild totals.

**CD-6.5 Phases never cross-write.** Night writes `office_cash_collection` only. Morning writes `cash_collection` and `cheque_collection` only. Admin writes `online_collection` and `bank_deposit` only. A morning row therefore sets both cash and cheque, with blank = 0 (CD-2.1).

**CD-6.6 Category is fixed by the URL.** The milk endpoints only touch MILK rows and the non-milk endpoints only touch NON_MILK rows.

---

## 7. Link to Cash Settlement (new)

**CD-7.1 Route cash is `cash_collection` only (binding, as implemented; Q5).** Cash Settlement reads only `client_collection.cash_collection`, summed per route over MILK and NON_MILK (CS-3.1). The night office cash collection, cheque, online and bank-deposit amounts are not part of route cash, office cash, deposits or any reconciliation figure. Confirmed by the business owner; changing it is a Cash Settlement decision.

**CD-7.2 A changed cash amount makes an open Cash Settlement screen stale (binding, new; Q4).** A save that creates a row with a positive `cash_collection`, or changes a stored `cash_collection`, also advances `order_paper.updated_at` (Cash Settlement's concurrency token, CS-10.2) inside the same transaction. An open Cash Settlement screen then gets 409 on its next save and reloads. Saves that change only office cash, cheque, online or bank deposit, no-op saves and failed saves do not advance it. The advance uses the same clock-safe helper as every other token, so the value always moves forward.
Known side effect: Distributor Transfer uses the same token (PA-8.11), so its open screen also goes stale. This is accepted.

**CD-7.3 Amendments in other decision files.** PA-8.11 is amended (applied in `PAPER_BUSINESS_DECISION.md`): Collections is added to the actions that advance `order_paper.updated_at`. CS-10.3 now carries the matching amendment (applied in `CASH_SETTLEMENT_BUSINESS_DECISION.md`, DQ8).

---

## 8. Frontend Contract (new)

These are client-side requirements; the backend cannot enforce them. Verified against `CollectionsPage.tsx`, `useSaveCollections.ts`, `useCollections.ts`, `CollectionsGrid.tsx`, `collections.api.ts` and `QueryProvider.tsx` (Q15).

**CD-8.1 Token.** The screen keeps `collectionsUpdatedAt` from its last load and sends it as `expectedUpdatedAt` on every save, never omitted. After a save the screen is reloaded from the server (CD-4.2 also allows using the response); an older token is never reused.

**CD-8.2 One token, two categories.** Milk and non-milk saves of one phase run one after the other, each with the token returned by the previous save. A category with nothing to save is skipped. The two requests are not atomic together: if the second fails, the first stays saved, and the screen is reloaded.

**CD-8.3 Full phase rows (binding).** Only rows the user edited are sent (CD-6.1). For each, every field of the phase is sent, a blank cell as 0 (CD-2.1, CD-14.4). Non-numeric input is rejected before sending. Edits are keyed by category and client, because one client can have a row in both categories.

**CD-8.4 Controls.** Save buttons are enabled from `workflow.permissions`. The Save Admin button is shown only to ADMIN (CD-12.1).

**CD-8.5 No refetch under unsaved edits (binding, new).** The sheet query is not refetched on window focus or on reconnect, so the token and the rows cannot change under unsaved edits (same rule as Orders OD-12.10). The `QueryClient` defaults (provided) set only `retry`; they leave `staleTime` 0 and focus/reconnect refetch on, which is why the query must switch them off itself.

**CD-8.6 After a save (current behavior).** After every save, success or failure, the grid is reloaded and all unsaved edits are cleared. A server error is shown as a toast with the server's message (400 business message, 409 refresh message). See CD-14.10.

---

## 9. Concurrency Token

**CD-9.1 Required (binding).** `expectedUpdatedAt` is required on all six save endpoints. Omitted gives 400. Explicit `null` is allowed only for the first save on a sheet whose token has never been set. If a token exists, `null` gives 409. A value must be ISO-8601 (else 400) and equal the current token (else 409).

**CD-9.2 One token per sheet.** It is shared by night, morning and admin saves and by both categories. A change in any of them makes every other open screen stale on its next save.

**CD-9.3 Compared first.** The token is compared right after the status check, before entry validation. A stale token is 409 even if the request would change nothing.

**CD-9.4 No-op saves never advance the token (binding).** A save changes data only if at least one submitted row creates a row (positive amount) or differs from a stored row. `entries: []`, rows whose values equal the stored values, and all-zero rows for clients with no stored row are no-ops. A no-op returns success with the current token, does not touch the token, and writes nothing.

**CD-9.5 Advance and rollback.** A save that changes data advances the token once per request, atomically (compare-and-advance), inside the same transaction. If anything fails, the token rolls back with the data.

**CD-9.6 Lost response (binding, as implemented; Q9).** If a save succeeded but its response never reached the client, a retry with the old token returns 409. There is no idempotency key and an identical payload is not recognised as already applied. The user reloads and re-checks.

**CD-9.7 Token format (binding; Q10).** A token value must be ISO-8601. Any parseable ISO-8601 string is accepted (a full timestamp is what the API returns). A well-formed value that differs from the current token is 409, an unparseable one is 400 (as Orders OD-12.10).

---

## 10. Submission Gates (validators owned by Collections)

**CD-10.1** The submit-time validators re-read a sheet's stored rows and reject negative stored amounts only (night: office cash; morning: cash, cheque; admin: online, bank deposit). They cannot fire through the API and exist as a safety net.

**CD-10.2 No completeness rule (binding).** A sheet with no collection rows, or with some clients blank, passes. Employees only enter clients who paid.

---

## 11. HTTP Status Conventions

| Situation | Status |
|---|---|
| Invalid shape, range, precision, duplicate client, client not valid for category, status does not allow the phase | 400 |
| Missing `expectedUpdatedAt`, malformed token | 400 |
| Sheet not found | 404 |
| Stale token, serialization retry exhausted | 409 |
| Not authenticated / lacks role (employee calling admin-save) | 401 / 403 |
| Throttled (each of the six save endpoints is limited to 10 per minute per user, counted separately per endpoint; Q7) | 429 |

**CD-11.1 Success status (binding; Q6).** All six save endpoints answer 200, as Orders does (not 201).

---

## 12. Access and Roles

**CD-12.1** All endpoints require login. GET and the four night/morning saves require `EMPLOYEE` (admins also pass). Admin saves require `ADMIN`.

**CD-12.2** The category is part of the URL path, and the role is read from the JWT, never from the body.

**CD-12.3 No per-group scoping (binding, as implemented; Q1).** Any employee (and any admin) may read and edit the collections of any group's sheet. There is no per-group or per-sheet authorization in Collections, as in Orders (OD-1.3) and Paper (PA-1.3).

---

## 13. Save Pattern: why Orders, not Client Trays

**CD-13.1 Comparison (verified in code).**

| Aspect | Client Trays | Orders | Collections follows |
|---|---|---|---|
| What the user submits | Only returns. The server calculates the rest | Sparse entries typed by the user | Orders: amounts typed by the user |
| Write scope | Rebuilds the sheet's complete ledger every save | Only the submitted, processed entries | Orders |
| Rows not in the request | Deleted if not in the recalculated ledger (CT-7.3) | Untouched | Orders. Collections has no delete (CD-1.5) |
| Write mechanism | Delete obsolete rows, then bulk `INSERT ... ON CONFLICT` | Bulk `INSERT ... ON CONFLICT` | Bulk `INSERT ... ON CONFLICT` (both agree) |
| Token | Mandatory, `touchIfTokenMatches`, advanced on every save | Mandatory, compared first, advanced only if data changes (OD-12.8) | Orders. Required by the no-advance-on-no-op rule (CD-9.4) |
| Save response | New token | New token | New token plus totals and `changed` |
| Unknown fields | Stripped (CT-4.5) | Rejected (OD-5.5) | Rejected (global validation) |

**CD-13.2 Why not Client Trays.** Its pattern is "recompute everything, replace the set". That is right for a derived ledger and wrong here: a collection save for 5 clients must not remove or reset the other 40, and the module has no delete.

**CD-13.3 What is taken from Client Trays.** The bulk `ON CONFLICT` upsert on the unique key, "an untouched amount is 0 and is stored as 0" (CT-4.6, matching CD-2.1), and the token name pattern (`...UpdatedAt`).

**CD-13.4 What is taken from Orders.** Sparse partial saves, historical-client handling (CD-6.2), token compared first, no-op saves leaving the token alone, and rejecting unknown fields.

**CD-13.5 One difference from Orders.** Orders counts any save that targets an existing line as a change (OD-12.8.5). Collections compares values: a row identical to the stored row is not a change and does not advance the token (CD-9.4).

---

## 14. Open Items (must be confirmed before treating as final)

**CD-14.1 Maximum amount.** The 10,000,000 cap per amount field is a placeholder. The decisions require a maximum but give no number. It lives in one constant (`COLLECTION_AMOUNT.MAX`). Confirmed as a placeholder and left as is (Q12).

**CD-14.2 Client Trays pattern. RESOLVED.** Compared and decided in Section 13.

**CD-14.3 Admin columns hidden by backend projection.** The decisions allow "frontend or backend projection". The backend does it, so the data never reaches an employee's browser. Switching to frontend-only hiding means passing `includeAdminColumns = true` always.

**CD-14.4 Blank = 0 vs partial saves. RESOLVED (Q3).** Blank = 0 applies inside a submitted row; partial saves apply at row level. A cleared cell in a submitted row is stored as 0, not left unchanged. A field-level "blank leaves it unchanged" rule (as in Orders OD-5.1) was considered and not adopted, because it contradicts CD-2.1 and would need a different column set per row in the bulk upsert. The risk (a partial row resetting a field) is closed on the client: the frontend always sends the complete phase row (CD-8.3, verified).

**CD-14.5 Totals scope.** Save responses return totals for the saved category only, not both grids and not per-row totals.

**CD-14.6 Numbering gap. RESOLVED (Q13).** Nothing is missing: there is no CD-7, CD-8 or "Decision 8" to recover. The gap between Sections 6 and 9 is closed by the new Sections 7 and 8. Renumbering was not done because CD IDs are cited in code comments and in the Paper and Cash Settlement files; no existing ID changed.

**CD-14.7 Migration is destructive.** Remark columns are dropped. Rename must be a `RENAME COLUMN` (see `collections_decisions_migration.sql`) or office amounts are lost.

**CD-14.8 Outside this module (verified).** Nothing else in the backend reads `office_amount_given`, `officeAmountGiven`, `employee_remarks` or `admin_remarks`. The frontend Collections feature was checked (Section 8). Modules not provided (for example reports) were not checked.

**CD-14.9 Cash Settlement does not use the office cash collection. RESOLVED (Q5).** Left as is; see CD-7.1.

**CD-14.10 Frontend edit handling (open, found in the frontend review).** (a) Saving one phase reloads the grid and clears ALL unsaved edits, including edits typed for another phase (for example morning cash typed, then Save Night pressed). (b) Every failure clears edits and reloads, including a 400 validation error and a "took too long, nothing was saved" 409 (Orders keeps edits on the timeout 409, OD-12.10). (c) Milk and non-milk are two requests: if the second fails after the first succeeded, the user sees a generic "Save failed" although the first category is saved. Current behavior is documented in CD-8.2 and CD-8.6; a decision is needed before any change.

**CD-14.11 Reports not checked.** The Reports module was not provided, so its use of the renamed columns and of admin amounts is unverified (CD-14.8).

---

## 15. Traceability and Change Log

| Source decision | Applied as |
|---|---|
| 1 | CD-9.1 |
| 2, 24 | CD-1.3, CD-5.4 |
| 3 | CD-3.3, CD-6.2 |
| 4, 22 | CD-4.1, CD-4.2 |
| 5, 10, 26 | CD-5.2, CD-5.3 |
| 6, 7, 12 | CD-6.1, CD-13 (bulk upsert by key, no audit table) |
| 9 | CD-2.1, CD-2.2 |
| 11 | CD-1.2 |
| 13, 14, 15, 16 | CD-12.1, CD-3.8, CD-2.0, CD-1.5 |
| 17 | CD-9.4 |
| 18 | CD-3.1 |
| 19 | CD-3.2, CD-11 |
| 20 | CD-2.3 |
| 21 | CD-3.6 |
| 23 | CD-6.1, CD-14.4 |
| 25 | CD-10.2 |

| ID | Type | Summary |
|---|---|---|
| CD-1.2 / 1.3 | Changed | Field renamed, remarks removed |
| CD-2.1 / 2.2 | Changed | Blank = 0 in submitted rows, all-zero new rows create nothing |
| CD-2.3 | Changed | Morning-edit error states the status and allowed statuses |
| CD-3.1 / 3.2 | Changed | Lean GET payload, token as top-level `collectionsUpdatedAt`, 404 for missing sheet |
| CD-3.6 | Changed | Sort by code, then name, codeless clients last |
| CD-3.8 | Changed | Admin columns projected out for non-admins |
| CD-4 | Changed | Save returns token and totals |
| CD-5 | Changed | Strict 2-decimal, capped, blank allowed |
| CD-6.2 | Changed | Historical clients updatable on bulk saves, live rules only for new rows |
| CD-9.1 / 9.4 | Changed | Token mandatory (explicit null for first save), no-op saves keep the token |
| CD-6.1 / 13 | Changed | Write is a bulk `ON CONFLICT` upsert of changed rows only, chosen after comparing Orders and Client Trays |
| CD-5.4 | Changed | `clientId` capped at 2147483647 (prevents a database overflow 500) |
| CD-2.2 / 6.2 / 6.4 | Changed | An all-zero row for a client with no stored row is ignored before any client rule (Q2) |
| CD-4.1 | Changed | Save response carries `changed` (Q14) |
| CD-3.6 | Changed | Natural, case-insensitive client sort in a fixed locale (Q11) |
| CD-7 | New | Link to Cash Settlement: route cash is `cash_collection` only (Q5); a changed cash amount advances Cash Settlement's token (Q4) |
| CD-8 | New | Frontend contract, including no refetch on focus or reconnect (Q15) |
| CD-9.6 / 9.7 | Documented | Lost-response retry is 409 (Q9); token format (Q10) |
| CD-6.3 / 11 / 11.1 / 12.3 | Documented / Changed | Timeout 409 (Q8); throttle per endpoint (Q7); saves answer 200 (Q6); no per-group scoping (Q1) |
| CD-14 | Changed | CD-14.2, 14.4, 14.6, 14.9 resolved; CD-14.10 and 14.11 opened |
| CD-5.5 | Clarified | A duplicated client id is listed once in the message (D-16 fixed after the automated test run) |
| CD-7.3 | Changed | PA-8.11 and CS-10.3 amendments applied |

### Review decisions of this version (Q1 to Q15)

| Q | Decision | Applied as |
|---|---|---|
| 1 | Any employee, any group's sheet | CD-12.3 |
| 2 | All-zero row for a client with no row is ignored, no client rule | CD-2.2, 6.2, 6.4 |
| 3 | Blank = 0 stays; frontend always sends the full phase row | CD-2.1, 8.3, 14.4 |
| 4 | A changed cash amount also advances Cash Settlement's token | CD-7.2 |
| 5 | Office cash stays out of route cash | CD-7.1, 14.9 |
| 6 | Saves answer 200 | CD-11.1 |
| 7 | Throttle per endpoint, as is | CD-11 |
| 8 | Timeout stays 409 | CD-6.3 |
| 9 | Lost-response retry stays 409 | CD-9.6 |
| 10 | Any parseable ISO-8601, mismatch 409 | CD-9.7 |
| 11 | Natural, case-insensitive sort | CD-3.6 |
| 12 | Cap stays a placeholder | CD-14.1 |
| 13 | Nothing missing; gap closed by Sections 7 and 8 | CD-14.6 |
| 14 | `changed` added to save responses | CD-4.1 |
| 15 | Frontend reviewed; no refetch on focus or reconnect | CD-8 |