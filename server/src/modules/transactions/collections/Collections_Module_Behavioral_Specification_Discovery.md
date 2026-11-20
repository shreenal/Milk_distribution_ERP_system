# Collections Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Collections module. No automated tests are included.

**Revision note:** the business owner answered Q1 to Q15 after this was first written, and the frontend files were reviewed. Impl cells in section C were updated where an answer changes them. Section F records the decisions, discrepancy status, new scenarios and what is still open. Sections D and E show the state before the decisions. Code changes are implemented; the backend scenarios were then verified by an automated run (section G).

**Second revision (automated tests):** the backend specs were run. 105 of 106 tests passed on the first run; the one failure was S-46b (defect D-16), now fixed in `duplicate-entry.ts` (section G). The frontend specs (S-150 to S-155) are written and have not been run yet. Impl cells below are updated accordingly.

## Evidence and Labels

`COLLECTION_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its CD-n items are treated as confirmed requirements. Supporting evidence: the Collections code (controller, service, repository, builder, validation service, DTOs, decorator, constants), `PAPER_BUSINESS_DECISION.md` (PA-n), `ORDERS_BUSINESS_DECISION.md` (OD-n), `CASH_SETTLEMENT_BUSINESS_DECISION.md` (CS-n), the shared transaction/concurrency code, `workflow-state.service.ts`, `schema.prisma`, and the Orders discovery document as the structural and "lessons learned" reference.

**Not available** (each would shrink the Unknowns list): existing Collections tests and issue/bug history, Swagger output (`metadata.js`), UI mockups, `collections_decisions_migration.sql`, the Reports module (CD-14.8), the Client Trays and Dairy Trays decision files, and any record of "Decision 8" (CD-14.6).

**Correction:** the frontend Collections files, `QueryProvider.tsx`, `http.ts` and `error.ts` were in the supplied files and were missed in the first pass. They are reviewed in this revision (D-19 to D-23, section F).

**Labels:** **[C]** confirmed requirement (CD / PA / OD / CS id). **[O]** observed in code only. **[I]** inferred assumption. **[U]** unknown, needs a decision.

**Assumptions made explicit**
1. CD-n beats code where they disagree (the file says so). Where CD is silent, the sibling modules (Orders, Cash Settlement) are used only as *analogies*, labelled [I], never as requirements.
2. The Collections numbering in the decision file skips CD-7 and CD-8. I assume nothing was intended there (see D-7, Q13).
3. Scenario IDs (`S-n`) are scoped to this document and are not the Orders `S-n` IDs.

---

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /collections/sheet/:sheetId` | EMPLOYEE (ADMIN passes) | global 300/min | Milk and non-milk collection grids, workflow block, token |
| `POST .../sheet/:sheetId/milk/night-save` and `.../non-milk/night-save` | EMPLOYEE | 10/min, counted per endpoint [C: CD-11] | Writes `office_cash_collection` |
| `POST .../milk/morning-save` and `.../non-milk/morning-save` | EMPLOYEE | 10/min, counted per endpoint [C: CD-11] | Writes `cash_collection`, `cheque_collection` |
| `POST .../milk/admin-save` and `.../non-milk/admin-save` | ADMIN only | 10/min, counted per endpoint [C: CD-11] | Writes `online_collection`, `bank_deposit` |

All six saves answer 200 [C: CD-11.1].

Non-endpoint surface: Paper readiness gates call `validateNightCollections`, `validateMorningCollections`, `validateAdminCollections` (PA-6.2, PA-7.2, PA-8.6). Cash Settlement reads `client_collection.cash_collection` (CS-3.1).

### A2. What each paper status allows [C: CD-2.0, PA-2.4]

| Paper status | Night save | Morning save | Admin save |
| --- | --- | --- | --- |
| DRAFT | Yes | No | No |
| NIGHT_SUBMITTED | Yes | Yes | No |
| MORNING_SUBMITTED | No | No | Yes |
| FINALIZED | No | No | No |
| REOPENED | Yes | Yes | Yes |

GET is allowed in every status [I: CD-2.0 only restricts saves].

### A3. Collection row lifecycle

1. **Absent.** A client shows all amounts 0 and `collectionId: null` [C: CD-3.4].
2. **Created** by the first save that carries a positive amount in the current phase. Other phases' columns default to 0 [C: CD-2.2, 6.5].
3. **Updated** by a save whose values differ from the stored ones. Only the phase's columns are written; the rest are never touched [C: CD-6.5].
4. **Zeroed.** Overwriting with zeros keeps the row (no delete) and the client stays "historical" [C: CD-1.5, 3.3; I for the "stays historical" consequence].
5. **No-op.** Values equal to stored, or all-zero for a client with no row: nothing written, token untouched [C: CD-9.4].
6. **Removed** only when the paper is removed (DB cascade) [O: `schema.prisma`]. There is no API delete [C: CD-1.5].

### A4. Side effects and downstream consumers

- **Concurrency token:** `order_sheet.collections_updated_at`, one per sheet, shared by all three phases and both categories [C: CD-9.2]. Advances once per request that changes data.
- **Cash Settlement token:** a save that creates or changes a `cash_collection` amount also advances `order_paper.updated_at` in the same transaction [C: CD-7.2].
- **No propagation.** Collections does not call the dependency orchestrator or enqueue outbox rows [O]. The only register entry is Collections to Cash Settlement, CONSUMPTION on read (DEP-011) [O: `dependency-register.ts`].
- **Consumers:** Cash Settlement (`cash_collection` only, both categories, CS-3.1, CD-14.9); Paper readiness gates (negative-amount safety net, CD-10.1); Reports (not provided, CD-14.8).
- **No audit/history** [C: CD-1.5, PA-20.2].
- **No logging** of saves [O].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | A phase never writes another phase's columns | CD-6.5 |
| INV-2 | Category comes from the URL, never the body; milk endpoints only touch MILK rows | CD-6.6 |
| INV-3 | Blank amount in a submitted row is stored as 0; clients not in the request are untouched | CD-2.1, 6.1 |
| INV-4 | Amount is a JSON number, 0 to 10,000,000, at most 2 decimals, rejected not rounded | CD-5.2, 5.3 |
| INV-5 | A no-op never advances the token; a stale token is 409 even for a no-op | CD-9.3, 9.4 |
| INV-6 | Each save is all-or-nothing, including the token | CD-6.3, 9.5 |
| INV-7 | An all-zero row for a client with no stored row creates nothing | CD-2.2 |
| INV-8 | One row per (sheet, client, category) | CD-0 glossary, [O: DB unique] |
| INV-9 | A recorded collection never vanishes from the grid because of later master-data edits | CD-3.3 |
| INV-10 | Admin amounts never reach a non-admin caller (grids, totals, save responses) | CD-3.8, 14.3 |
| INV-11 | Collections never reads order quantities or bills | CD-1.4 |
| INV-12 | Totals are computed on read, never stored; exact decimals, 2dp half-up | CD-3.5 |
| INV-13 | `expectedUpdatedAt` is required on every save; omitted is always 400 | CD-9.1 |
| INV-14 | An all-zero row for a client with no stored row is ignored: no row, no client rule, no error | CD-2.2, 6.2 |
| INV-15 | Only a changed `cash_collection` moves Cash Settlement's token; no-op and failed saves never do | CD-7.2 |

**Security constraints**

- SEC-1: JWT required on all endpoints [C: CD-12.1].
- SEC-2: an inactive user gets 401 [I, from `JwtStrategy`].
- SEC-3: the role comes from the DB-backed user, never the body [C: CD-12.2; O].
- SEC-4: employees cannot call admin-save (403) [C: CD-2.0, 11].
- SEC-5: unknown body fields rejected (400) [C: CD-5.4].
- SEC-6: URL ids are digits only, 1 to 2147483647 [I: OD-4.3, PA-5.6; `ParseIdPipe`].
- SEC-7: the SQL column identifiers in the upsert come from a closed union supplied by the service, values are parameterized [O].
- SEC-8: body limit 1 MB [O]; unexpected errors are masked with a request id [I: PA-11.5].
- SEC-9: no per-group or per-sheet authorization, by decision [C: CD-12.3].

---

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Data model, rename, remarks removed, no delete | CD-1.1 to 1.5 |
| Workflow matrix and status messages | CD-2.0, 2.3 (CD-2.1, 2.2 for blanks and zero rows) |
| Grid view | CD-3.1 to 3.8 |
| Save responses | CD-4.1, 4.2 |
| Input validation | CD-5.1 to 5.6 |
| Save mechanics | CD-6.1 to 6.6 |
| Concurrency token | CD-9.1 to 9.5 |
| Submission gates | CD-10.1, 10.2 |
| HTTP statuses | CD-11 |
| Access | CD-12.1, 12.2 |
| Save pattern | CD-13.1 to 13.5 |
| Cross-module | PA-2.4, PA-6.2, PA-7.2, PA-8.3, PA-8.6, PA-17.4, PA-20.2, CS-3.1, CS-12.3 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | The six POST handlers have no `@HttpCode`, so success is HTTP 201. Orders had the same issue and pinned 200 (Orders test notes, DISC-1). CD lists no success code | `collections.controller.ts` |
| O-2 | `@Throttle` is declared per handler, so each of the six endpoints has its own 10/min bucket, not one shared bucket per user | `collections.controller.ts` |
| O-3 | A date-only or other loose ISO token passes the DTO, then mismatches and gives 409. Non-ISO gives 400 | `expected-updated-at.decorator.ts` |
| O-4 | A transaction over 10 s returns 409 "took too long and nothing was saved" (CD silent; PA-11.3 covers Paper) | `transaction-runner.ts` |
| O-5 | The "client rules for new rows" check runs on every row without a stored row, including all-zero ones, before the diff that would discard them | `collections.service.ts` |
| O-6 | The duplicate-client message listed a repeated id once per extra occurrence (an id sent 3 times appeared twice). Fixed, see D-16 | `duplicate-entry.ts` |
| O-7 | Collections uses `order_sheet.collections_updated_at`; Cash Settlement uses `order_paper.updated_at`. A Collections save changes route cash (a Cash Settlement input) without advancing Cash Settlement's token | both services |
| O-8 | Grouped headers read "Night Entry", "Morning Entry", "Admin Entry" (CD-3.7 says "Night", "Morning", "Admin"). Phase columns carry no `editable` flag; only code, name and totals carry `editable: false` | `collections.builder.ts` |
| O-9 | The workflow block adds `canFinalize` to the three phase permissions | `workflow.builder.ts` |
| O-10 | The save response has no `changed` flag (Cash Settlement has one). A client can detect a no-op only by an unchanged token | `collections.service.ts` |
| O-11 | Client sort uses `localeCompare` without numeric collation, so code "10" sorts before "9" | `collections.repository.ts` |
| O-12 | The negative-amount validators cannot fire through the API (DTO blocks negatives) and the DB has no CHECK constraint | validators, DTOs |
| O-13 | Admin projection omits fields (absent, not null) for non-admins | `collections.builder.ts` |
| O-14 | `totalClients` counts every displayed client, including those with zero amounts | `collections.builder.ts` |
| O-15 | After a client is zeroed, the all-zero row stays and keeps the client in the grid | CD-1.5; `getClientsForCollectionDisplay` |

### B3. Inferred (assumptions)

- **I-1:** An inactive user's unexpired token gets 401 (`JwtStrategy`).
- **I-2:** A malformed URL id gets 400 "Invalid id" (`ParseIdPipe`, as OD-4.3).
- **I-3:** A double-click on Save gives one success and one 409 (follows from CD-9).
- **I-4:** A save racing a Paper status change has exactly one winner, because the status is read inside the same serializable transaction (PA-11.1).
- **I-5:** A DB error gives a masked 500 with nothing saved and the token rolled back.
- **I-6:** Saves are not blocked for a sheet of a deactivated group (nothing checks the group's `is_active` on save).

### B4. Unknowns

See section E.

---

## C. Behavioral Scenario Matrix

**Impl column:** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. U-n points to an open question in section E. SEAM means it cannot be reached through the public API and needs DB seeding or an injected fault.

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-01 | No/expired/garbage JWT, any of the 7 endpoints | 401 | none | CD-12.1 | OK |
| S-02 | Valid EMPLOYEE, GET and the four night/morning saves | Allowed | none | CD-12.1 | OK |
| S-03 | Valid ADMIN, GET and the four night/morning saves | Allowed (role hierarchy) | none | CD-2.0, 12.1 | OK |
| S-04 | EMPLOYEE calls milk or non-milk `admin-save` | 403 | nothing saved | CD-2.0, 11, 12.1 | OK |
| S-05 | Deactivated user, unexpired token | 401 | none | I-1 | OK |
| S-06 | Same user sends an 11th save to one endpoint within 60 s | 429. Other users unaffected | none | CD-11 | OK (per endpoint, CD-11) |
| S-07 | Body or entry has an unknown field (`employeeRemarks`, `adminRemarks`, `officeAmountGiven`, `foo`) | 400, nothing saved | none | CD-1.3, 5.4 | OK |
| S-08 | Body carries `role: "ADMIN"` or `category: "MILK"` | 400 (unknown field). Role comes from JWT, category from URL | none | CD-12.2, 6.6 | OK |
| S-09 | Employee of group A reads or edits group B's sheet | Allowed | - | CD-12.3 | OK |

### C2. Reads (`GET /collections/sheet/:sheetId`)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-10 | Sheet id missing in DB | 404 "Order sheet not found" | none | CD-3.2 | OK |
| S-11 | Id is `abc`, `0`, `-1`, `2147483648`; `007` | 400 "Invalid id"; `007` is read as 7 | none | I-2 | OK |
| S-12 | Never-saved sheet | Both grids list all eligible clients, amounts 0, `collectionId: null`, `collectionsUpdatedAt: null` | none | CD-3.1, 3.4 | OK |
| S-13 | Any sheet | Payload is exactly `{ sheet:{id, orderPaperId, groupId, groupName}, workflow, collectionsUpdatedAt, milkCollectionGrid, nonMilkCollectionGrid }`. The raw order-sheet row is absent | none | CD-3.1 | OK |
| S-14 | Client active, in group, authorized for the category | Row appears even with no collection | none | CD-3.3 | OK |
| S-15 | Client has a row for this sheet and category, since deactivated / moved group / de-authorized | Row still appears | none | CD-3.3 | OK |
| S-16 | Client authorized for MILK only | Appears in the milk grid only. A client with both categories has independent rows per grid | none | CD-0, 3.3 | OK |
| S-17 | Row office 100, cash 200, cheque 50, online 10, bank 5 (ADMIN) | employeeTotal 350, adminTotal 15, grandTotal 365 | none | CD-3.5 | OK |
| S-18 | Several clients | Grid totals are column sums plus `totalClients` | none | CD-3.5 | OK (O-14) |
| S-19 | Amounts like 0.1 and 0.2 | Totals are exact (0.30), 2dp half-up | none | CD-3.5 | OK |
| S-20 | Codes "A1", "B2", two codeless clients | Sorted by code then name; codeless last, by name | none | CD-3.6 | OK |
| S-21 | Codes "C9", "C10", "c11" | Natural, case-insensitive order: C9, C10, c11 | none | CD-3.6 | OK (verified by test run) |
| S-22 | ADMIN GET | Columns: Client Code, Client Name, Night (Office Cash), Morning (Cash, Cheque), Total (Employee), Admin (Online (UPI), Bank Deposit), Total (Admin), Grand Total | none | CD-3.7 | OK in content; header wording D-12 |
| S-23 | EMPLOYEE GET | No Online, Bank Deposit, Total (Admin), Grand Total in columns, rows or totals | none | CD-3.8 | OK |
| S-24 | Each paper status | `workflow.permissions` match section A2 | none | CD-2.0 | OK (O-9) |
| S-25 | Client zeroed after a save (row kept) | Row appears with a non-null `collectionId` and zeros | none | CD-1.5, 3.3 | OK (O-15) |
| S-26 | GET on a DRAFT, MORNING_SUBMITTED and FINALIZED paper | Allowed | none | I | OK |

### C3. Save validation (all six saves)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-30 | `expectedUpdatedAt` omitted, each of the six endpoints | 400 | none | CD-9.1 | OK |
| S-31 | Sheet token never set, `expectedUpdatedAt: null`, one positive row | 200 with a new token | row created, token set once | CD-9.1 | OK |
| S-32 | Token already set, send `null` | 409 | none | CD-9.1 | OK |
| S-33 | Token `"abc"`, number `123`, `""` | 400 | none | CD-9.1 | OK |
| S-34 | Date-only token (`"2026-10-01"`) | 409 (valid ISO-8601, never equal) | none | CD-9.7 | OK |
| S-35 | Amount 1250, 1250.5, 1250.50, 0 | Accepted | stored as given | CD-5.3 | OK |
| S-36 | Amount 1250.555 | 400, never rounded | none | CD-5.3 | OK |
| S-37 | Amount 10,000,000 and 10,000,000.01 | OK and 400 (cap is a placeholder) | none | CD-5.2, 14.1 | OK (U: Q12) |
| S-38 | Amount -1, `"500"`, `true`, `[]` | 400 | none | CD-5.2 | OK |
| S-39 | Amount `null`, `""`, omitted | Accepted, stored as 0 inside the submitted row | see S-64 | CD-5.1, 2.1 | OK |
| S-40 | Amount `1e-7` (exponent form) | 400 precision error, not a 500 | none | CD-5.3 (decorator note) | OK |
| S-41 | `entries: []`, token matches | 200, current token unchanged | none | CD-5.4, 9.4 | OK |
| S-42 | `entries: []`, token stale | 409 | none | CD-9.3 | OK |
| S-43 | 1000 entries OK; 1001 entries | 200; 400 | none | CD-5.4 | OK |
| S-44 | `entries` omitted, `null`, or not an array | 400 | none | I | OK |
| S-45 | `clientId` 0, -1, 1.5, `"7"`, 2147483648 | 400 | none | CD-5.4 | OK |
| S-46 | Same `clientId` twice (both with amounts, or both blank) | 400 "Duplicate client entries found: <ids>. Each client can only appear once per save." | none | CD-5.5 | OK; O-6 fixed (D-16), see S-46b |
| S-47 | Duplicate client plus a stale token | 400 (validation first) | none | CD-5.6 | OK |
| S-48 | Duplicate client for a missing sheet | 400 (before the sheet lookup) | none | CD-5.6 | OK |

### C4. Workflow gates

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-50 | Night save in DRAFT, NIGHT_SUBMITTED, REOPENED | Allowed | - | CD-2.0 | OK |
| S-51 | Night save in MORNING_SUBMITTED, FINALIZED | 400 "Night collections cannot be edited in the current workflow state" | none | CD-2.3 | OK |
| S-52 | Morning save in NIGHT_SUBMITTED, REOPENED | Allowed | - | CD-2.0 | OK |
| S-53 | Morning save in DRAFT, MORNING_SUBMITTED, FINALIZED | 400 "Cannot edit morning collections when paper is <STATUS>. Allowed statuses: NIGHT_SUBMITTED, REOPENED" | none | CD-2.3 | OK |
| S-54 | Admin save in MORNING_SUBMITTED, REOPENED | Allowed | - | CD-2.0 | OK |
| S-55 | Admin save in DRAFT, NIGHT_SUBMITTED, FINALIZED | 400 "Admin collections cannot be edited in current workflow state" | none | CD-2.3 | OK |
| S-56 | Wrong status plus stale token | 400 (status before token) | none | CD-6.4 | OK |
| S-57 | Missing sheet, any save | 404 before any status check | none | CD-3.2, 6.4 | OK |
| S-58 | Save races a Paper submit/finalize | Exactly one wins. A save never lands in a state that no longer allows it | serializable | I-4, PA-11.1 | OK [I] |
| S-59 | Admin reverts MORNING_SUBMITTED to NIGHT_SUBMITTED | Morning saves allowed again, admin saves closed | - | PA-18, CD-2.0 | OK |

### C5. Save mechanics and business rules

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-60 | Night save, client with no row, office 100 | 200. Row created with office 100 and all other columns 0 | token set once | CD-6.1, 6.5 | OK |
| S-61 | Night save, new client, all amounts blank or 0 | 200, no row created, token unchanged | none | CD-2.2, 9.4 | OK |
| S-62 | Existing row, submitted values equal stored | 200, token unchanged, nothing written | none | CD-9.4 | OK |
| S-63 | Existing row, one value differs | Updated; token advances once; `updated_at` changes. Other phase columns unchanged | one write | CD-6.5, 9.5 | OK |
| S-64 | Morning row (existing, cash 200 cheque 50) submitted with only `cashCollection: 300` | Cheque becomes 0 (blank = 0 inside a submitted row). The frontend never sends a partial row (CD-8.3) | cheque overwritten | CD-2.1, 14.4 | OK (resolved) |
| S-65 | Morning row with cash and cheque | Both written. Office, online, bank untouched | - | CD-6.5 | OK |
| S-66 | Admin row with online and bank | Both written. Office, cash, cheque untouched | - | CD-6.5 | OK |
| S-67 | Request names 5 of 45 clients | The other 40 are untouched | - | CD-6.1 | OK |
| S-68 | Mixed request: 1 unchanged, 1 changed, 1 new positive, 1 new all-zero | Exactly 2 rows written; token advances once | - | CD-2.2, 9.4, 9.5 | OK |
| S-69 | Existing row set to all zeros | Row kept with zeros; counts as a change (token advances) | row stays | CD-1.5 | OK |
| S-70 | New row for a client that is inactive, in another group, not authorized for the category, or nonexistent, positive amount | 400 "Client <id> does not belong to <CATEGORY> category.", whole request fails | token rolled back | CD-6.2 | OK |
| S-71 | Same as S-70 but the row is all-zero | 200, no row created, token unchanged, no client rule applied (an unknown id is not an error) | none | CD-2.2, 6.2 | OK (verified by test run) |
| S-72 | Client that already has a row, since deactivated / moved / de-authorized | Update allowed | - | CD-6.2 | OK |
| S-73 | 1 bad row among 50 | Whole request fails, nothing saved, token unchanged | rollback | CD-6.2, 9.5 | OK |
| S-74 | Milk endpoint save for a client that also has a NON_MILK row | NON_MILK row untouched | - | CD-6.6 | OK |
| S-75 | Client buys both categories | Two independent rows per sheet | - | CD-0 | OK |
| S-76 | Night save entry carries `onlineCollection` or `cashCollection` | 400 (unknown field). A phase cannot write another phase's columns | none | CD-6.5, 5.4 | OK [I] |
| S-77 | Any successful save, ADMIN | Status 200. Response is `{ success, changed, message, collectionsUpdatedAt, totals }`, totals of the saved category only | - | CD-4.1, 4.2, 11.1, 14.5 | OK (verified by test run) |
| S-78 | Same save, EMPLOYEE | Totals omit online, bank, adminTotal, grandTotal | - | CD-3.8, 4.2 | OK |
| S-79 | Totals after a partial save | Rebuilt from stored data, including rows not in the request | - | CD-4.2 | OK |
| S-80 | No-op save | `changed: false` and the unchanged current token | - | CD-4.1, 4.2 | OK (verified by test run) |

### C6. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-90 | Two users save with the same token | One succeeds, the other 409 | one write | CD-9.2 | OK |
| S-91 | Milk save, then non-milk save with the token loaded before the first | 409 (one token for both categories) | - | CD-9.2 | OK |
| S-92 | User A saves night amounts; user B holds an open morning or admin screen | B's next save is 409 | - | CD-9.2 | OK |
| S-93 | A's no-op save (equal values or empty `entries`) | B's token still valid | - | CD-9.4 | OK |
| S-94 | Double-click Save | One success, one 409 | one write | I-3 | OK |
| S-95 | Response lost, client retries with the old token | 409 although data was saved | - | CD-9.6 | Accepted |
| S-96 | Serialization conflict three times | 409 "Your request conflicted with another update and could not be completed. Please retry." | rollback | CD-6.3 | OK |
| S-97 | Transaction exceeds 10 s | 409 "took too long and nothing was saved" | rollback | CD-6.3 | Accepted |
| S-98 | DB error or unexpected exception | Masked 500 with `requestId`, nothing saved, token rolled back | rollback | I-5 | OK |
| S-99 | Two first-ever saves for the same (sheet, client, category) | Never two rows, never a unique-violation 500. One wins, the other 409 | - | INV-8 | OK [I] |
| S-100 | Morning save changes a `cash_collection` value while a Cash Settlement screen is open | The Cash Settlement save with its old token is 409 | `order_paper.updated_at` advanced | CD-7.2 | Token half verified (S-132 to S-135); Cash Settlement API half blocked, no test |

### C7. Submission and finalization gates (called by Paper)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-110 | Night submit, a sheet with no collection rows | Collections gate passes | - | CD-10.2, PA-6.2 | OK |
| S-111 | Night, morning, finalize with some clients blank | Passes | - | CD-10.2 | OK |
| S-112 | Stored negative `office_cash_collection` at night submit | 400 with `Sheet "<group>": Office cash collection cannot be negative` in `details[]` | nothing changes | CD-10.1, PA-6.4 | SEAM (O-12) |
| S-113 | Stored negative `cash_collection` or `cheque_collection` at morning submit | Blocked, message names the column | - | CD-10.1, PA-7.2 | SEAM |
| S-114 | Stored negative `online_collection` or `bank_deposit` at finalize | Blocked | - | CD-10.1, PA-8.6 | SEAM |
| S-115 | A negative in another phase's column | Does not block this phase's gate | - | CD-10.1 | OK [I] |
| S-116 | Re-finalize of a REOPENED paper | Admin gate and the morning gate run again | - | PA-8.3, 8.6 | OK |
| S-117 | Collections failure with other modules failing | Reported together in one 400 `details[]` | - | PA-6.4 | OK |

### C8. Cross-module behavior

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-120 | Rows with office, cash, cheque, online, bank on a route | Cash Settlement route cash counts `cash_collection` only, both categories | - | CS-3.1, CD-14.9 | OK (business question Q5) |
| S-121 | Morning cash corrected on a REOPENED paper | Cash Settlement summary reflects it on next read | - | CS-3.6, PA-8.9 | OK |
| S-122 | Collected amount larger than the client's bill | Accepted | - | CD-1.4 | OK |
| S-123 | Employee collections save | No audit row is written | - | CD-1.5, PA-20.2 | OK |

---

## D. Discrepancies and Gaps

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Likely client-visible gap | Save endpoints return 201. Orders hit the same issue and fixed it with 200; Collections and Cash Settlement controllers lack `@HttpCode`. CD lists no success code | Low to Medium |
| D-2 | Spec conflict | CD-2.2 / 9.4 say an all-zero row for a client with no row creates nothing. CD-6.2 / 6.4 validate new-row clients before the diff. Code follows CD-6.4, so an all-zero row for an ineligible client returns 400. Orders (OD-6.5d) skips live checks for an explicit zero | Low |
| D-3 | Spec ambiguity | "10 per minute per user": code gives each of the six endpoints its own bucket (up to 60 per minute in total) | Low |
| D-4 | Spec gap / risk | Collections and Cash Settlement use different tokens. A Collections save changes route cash without advancing `order_paper.updated_at`, so an open Cash Settlement screen shows stale route cash with no stale signal. Submission gates recompute live, so nothing is wrong at submit | Medium |
| D-5 | Open item, data-loss risk | CD-14.4 is still marked "must be confirmed". A partial morning row (cash only) silently resets cheque to 0 | Medium |
| D-6 | Spec gap | Transaction timeout returns 409 in code; CD lists only serialization conflicts | Low |
| D-7 | Documentation gap | CD numbering skips CD-7 and CD-8; CD-14.6 says "Decision 8" was never provided; Section 15 traceability has no source 8 | Medium |
| D-8 | Spec gap | No decision on per-group scoping for Collections. Orders recorded OD-1.3 (no scoping) explicitly. Money data makes this more sensitive | Medium |
| D-9 | Open item | `COLLECTION_AMOUNT.MAX` is a placeholder (CD-14.1). The migration is destructive (CD-14.7) | Low (pre-go-live) |
| D-10 | Spec gap | Sort order beyond "code then name" is undefined (numeric codes, case, locale) | Low |
| D-11 | Spec gap | No `changed` flag in the save response, unlike Cash Settlement (CS-11.1) | Low |
| D-12 | Doc differs from code | Group headers read "Night Entry" etc. instead of "Night"; phase columns have no `editable` flag, so the frontend must rely on `workflow.permissions` | Info |
| D-13 | Spec gap | `workflow.permissions.canFinalize` exists but is not in CD | Info |
| D-14 | Spec gap | No frontend contract section (token replacement after save, reload on 409, refetch policy) like OD-12.10, PA-16, CS-18 | Medium (unverified) |
| D-15 | Cannot be tested via API | CD-10.1 negative-amount validators (S-112 to S-114) need DB seeding | Info |
| D-16 | Minor defect | Duplicate-client message repeats an id sent three or more times | Low |
| D-17 | Unverified | Reports and the frontend were not checked for the old column names or for leaking admin columns (CD-14.8) | Medium (unverified) |
| D-18 | Doc differs from code | CD-9.1 says "ISO-8601 else 400". A date-only value is ISO-8601 so it passes the DTO and returns 409. Orders recorded this as accepted (OD-12.10) | Low |
| D-19 | Frontend risk | `useCollections` leaves focus and reconnect refetch on (the `QueryClient` sets only `retry`). A refetch under unsaved edits swaps the token and rows; the next save then passes the stale check with the new token and old edits | Medium |
| D-20 | Frontend UX data loss | Saving one phase reloads the grid and clears all unsaved edits, including those typed for another phase | Medium |
| D-21 | Frontend UX | Every failure (400, 409 including the timeout 409) clears edits and reloads. There is no client-side check of the 2-decimal or cap rule, so a server 400 costs the user their edits | Low to Medium |
| D-22 | Frontend gap | Milk and non-milk are two requests. If the second fails after the first succeeded, the user sees a generic "Save failed" although the first category is saved | Low |
| D-23 | Doc differs from UI | CD-4.2 says the frontend replaces its token and totals from the save response without a GET. The frontend reloads the sheet and uses the returned token only to chain milk to non-milk | Low |

**Scenarios the current implementation appears unable to satisfy, or cannot be asserted** (state before the decisions; see F)

- **S-71:** two requirements conflict; whichever is chosen, one of them is violated today or the other.
- **S-95:** a lost-response retry cannot succeed safely (no decision recorded).
- **S-100:** no stale signal exists between Collections and Cash Settlement.
- **S-64:** passes CD-2.1 but fails any future "blank leaves unchanged" decision (Q3).
- **S-06:** passes per endpoint; fails if a shared bucket was intended (Q7).
- **S-112 to S-114:** not reachable through the API (D-15).

---

## E. Open Questions (decisions needed)

**All questions below were answered after this section was written. See section F for the decisions. One new question (Q16) is raised there.**

Each question lists the owner. "(current)" marks what the code does today. No answer is recommended.

**Q1 (Product, D-8). Who may read and edit which sheet?**
- A. Any employee, any group's sheet (current).
- B. Only employees assigned to that group.
- C. Reads open, writes scoped.
- D. Other.

**Q2 (Product, D-2). All-zero row for a client with no row who is not eligible.**
- A. 400, eligibility is checked first (current, follows CD-6.4).
- B. Accept and create nothing, as Orders OD-6.5(d); live checks only for rows that would be created.
- C. Other.

**Q3 (Product, D-5, CD-14.4). Blank amount inside a submitted row.**
- A. Blank is stored as 0, so omitting cheque resets it (current, CD-2.1).
- B. Blank leaves that field unchanged (as Orders OD-5.1); contradicts CD-2.1.
- C. Keep A, and require the frontend to always send the full row.

**Q4 (Product + Eng, D-4). Collections change and the Cash Settlement screen.**
- A. No link; Cash Settlement shows stale route cash until reload (current).
- B. A Collections save also advances `order_paper.updated_at`, making Cash Settlement stale.
- C. Cash Settlement response carries a route-cash-changed notice.
- D. Other.

**Q5 (Product, CD-14.9). Night office cash collection and Cash Settlement.**
- A. Excluded from route cash, office cash, deposits and reconciliation (current).
- B. Included in some figure; needs a Cash Settlement decision.

**Q6 (Eng, D-1). Success status of saves.**
- A. 201 (current).
- B. 200, as Orders.
- C. Not important.

**Q7 (Eng, D-3). Throttle scope.**
- A. 10 per minute per endpoint (current).
- B. 10 per minute across all six saves.
- C. Different numbers per phase.

**Q8 (Eng, D-6). Timeout response.**
- A. 409 retryable (current).
- B. 503.
- C. Document 409 in CD.

**Q9 (Eng + Product). Lost-response retry.**
- A. 409 accepted, as Orders OD-12.9 (current).
- B. Idempotency key.
- C. Treat an identical payload as already applied.

**Q10 (Eng, D-18). Token strictness.**
- A. Any parseable ISO-8601, mismatch is 409 (current).
- B. Full timestamp only.
- C. Same as A, but a mismatch from a non-timestamp input is 400.

**Q11 (Product, D-10). Client sort.**
- A. Plain locale compare of code then name (current).
- B. Natural (numeric-aware) order.
- C. Case-insensitive, fixed collation.

**Q12 (Product, D-9, CD-14.1). Real maximum amount** (placeholder is 10,000,000).

**Q13 (Product, D-7). Missing CD-7, CD-8 and "Decision 8".** Confirm nothing is missing, or supply the decisions.

**Q14 (Eng, D-11). Add `changed` to save responses?**
- A. No (current).
- B. Yes, as Cash Settlement.

**Q15 (Eng, D-14, D-17). Frontend and Reports review.** Need the Collections frontend files, `QueryClient` defaults, and the Reports module to confirm: token replaced from the save response, reload on 409, no refetch under unsaved edits, no admin amounts shown to employees, no use of removed columns.

---

## F. Revision After Decisions (Q1 to Q15)

All fifteen questions are answered and recorded in `COLLECTION_BUSINESS_DECISION.md`. Code changes are implemented and verified for the backend by an automated run (section G). The frontend specs have not been run.

### F1. Decision log

| Q | Decision | Effect | Spec reference |
| --- | --- | --- | --- |
| Q1 | Any employee, any group's sheet | Documented | CD-12.3 |
| Q2 | All-zero row for a client with no stored row is ignored before any client rule | Code changed | CD-2.2, 6.2, 6.4 |
| Q3 | Blank = 0 stays; the frontend must always send the complete phase row (verified it does) | Documented | CD-2.1, 8.3, 14.4 |
| Q4 | A save that changes a `cash_collection` amount also advances `order_paper.updated_at` | Code changed | CD-7.2 |
| Q5 | Office cash stays out of route cash | Documented | CD-7.1 |
| Q6 | Saves answer 200, as Orders | Code changed | CD-11.1 |
| Q7 | Throttle stays per endpoint | Documented | CD-11 |
| Q8 | Timeout stays 409 | Documented | CD-6.3 |
| Q9 | Lost-response retry stays 409 | Documented | CD-9.6 |
| Q10 | Any parseable ISO-8601 token, mismatch 409 (as Orders) | Documented | CD-9.7 |
| Q11 | Natural, case-insensitive client sort in a fixed locale | Code changed | CD-3.6 |
| Q12 | Cap stays a placeholder | none | CD-14.1 |
| Q13 | Nothing missing; numbering gap closed by new Sections 7 and 8, no ID renumbered | Documented | CD-14.6 |
| Q14 | `changed` added to save responses | Code and frontend type changed | CD-4.1 |
| Q15 | Frontend reviewed; no refetch on focus or reconnect | UI changed | CD-8 |

### F2. Discrepancy status

| ID | Status | Note |
| --- | --- | --- |
| D-1 | Resolved | 200 on all six saves |
| D-2 | Resolved | All-zero rows ignored |
| D-3 | Accepted | Per endpoint, documented |
| D-4 | Resolved | Cash changes advance Cash Settlement's token. Side effect: Distributor Transfer screen also goes stale |
| D-5 | Resolved | Blank = 0, frontend sends full rows |
| D-6 | Accepted | Timeout 409 documented |
| D-7 | Resolved | Numbering gap closed |
| D-8 | Resolved | No scoping, documented |
| D-9 | Unchanged | Placeholder cap; destructive migration |
| D-10 | Resolved | Natural sort |
| D-11 | Resolved | `changed` added |
| D-12, D-13 | Unchanged | Header wording and `canFinalize` are informational |
| D-14 | Resolved | Frontend contract written (CD-8) |
| D-15 | Unchanged | Negative validators still need DB seeding |
| D-16 | Resolved | Found by test S-46b. `duplicateKeys` now returns each duplicated key once (shared helper, also used by Orders) |
| D-17 | Partly resolved | Frontend checked; Reports still not provided |
| D-18 | Accepted | Token format documented (CD-9.7) |
| D-19 | Resolved | Refetch on focus and reconnect switched off |
| D-20, D-21, D-22 | Open | Needs a UX decision (Q16) |
| D-23 | Clarified | CD-8.1 allows reload or response |

### F3. New scenarios

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-130 | Any of the six saves succeeds | HTTP 200, not 201 | - | CD-11.1 | OK (verified by test run) |
| S-131 | Save that changes data / no-op save | `changed: true` / `changed: false` | - | CD-4.1 | OK (verified by test run) |
| S-132 | Night/admin save changes office cash, online or bank deposit | `order_paper.updated_at` unchanged | - | CD-7.2 | OK (verified by test run) |
| S-133 | Morning save changes only `cheque_collection` | `order_paper.updated_at` unchanged | - | CD-7.2 | OK (verified by test run) |
| S-134 | Morning save creates a row with positive cash, or changes stored cash | `order_paper.updated_at` advances strictly forward, once | same transaction | CD-7.2 | OK (verified by test run) |
| S-135 | Morning save fails (any 400 or 409) or is a no-op | `order_paper.updated_at` unchanged | rollback | CD-7.2, 9.5 | OK (verified by test run) |
| S-136 | Morning cash change, then Distributor Transfer save with its old token | 409 (accepted side effect) | - | CD-7.2 | Blocked: Distributor Transfer API not provided, no test |
| S-137 | All-zero row for a nonexistent client id | 200 no-op, no error | - | CD-2.2 | OK (verified by test run) |
| S-46b | Same clientId three times in one request | 400, and the id appears once in `Duplicate client entries found: <ids>` | none | CD-5.5, D-16 | OK (verified by test run after the fix) |
| S-150 | Window regains focus or network reconnects with unsaved edits | Sheet is not refetched; token unchanged | none | CD-8.5 | Implemented, not yet run |
| S-151 | Save with both categories edited | Milk then non-milk, second uses the token returned by the first; a category with no edits is skipped | - | CD-8.2 | OK [O] |
| S-152 | User edits one cell of a morning row | Request carries cash and cheque of that client, nothing for untouched clients | - | CD-8.3 | OK [O] |
| S-153 | EMPLOYEE opens the page | Save Admin button absent; admin columns absent | - | CD-8.4, 3.8 | OK [O] |
| S-154 | Save fails with 400 or 409 | Toast with the server message; grid reloaded; edits cleared | - | CD-8.6 | OK [O] (D-21) |
| S-155 | Employee types morning cash, then presses Save Night | Night saved; typed morning cash is discarded | - | CD-8.6 | Current behavior (D-20, Q16) |

### F4. Still open

- **Q16 (Product + Eng, D-20, D-21, D-22). Frontend edit handling.**
  - A. Keep as is: every save reloads the grid and clears all edits (current).
  - B. Clear only the edits of the phase that was saved, and keep the other phases' edits on screen.
  - C. As A, but keep edits when the save fails with a 400 or a timeout 409 (as Orders).
  - D. Other.
- **Cash Settlement and Paper decision files:** the two amendments in CD-7.3 (CS-10.3, PA-8.11) are now applied.
- **Second observer of the sheet query:** confirm nothing else mounts `["collections","sheet",id]`, which would refetch on mount and swap the token.
- **Reports module** not provided (D-17).
- **Frontend specs:** `collections.scenario.ui.spec.tsx` (S-150 to S-155) is written but has not been run yet.
- **Re-run needed** after the D-16 fix: `npx vitest run src/modules/transactions/collections/` (expected 106 of 106), and the Orders specs, because the fixed helper is shared.
- **CD-14.1:** the 10,000,000 cap is still a placeholder.

---

## G. Automated test run

Specs: `src/modules/transactions/collections/collections.scenario.*.spec.ts` plus `test/helper/collections-harness.ts`. Run: `npx vitest run src/modules/transactions/collections/` against `milk_distribution_test`. Scenario to test mapping: `COLLECTIONS_TEST_COVERAGE.md`.

### G1. Result of the first run

| File | Tests | Result |
| --- | --- | --- |
| access | 9 | pass |
| reads | 17 | pass |
| validation | 20 | 19 pass, 1 fail (S-46b) |
| workflow | 9 | pass |
| save | 24 | pass |
| concurrency | 14 | pass |
| gates | 13 | pass |
| **Total** | **106** | **105 pass, 1 fail** |

### G2. Defect found and fixed

- **S-46b / D-16.** An id sent three times was listed twice in the duplicate message (`expected 1 to be 2`). Fixed in `src/common/transactions/validation/duplicate-entry.ts` (`duplicateKeys` collects into a Set). It is a shared helper: Orders (OD-5.6) also benefits; its two-occurrence message is unchanged, so no Orders expectation changes.

### G3. Scenarios without a test

| Scenario | Reason |
| --- | --- |
| S-58 | Needs a successful Paper submit (preconditions outside Collections) |
| S-100, S-136 | Cash Settlement and Distributor Transfer APIs not provided; the token advance itself is verified by S-132 to S-135 |
| S-120, S-121 | Need the Cash Settlement read API |
| S-150 to S-155 | Written, not yet run (frontend) |

### G4. Behaviors confirmed by the run

Everything marked "Implemented, not yet run" in earlier revisions for the backend now passes: S-21 (natural sort), S-71 and S-137 (all-zero rows ignored), S-77, S-80, S-130, S-131 (200, `changed`, response shape) and S-132 to S-135 (Cash Settlement token, CD-7.2). The fault seams S-96, S-97, S-98 and the negative-amount DB seams S-112 to S-114 behave as specified.