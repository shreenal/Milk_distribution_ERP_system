# Dairy Trays Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Dairy Trays module. No automated tests are included.

## Evidence and Labels

`DAIRY_TRAYS_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its DT-n items are treated as confirmed requirements. Supporting evidence only: the Dairy Trays code (controller, service, ledger, validation, propagation, repository, builder, util, constants, DTOs, strip interceptor, module), the dairy part of `TrayCalculationService`, `schema.prisma`, the Paper, Purchase, Vehicle Allocation and Orders decision files and code, the Purchase specs that exercise dairy side effects (PU-118, PU-125 to PU-128) and the Dairy Trays frontend (page, grid, toolbar, admin panel, hooks, api, types).

**Not available** (each would shrink the Unknowns list): any Dairy Trays tests or bug history, `CLIENT_TRAYS_BUSINESS_DECISION.md` (referenced by DT as the pattern), `WorkflowStateService` and `WorkflowBuilder`, `DependencyOrchestratorService` and its constants (finalize trigger), `PropagationOutboxRepository`, the relay and the queue processor (retry and merge rules of DT-10.5), the shared frontend `extractErrorMessage`, the `QueryClient` defaults, Swagger output, and real production data volumes.

**Labels:** **\[C\]** confirmed requirement (DT, PD, PA id). **\[O\]** observed in code only. **\[I\]** inferred assumption. **\[U\]** unknown, needs a decision or more evidence.

**Impl column (section C):** OK = the code appears to satisfy the expectation. D-n = discrepancy in section D. Q-n = open question in section E. Seam = observable only with DB seeding or fault injection. FE = checked against the frontend code. U = cannot be verified from the files provided. **Nothing was compiled or run: every Impl cell is a reading of the code.** Scenario ids use the prefix DY- (Orders S-, Client Trays T-, Vehicle Allocation V-, Purchase PU-).

---

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /dairy-trays/:paperId` | EMPLOYEE (ADMIN passes) | global 300/min | Live ledger grid: columns, rows per vehicle and session, per-session totals, token |
| `POST /dairy-trays/:paperId/save` | EMPLOYEE | 10/min | Save returned trays (only value an employee enters) |
| `POST /dairy-trays/:paperId/reconcile-inactive` | ADMIN | 5/min | Same body and rules as save, but only for inactive vehicles or tray types |
| `POST /dairy-trays/recalculate` | ADMIN | 5/min | Queue forward propagation for every paper in a sale-date range (max 31 days) |

**Indirect triggers and consumers (no Dairy Trays endpoint):**

- Every Purchase write that changes entries recalculates the paper's dairy ledger in the same transaction (DT-10.1). A return conflict rolls the Purchase write back (409).
- Paper generation and every zero-allocation sign-off ensure the header exists (PD-64, DT-3.3).
- Paper finalize queues a `DAIRY_TRAYS_FORWARD` outbox job (DT-10.4, PA-8.7). A FAILED row on the previous paper blocks the next finalize (PA-8.4).
- Paper morning submit and re-finalize of a REOPENED paper call the Dairy Trays gate (DT-12, PA-7.2 item 5). Night submit does not (DT-12.5).
- A return save on a REOPENED paper queues a forward job (DT-5.10).

### A2. What each paper status allows \[C: DT-2.1, 2.2\]

| Paper status | View grid | Save / reconcile returns | Purchase-driven recalculation |
| --- | --- | --- | --- |
| DRAFT | Yes | No (400) | No |
| NIGHT\_SUBMITTED | Yes | Yes | Yes (current paper only) |
| MORNING\_SUBMITTED | Yes | No (400) | No |
| FINALIZED | Yes | No (400) | No |
| REOPENED | Yes | Yes (plus forward check and cascade) | Yes (plus forward check) |

GET in every status is \[I\]: DT says only that the view is allowed; the code never checks status on read.

### A3. Lifecycles

**Ledger line (`dairy_tray_transaction`, key = paper + vehicle + session + tray type)**

1. **Calculated live** on every GET: opening from the latest earlier stored closing, taken from purchases, returned from the stored value (0 if none), closing = opening + taken - returned \[C: DT-3.6, 6.3, 6.4\].
2. **Stored** by a return save, a Purchase recalculation, a cascade or a range job. Stored only while opening is non-zero or taken is above 0, or a positive return is held \[C: DT-7.1, 7.2\].
3. **Updated** by a save (return changes), by a recalculation (opening, taken, closing change) or by a cascade (opening, closing only) \[C: DT-10.3\].
4. **Deleted** when it no longer qualifies (opening, taken and return all 0), never with a positive return \[C: DT-7.2, 7.3\].
5. **Stranded (legacy):** a stored positive return with no activity or above its balance. Stays visible, blocks every save with 409 until corrected \[C: DT-7.2, 10.9\].

**Header (`dairy_tray_paper`):** created by paper generation, sign-off, Purchase recalculation, and jobs; never by a read or a return save. Its `updated_at` is the token \[C: DT-3.3, 9.1\].

### A4. Side effects

- **Concurrency token:** `dairy_tray_paper.updated_at`. A return save that changes the stored ledger advances it once (an unchanged save leaves it); a recalculation or cascade advances it only when stored rows change \[C: DT-5.13, 9.6\].
- **Outbox:** `DAIRY_TRAYS_FORWARD` rows from reopened return saves, finalize and the range recalculation \[C: DT-10.8\].
- **No audit trail:** who changed which return is not recorded \[C: DT-14.1\].
- **Logging:** the range recalculation logs a count only \[O\].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | A stored or saved return never exceeds opening + taken of its line | DT-5.5, 6.5 |
| INV-2 | A save can never produce a negative closing | DT-5.5 |
| INV-3 | The only user-entered value is Returned; opening and taken are always server-derived | DT-5.4 |
| INV-4 | NIGHT and MORNING are independent ledgers; no flow between them | DT-6.2 |
| INV-5 | A stored return is never capped, reduced or deleted to make a change fit; the change is refused instead | DT-6.5, 7.2 |
| INV-6 | Taken = purchases summed per vehicle + session + tray type, rounded once half-up | DT-6.4 |
| INV-7 | Outstanding balances carry across gaps and are never dropped because of master data | DT-6.3, 7.4 |
| INV-8 | The token is mandatory on every return write; omitted is 400, null is 409 | DT-9.2 |
| INV-9 | Each write is all-or-nothing, including the token | DT-5.2, 9.5 |
| INV-10 | GET never writes and never creates the header | DT-3.3 |
| INV-11 | A cascade changes only opening and closing of later papers | DT-10.3, 11.5 |
| INV-12 | Finalized returns change only after an admin reopen; bulk rebuild only through the range recalculation | DT-11.4 |
| INV-13 | An untouched return is 0, never empty; it can be set to 0 but never cleared | DT-4.6 |

**Security constraints**

- SEC-1: JWT required on every endpoint; an inactive user gets 401 \[I, `JwtStrategy`\].
- SEC-2: role comes from the DB-backed user, never the body; reconcile and range recalculation are ADMIN-only \[C: DT-1.2\].
- SEC-3: unknown body fields are stripped on save and reconcile, rejected on the range recalculation \[C: DT-4.5; O for the latter\].
- SEC-4: ids are bounded 1 to 2147483647 \[C: DT-3.2, 4.2\].
- SEC-5: per-user throttles \[C: DT-1.3\].
- SEC-6: no per-paper or per-group authorization; DT is silent, siblings decided any employee, any paper \[C: DT-1.4\].
- SEC-7: unexpected errors are masked with a request id \[I, PA-11.5\].
- SEC-8: admin reconcile and range recalculation leave no record of the acting user \[C: DT-14.1; see D-10\].

---

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Access, throttling | DT-1.1 to 1.3 |
| Workflow matrix | DT-2.1 to 2.5 |
| Grid view | DT-3.1 to 3.7 |
| Input validation | DT-4.1 to 4.7 |
| Save | DT-5.1 to 5.13 |
| Ledger calculation | DT-6.1 to 6.6 |
| Row management | DT-7.1 to 7.5 |
| Visibility | DT-8.1 to 8.5 |
| Token | DT-9.1 to 9.6 |
| Recalculation, propagation | DT-10.1 to 10.9 |
| Administrative recalculation | DT-11.1 to 11.5 |
| Submission gate | DT-12.1 to 12.5 |
| HTTP statuses, data model | Section 13, DT-14.1 to 14.4 |
| Cross-module | PD-28, 33, 64, PA-7.2, 8.3, 8.4, 8.7, 4.10, 19.3 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | The three POST routes have no `@HttpCode`, so success is 201. Orders, Client Trays, Vehicle Allocation and Purchase answer 200. DT states no success status | `dairy-trays.controller.ts` |
| O-2 | The `ParseIdPipe`/DTO limit of 2000 fires before the service, so the service message `... exceeds the limit of 2000 per row` (DT-5.12) is not reachable through the API; the admin route uses the same DTO | `save-dairy-tray-entry.dto.ts`, `dairy-trays-validation.service.ts` |
| O-3 | `ROW_NOT_FOUND` is thrown at once on the first unknown cell, discarding balance problems already collected from earlier entries. The outcome depends on entry order | `validateReturnEntries` |
| O-4 | An identical re-save rewrites the whole ledger with an upsert and advances the token (DT-5.13). Orders, Vehicle Allocation and Purchase treat a no-op as unchanged | `saveDairyTrayEntries` |
| O-5 | The save token is parsed before the transaction, so a malformed token on a missing paper is 400, not 404 | `saveDairyTrayEntries` |
| O-6 | A transaction timeout (10 s) returns 409 `took too long and nothing was saved`; DT lists only serialization conflicts | `transaction-runner.ts` |
| O-7 | Token format, lost-response retry and per-paper scoping are not recorded for Dairy Trays (decided for the sibling modules) | DT file |
| O-8 | The not-found message is `Paper not found`; Purchase and Vehicle Allocation use `Order paper not found` | constants |
| O-9 | Vehicle order uses `localeCompare` on name-or-number (nameless vehicles sort by number), unlike VA-3.6 (nameless last) | `dairy-trays.builder.ts` |
| O-10 | Tray-rule specificity counts `packaging_type_id` even when `applies_to_packaging` is false (the field is then ignored for matching) | `resolveTrayRule` |
| O-11 | Opening balances are read with `distinct` over every earlier dairy row, newest first. Prisma applies `distinct` in memory \[I\], and there is no index on vehicle + session + tray type | `getOpeningBalances`, schema |
| O-12 | The forward dry run walks every later paper in memory inside the request transaction, on every REOPENED return save and REOPENED Purchase write | `assertNoForwardReturnConflicts` |
| O-13 | Each paper in a range recalculation is its own start paper, and each job cascades through every later paper, so work is quadratic in the range length | `requestRangeRecalculationService`, `propagateFromPaperChunk` |
| O-14 | A Purchase correction on a REOPENED paper checks later papers but queues no cascade; a return save on a REOPENED paper queues one. Stored later openings stay stale until the re-finalize (documented in DT-10.2) | service, propagation service |
| O-15 | If a stored return is above its balance on an inactive entity and is echoed back, the normal save still rejects it (balance check). The frontend only sends edited cells, so this is not reachable from the UI | `validateReturnEntries` |
| O-16 | Unused legacy code exists as DT-14.4 states (`getTrayTypes`, `getVehicles`, `getPreviousPaper`, `getPreviousTrayBalances`, `buildTakenMapFromPurchaseEntries`) | repository, calculator |
| O-17 | Frontend: an invalid typed value is replaced by the old value without a message (valueParser) | `DairyTraysGrid.tsx` |
| O-18 | Frontend: every 409 on save clears the draft, including the timeout 409 and the DT-6.5 return-discrepancy 409 | `DairyTraysPage.tsx` |
| O-19 | Frontend: `useDairyTrays` keeps the default refetch on focus and reconnect | `useDairyTrays.ts` |
| O-20 | Frontend: after a successful save the draft is cleared before the refetch finishes, so stale returned values show briefly. The new token is taken from the response (cache update) | `useSaveDairyTrays.ts` |

### B3. Inferred (assumptions)

- **I-1:** An inactive user token gets 401 (outside the DT file).
- **I-2:** A double click on Save gives one success and one 409 (follows from DT-9).
- **I-3:** A save concurrent with a Paper status change has exactly one winner (PA-11.1; status read inside the same serializable transaction).
- **I-4:** Save, reconcile and recalculate throttles are separate counters (per handler).
- **I-5:** Unexpected DB errors give a masked 500 with nothing saved.
- **I-6:** `canEditDairyTrays` is true only for NIGHT\_SUBMITTED and REOPENED, as DT-2.1 says (the service was not provided; PU-60 relies on it for Purchase).
- **I-7:** `extractErrorMessage` prints `details[]` (the Paper context comment says so); not verified here.
- **I-8:** The test harness mounts the Dairy Trays routes because `PurchaseModule` imports `DairyTraysModule`.

### B4. Unknowns

See section E.

---

## C. Behavioral Scenario Matrix

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-01 | No, garbage or expired JWT on any of the 4 endpoints | 401 | none | I-1 | OK |
| DY-02 | EMPLOYEE calls GET and save; EMPLOYEE calls reconcile and recalculate; ADMIN calls all | EMPLOYEE: 200 on GET and save, 403 on the two admin routes. ADMIN allowed everywhere | none | DT-1.1, 1.2 | OK |
| DY-03 | Deactivated user with an unexpired token | 401 | none | I-1 | OK |
| DY-04 | 11th save, 6th reconcile, 6th recalculate within 60 s by one user | 429; another user unaffected; GET uses the global limit | none | DT-1.3, I-4 | OK |
| DY-05 | `paperId` is `abc`, `0`, `-1`, `2147483648`, `007` on GET, save, reconcile | 400 `Invalid id`; `007` is read as 7 | none | DT-3.2 | OK |
| DY-06 | Paper does not exist: GET, save, reconcile | 404 `Paper not found`. An invalid body for a missing paper is 400 (shape first) | none | DT-3.2, 4.7 | OK (text aligned, DT-3.2) |
| DY-07 | Successful save, reconcile or recalculate | Success status. Expected 200 as in the sibling modules; decided 200 (Q-1), code now answers 200 | per scenario | Section 13 silent | OK (200 after Q-1) |
| DY-08 | Unknown field at top level or inside an entry on save or reconcile | Field is stripped; the request proceeds normally | none | DT-4.5 | OK |
| DY-09 | Unknown field on the range recalculation | 400 (not stripped) | none | DT-4.5 | OK (O) |
| DY-10 | `returned` is 12.5, -1, `"40"`, null, blank, omitted, 2001 | 400 each, nothing saved | none | DT-4.1 | OK (O-2 for 2001) |
| DY-11 | `returned` 0, 1, 2000 | Accepted by shape | per scenario | DT-4.1 | OK |
| DY-12 | `vehicleId` or `trayTypeId` 0, 1.5, 2147483648; `deliverySession` FOO or `night` | 400 | none | DT-4.2 | OK |
| DY-13 | `entries` missing, `[]`, 5001 items; 1 and 5000 items | 400 for the first three; the last two accepted by shape | none | DT-4.3 | OK |
| DY-14 | Same vehicle + session + tray type twice; same vehicle + tray type in NIGHT and MORNING | 400 `Duplicate entry for vehicle X, tray type Y, SESSION...` (first duplicate only); the second case is valid | none | DT-4.4 | OK |
| DY-15 | `expectedUpdatedAt` omitted; `null`; `abc`; well-formed but different (date-only) | 400; 409 stale; 400 `Invalid expectedUpdatedAt`; 409 | none | DT-9.2 | OK (recorded, DT-9.7) |
| DY-16 | Range recalculation: bad shape; impossible date (2026-02-31); from after to; 32 days; 31 days; same day | 400 (DTO text), 400 invalid range, 400 order, 400 too long; 31 and 1 day accepted | none | DT-11.2 | OK |

### C2. Grid view

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-20 | Header exists, no ledger lines | 200: `columns`, `rows` empty, `sessionTotals` for both sessions with `totalVehicles` 0, `dairyTraysUpdatedAt` a timestamp | none | DT-3.1 | OK |
| DY-21 | Paper has no header | 200, token `null`, ledger still calculated live, header NOT created | none | DT-3.3 | OK |
| DY-22 | Any GET, repeated | No write, no token change, identical answers | none | DT-3.3 | OK |
| DY-23 | Columns | Pinned Vehicle column, one group per brand (`X Tray`), one per colour (`Blue Tray`), four sub-columns (Opening, Trays, Returned, Closing) with fields `tray_<id>_opening`, `tray_<id>`, `tray_<id>_returned`, `tray_<id>_closing`. Only Returned is editable, only for an active tray type. Ordered by brand name then colour | none | DT-3.4 | OK |
| DY-24 | Inactive tray type with no ledger line; with a ledger line | No column; column present, Returned `editable: false` | none | DT-3.4, 8.3 | OK |
| DY-25 | Rows | One per vehicle + session that has a ledger line; sorted by vehicle name then NIGHT before MORNING; `vehicleName` falls back to the vehicle number, never null | none | DT-3.5 | OK (aligned with VA-3.6; collation Seam) |
| DY-26 | Vehicle with only a carried opening, no purchase | Row shown with opening and closing; nothing stored yet | none | DT-3.5, 8.1, 12.3 | OK |
| DY-27 | Vehicle with no balance and no purchase in a session | Not shown for that session | none | DT-8.1 | OK |
| DY-28 | Inactive vehicle with a balance | Row shown with `readOnly: true` | none | DT-8.2 | OK |
| DY-29 | Values | Opening = latest earlier stored closing; Trays from purchases; Returned stored (0 if none); Closing = opening + taken - returned. Calculated live, not read back from stored opening, taken or closing | none | DT-3.6 | OK |
| DY-30 | Stored positive return on a line with no activity (legacy) | Row stays visible | none | DT-7.2 | OK (Seam) |
| DY-31 | Totals | `sessionTotals.NIGHT` and `.MORNING` with distinct vehicle count and per tray type opening, trays, returned, closing. No combined `totals` | none | DT-3.7 | OK |
| DY-32 | `workflow.editable` per status | true only in NIGHT\_SUBMITTED and REOPENED | none | DT-2.1, 2.3 | OK (workflow files read) |
| DY-33 | GET in each of the 5 statuses | 200 | none | DT-2.1 | OK (I) |
| DY-34 | Purchases of 0.4, 0.4, 0.4 crates for one vehicle, session, tray type; one purchase of 10.5 | Trays 1; Trays 11 (half-up); one order unit is one tray | none | DT-6.4 | OK |

### C3. Save: order of checks, token, atomicity

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-40 | Paper DRAFT, MORNING\_SUBMITTED or FINALIZED, even with a stale token | 400 `Dairy tray tracking cannot be edited in the current workflow state` | none | DT-2.2, 5.3 | OK |
| DY-41 | Editable status, no header, any token including null | 400 `Dairy tray tracking has not been generated for this paper` (before the token check) | none | DT-5.3 | OK (D-8) |
| DY-42 | Header exists; token null or stale; same request also has an invalid entry | 409 stale (token is checked before entries) | none | DT-5.3, 9.2, 9.3 | OK |
| DY-43 | Valid save with the current token | Success `{ success, message 'Dairy tray returns saved successfully', dairyTraysUpdatedAt }`; the new token equals the stored one and is later than the old one | ledger written, token advanced once | DT-5.9, 9.4 | OK (200) |
| DY-44 | Same values as stored, current token | 200, changed false, current token returned, nothing written | token moves | DT-5.13 | OK (amended, see DY-150) |
| DY-45 | Second save using the token from the first response, no reload | Success | token moves again | DT-9.4 | OK |
| DY-46 | Ledger lines not in the request | Keep their stored returns | unchanged | DT-4.6 | OK |
| DY-47 | Return set to 0 on an existing line | Stored as 0 (never null); a return can never be cleared to blank | row updated | DT-4.6 | OK |
| DY-48 | One bad entry among many | Whole request fails; ledger and token unchanged | rollback | DT-5.2, 9.5 | OK |
| DY-49 | Entry for a vehicle + session with no row, or a tray type that is not a column | 400 `Dairy tray row not found for vehicle X (SESSION)` | none | DT-5.6 | OK (collected, DT-5.6) |
| DY-50 | Cell inside an existing row and visible column with no ledger line: returned 0; returned above 0 | 200 and nothing stored; 400 balance error (available 0) | none | DT-5.6 | OK |
| DY-51 | Two users save with the same token concurrently | One succeeds; the other 409 (stale, or conflict message after 3 attempts) | one write | DT-5.2, 9.3 | OK |
| DY-52 | Double click on Save | First succeeds, second 409 | one write | I-2 | OK |

### C4. Save: balance, limit, inactive entities

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-60 | `returned` within opening + taken | Accepted; closing = opening + taken - returned | line written | DT-5.5 | OK |
| DY-61 | `returned` above opening + taken, one or several entries | 400 `One or more returns were rejected`; `details[]` lists every offending vehicle name, session, tray label, returned and balance together | none | DT-5.5 | OK |
| DY-62 | Vehicle returns more than today's purchase but within carried opening + taken | Accepted | line written | DT-5.5 | OK |
| DY-63 | Row total at the limit (2000); above it (2001) | 2000 accepted if the balance covers it; 2001 is 400 (class-validator text; the DT message is not reachable) | none | DT-5.12 | OK (only the 400 is binding, DT-5.12) |
| DY-64 | Save 1500, then save 1500 again | The second save sets the row total to 1500, it does not add (3000) | line updated | DT-5.12 | OK |
| DY-65 | Normal save, inactive vehicle or tray type, returned equals the stored value; returned differs | Accepted unchanged; 400 `Vehicle X (SESSION): <tray> is inactive ... and read-only` | none | DT-5.7 | OK |
| DY-66 | Return in NIGHT for a vehicle and tray type that also has a MORNING line | MORNING opening, taken, closing unchanged | none | DT-6.2 | OK |
| DY-67 | Another stored return in the paper (not in the request) is already above its balance (legacy) | Any save is 409 `This change would leave returned trays higher...` with details, until all offenders are corrected in the same request | none | DT-6.5, 10.9 | OK (Seam) |
| DY-68 | A save makes a line qualify no more (opening 0, taken 0, return 0) | Row is deleted; a row holding a positive return is never deleted | row removed | DT-7.1 to 7.3 | OK |
| DY-69 | Save lowers a return on a line | Closing rises accordingly; later papers are not touched (NIGHT\_SUBMITTED) | line updated | DT-5.8, 5.10 | OK |

### C5. Ledger calculation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-70 | Opening for a key | Latest EARLIER stored closing even across a gap; only non-zero closings carry; latest closing 0 or none gives 0 | none | DT-6.3 | OK (Seam: needs earlier papers) |
| DY-71 | Earlier paper is DRAFT or NIGHT\_SUBMITTED, not finalized | Its stored closing still counts (status-agnostic) | none | DT-6.3, P-2 | OK (O) |
| DY-72 | NIGHT closing and MORNING of the same day | No flow between them; each session reads only its own earlier ledger | none | DT-6.2 | OK |
| DY-73 | Purchase entry with no tray type and no matching active rule | No trays, no ledger line | none | DT-6.4 | OK |
| DY-74 | Purchase entry has a frozen tray type; the tray rules change afterwards | The frozen type is used | none | DT-6.6, 14.3 | OK |
| DY-75 | No frozen type; several rules match | Most specific wins (most filled-in fields); lowest rule id on a tie; inactive rules ignored | none | DT-6.6 | OK (shared resolver unchanged, DT-6.6) |
| DY-76 | A purchase of 0 and opening 0 | Calculation key with 0 trays, no stored row | none | DT-7.5, PD-28 | OK |
| DY-77 | Backfilled earlier paper | Its own grid is correct (live opening); later papers' stored openings stay stale until finalize or a cascade | none | PA-4.10, DT-10.6 | OK |
| DY-78 | Legacy negative stored closing | Carries as a non-zero opening; row visible | none | DT-6.3 | OK (O, Seam) |

### C6. Purchase-driven recalculation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-80 | Purchase save that changes entries, NIGHT\_SUBMITTED | Ledger recalculated in the same transaction: opening from earlier papers, taken from purchases, returns kept exactly as stored; header created if missing; token advances only if stored rows changed | ledger rows, maybe token | DT-10.1, 9.6, 3.3 | OK |
| DY-81 | Purchase no-op save; admin rate recalculation | No dairy recalculation; token unchanged | none | DT-10.1 | OK |
| DY-82 | Purchase save lowers quantity below a stored return | 409 with `details[]` (sale date, vehicle, session, tray, returned, outstanding); the Purchase write is rolled back too | none | DT-6.5, 10.1 | OK |
| DY-83 | Purchase deletion by id, purgeAll, admin reevaluateTrays | Same recalculation and same 409 guard; the whole Purchase operation is rolled back on conflict | per scenario | DT-10.1 | OK |
| DY-84 | REOPENED paper: Purchase correction | Forward dry run over later papers; conflict gives 409; no cascade queued | none | DT-10.2 | OK (O-14) |
| DY-85 | NIGHT\_SUBMITTED paper: Purchase correction | Current paper only; later papers pick it up at finalize or the range recalculation | none | DT-10.2 | OK |
| DY-86 | Purchase changes Taken while a user has the Dairy screen open | Dairy token advanced; the user's next save is 409 stale | token moves | DT-9.6 | OK |
| DY-87 | Recalculation outside NIGHT\_SUBMITTED and REOPENED | 400. Not reachable through Purchase, whose editable statuses are identical | none | DT-2.4, PD-52 | Seam |

### C7. Reopened save, cascade, propagation

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-90 | Return save on a REOPENED paper | After writing, every later paper is checked in memory; if any would hold returns above its balance, whole save is 409. Otherwise success and a `DAIRY_TRAYS_FORWARD` outbox row for this paper in the same transaction | ledger, outbox row | DT-5.10, 10.2 | OK |
| DY-91 | Return save on a NIGHT\_SUBMITTED paper | No forward check, no outbox row | none | DT-5.10 | OK |
| DY-92 | A cascade reaches a later paper | Only opening and closing refreshed; taken and returned kept; a carried non-zero balance without a row gets a carry-forward row (returned 0) across gaps; later FINALIZED papers are updated without reopening | later rows | DT-10.3, 11.5 | OK (service read; U for the job runner) |
| DY-93 | Cascade unchanged for a later paper | Not rewritten; token not moved | none | DT-9.6 | OK |
| DY-94 | Cascade meets a return above its balance | Job fails (409), shown as FAILED with the full list in `last_error`; not retried; admin retries after the fix | outbox FAILED | DT-6.5, 10.5 | OK (processor read; details capped, DT-10.5) |
| DY-95 | Transient failures (serialization, connection, timeout) | Retried up to 5 times with backoff; PROCESSING stuck 2 minutes is re-queued; duplicates merged only while PENDING | outbox | DT-10.5 | U |
| DY-96 | Chunking | 20 papers per chunk; the job resumes from the next paper | outbox | DT-10.5 | OK (service and processor read) |
| DY-97 | Finalize | Queues the forward job; previous paper FAILED blocks the next finalize | outbox | DT-10.4, PA-8.4 | OK (orchestrator read) |
| DY-98 | A job is pending for a later paper | GET still self-consistent because opening is live | none | DT-10.6 | OK |

### C8. Administrative actions

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-100 | ADMIN reconciles an entry for an inactive vehicle or tray type | Accepted under every rule of the normal save (status, token, balance, limit, forward check and cascade on REOPENED); same response | ledger, token | DT-5.11 | OK |
| DY-101 | Reconcile entry where vehicle and tray type are both active | 400 `... is active. Use the normal save instead of reconciliation`; all such problems listed together | none | DT-5.11 | OK |
| DY-102 | Normal save, inactive entity, changed value | 400 read-only message (reconcile route is the way) | none | DT-5.7 | OK |
| DY-103 | Reconcile changes a return | No reason is asked and no user is logged | none | DT-14.1 | OK (no audit, decided, DT-14.1) |
| DY-104 | Range recalculation, valid range with papers | Returns at once `{ papersQueued, fromDate, toDate, operations[{ paperId, operationId }] }`; one `DAIRY_TRAYS_FORWARD` row per paper | outbox rows | DT-11.1 | OK (200; merged id confirmed) |
| DY-105 | Range with no papers | `papersQueued: 0`, `operations: []` | none | DT-11.2 | OK |
| DY-106 | Job runs for a paper without a header | Header is created; openings rebuilt across gaps; carry-forward rows created; FINALIZED papers recalculated without reopening | rows | DT-3.3, 10.9, 11.3 | OK (service) / U |
| DY-107 | Range of 31 papers | Each paper is a start paper and each job cascades through all later papers | outbox, rows | DT-11.3 | D-9 |

### C9. Submission gate (called by Paper)

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-110 | Morning submit with header, every taken-above-0 line stored, no return above balance, no negative closing | Gate passes | none | DT-12.1 | OK |
| DY-111 | All returns 0 | Passes (no return-completeness rule) | none | DT-12.2 | OK |
| DY-112 | Carry-forward line not yet stored | Passes (live until stored) | none | DT-12.3 | OK |
| DY-113 | Header missing; line with taken above 0 and no stored row; stored return above balance; negative closing | One 400 `Dairy trays are not ready for submission` with all problems in `details[]` | none | DT-12.1 | OK (missing-row and negative closing: Seam) |
| DY-114 | Background job still pending | Gate uses live values and does not wait | none | DT-12.4 | OK |
| DY-115 | Night submit; finalize of MORNING\_SUBMITTED; re-finalize of REOPENED | No gate; no gate; gate runs | none | DT-12.5, PA-8.3 | OK |
| DY-116 | Paper readiness | Lists the same dairy problems | none | PA-19.3 | OK (Paper-owned) |
| DY-117 | Paper generation; zero-allocation sign-off (including repeat) | Header exists afterwards | header | PD-64, DT-3.3 | OK |

### C10. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| DY-120 | Serialization conflicts exhaust 3 attempts | 409 `Your request conflicted with another update...` | rollback | DT-5.2 | OK (Seam) |
| DY-121 | Transaction exceeds 10 s | 409 `took too long and nothing was saved` | rollback | O-6 | OK (recorded, DT-9.7) |
| DY-122 | Response lost; retry with the old token | 409 although data was saved; the same payload with the new token succeeds and advances the token again | token moves | O-4, I | Q-2 |
| DY-123 | Unexpected exception after writes | Masked 500 with `requestId`; rows and token rolled back | rollback | I-5 | Seam |
| DY-124 | Dairy save races a Paper status change (revert, morning submit) | One winner; the loser gets the 400 status error | serializable | I-3 | OK |
| DY-125 | Dairy save races a Purchase save | One succeeds; the other gets 409 (stale or retry exhausted) | one write | DT-9, PD-19 | OK |
| DY-126 | Purchase retry after a serialization failure | Recalculation rebuilds from current state; no duplicate effects | none | PD-19 | OK |
| DY-127 | Opening balance read and forward dry run on a long history | Must finish inside 10 s | none | O-11, O-12 | Open, operational (DT-10.10) |

### C11. Frontend (checked against the code)

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| DY-130 | No paper selected; loading; load error | Messages shown; error text from `extractErrorMessage` | n/a | FE: OK |
| DY-131 | Grid layout | One section per session (NIGHT, MORNING), each with its own totals row pinned at the bottom; empty session shows a message; extra pinned Session column | DT-3.7 | FE: OK |
| DY-132 | Which cells are editable | Only Returned, not the totals row, only when the paper is editable, active tray type and active vehicle; in reconcile mode only inactive vehicle or tray type | DT-8.5, 5.11 | FE: OK |
| DY-133 | Typing a value | Blank becomes 0; integer 0 to 2000 accepted; anything else silently keeps the old value | DT-4.1, 4.6 | FE: OK (toast added, DT-14.5) |
| DY-134 | First edit | Draft captures the token; draft holds one entry per cell edited; Save sends only edited cells; none gives an info toast | DT-9.2 | FE: OK |
| DY-135 | More than 5000 edited cells | Error toast, nothing sent | DT-4.3 | FE: OK |
| DY-136 | Save succeeds | Cache token set from the response, draft cleared, query refetched, success toast; old returned values show until the refetch ends | DT-9.4 | FE: OK (revised, DT-14.5) |
| DY-137 | Save fails with 400 | Edits kept; toast with the message and details | DT-5.5 | FE: OK (I-7) |
| DY-138 | Save fails with any 409 | Draft discarded, query refetched, toast | DT-9.3 | FE: OK (revised, DT-14.5) |
| DY-139 | Window regains focus or network reconnects with unsaved edits | Query refetches; draft keeps its token; a later save is 409 if data changed | DT-9 | FE: OK (no refetch, DT-14.5) |
| DY-140 | Admin panel | Shown only to ADMIN (a hint, backend enforces); reconcile toggle resets the draft and refetches; disabled when not editable; range form needs both dates | DT-1.2, 5.11, 11.1 | FE: OK |
| DY-141 | Range recalculation succeeds | Toast with the paper count; list of paper and operation ids | DT-11.1 | FE: OK |
| DY-142 | Rows exist but no header (legacy) | Cells editable, save returns 400 header missing | DT-3.3, 5.3 | FE: OK (editing hidden, DT-14.5) |
| DY-143 | Paper selection changes | Page remounts and unsaved edits are dropped | n/a | FE: OK |

---

## D. Implementation-versus-Spec Discrepancy Report

The baseline is the DT decision file plus its sibling decisions. Severity is the reviewer's reading, not a business ruling.

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Spec silent, code differs from siblings | Save, reconcile and range recalculation answer 201 (no `@HttpCode`). Orders, Client Trays, Vehicle Allocation and Purchase answer 200. DT section 13 states no success status (O-1) | Low |
| D-2 | Differs from siblings (documented in DT) | DT-5.13: an identical re-save rewrites the ledger and advances the token. Siblings treat a no-op as unchanged. A lost-response retry with the new token therefore moves the token and makes any other open screen stale (O-4) | Low |
| D-3 | Spec gap | Not recorded for Dairy Trays: token format, lost-response retry, timeout 409, per-paper scoping (O-6, O-7). Siblings recorded them (OD-12.9, OD-12.10, VA-9.7, PD-72) | Low to Medium |
| D-4 | Spec gap, UI | The page clears the draft on every 409, including the timeout 409 (nothing changed, edits could be kept) and the DT-6.5 return-discrepancy 409 (the user must correct returns, yet loses what was typed). Orders, Client Trays and Vehicle Allocation keep edits on the timeout 409 (O-18) | Low to Medium |
| D-5 | Spec gap, UI | The query refetches on focus and reconnect. The draft keeps its own token, so the screen behind it can show newer data and the save then fails with 409. Siblings switched this off (O-19) | Low |
| D-6 | Code inconsistency | An unknown cell aborts validation at once and drops balance problems already collected, so the reported problems depend on entry order, unlike the all-at-once rule for balance problems (O-3) | Low |
| D-7 | Doc differs from observable behavior | DT-5.12 promises the message `... exceeds the limit of 2000 per row` and says the service check covers the admin route. The DTO rejects 2001 first on both routes, so only the validator text is observable (O-2). Orders resolved the same point by making only the 400 binding | Low |
| D-8 | Spec gap | A paper that has ledger lines but no header (legacy or never generated) shows editable cells, and every save answers 400 `has not been generated`. DT-3.3 forbids a save from creating the header; no screen action offers a remedy | Low |
| D-9 | Non-functional risk | (a) Opening balances read all earlier rows with an in-memory `distinct` \[I\] and no covering index; (b) each REOPENED return save or Purchase write walks every later paper inside a 10 s serializable transaction; (c) a 31-day range queues 31 jobs and each cascades to every later paper. None is measured. Compare PD-75, VA-13.2 | **Medium (unverified)** |
| D-10 | Spec gap | Admin reconcile changes returns with no reason and no record of the user, and the range recalculation logs only a count. DT-14.1 says no audit; Purchase logs `userId` and a reason for comparable admin overrides (PD-25) | Low to Medium |
| D-11 | Unverifiable | `operationId` in the range response is the outbox row id. When a PENDING row is merged (DT-10.5) the returned id may belong to an earlier request. The outbox repository, relay and processor were not provided | Info |
| D-12 | Spec gap | Tray-rule specificity counts the packaging type even when the rule does not apply to packaging (O-10). DT-6.6 says most filled-in fields wins, which this satisfies literally | Info |
| D-13 | Spec gap, UI | A typed value that is not an integer from 0 to 2000 is silently replaced by the old value, with no message (O-17). Purchase shows a toast in the same case | Low |
| D-14 | UI | After a successful save the draft is cleared before the refetch ends, so old returned values flash (O-20) | Low |
| D-15 | Info | Not-found text and vehicle ordering differ from sibling modules (O-8, O-9). The ordering depends on the JavaScript locale of the server | Info |
| D-16 | Business note | The 2000 cap is per row and per paper. A line with an outstanding balance above 2000 cannot be cleared in one paper (DT-5.12, approved O-10 in the DT file) | Info |
| D-17 | Dead code | Unused methods listed in DT-14.4 are still present (O-16) | Info |
| D-18 | Unverifiable | Finalize trigger, retry and merge rules, `last_error` content, relay behavior and the workflow flags could not be read (DY-32, DY-94 to DY-97) | Info |

**Scenarios the current implementation appears unable to satisfy, or that cannot be asserted**

- **DY-07 (and the 201 on DY-43, DY-104):** expected 200 by sibling convention; code answers 201 (D-1).
- **DY-63:** the DT-5.12 message cannot be observed through the API (D-7).
- **DY-103:** no reason or user record for reconcile (D-10).
- **DY-138, DY-139, DY-142:** UI behavior is not specified and is weaker than the siblings (D-4, D-5, D-8).
- **DY-94 to DY-97:** need the processor, orchestrator and outbox repository, or a real queue (D-18).
- **DY-30, DY-67, DY-78, DY-113 (missing row, negative closing), DY-87, DY-120, DY-123:** need DB seeding, legacy data or fault injection.
- **DY-127:** operational, not assertable deterministically (D-9).

---

## E. Open Questions (all resolved, see section F)

Each question lists the owner and the evidence. `(current)` marks what the code does today. No answer is recommended.

**Q-1 (Eng, D-1). Success status of save, reconcile and range recalculation.**

- A. 201 (current).
- B. 200, as the sibling modules.
- C. Any 2xx; not binding.

**Q-2 (Eng + Product, D-3). Record for Dairy Trays the rules decided for the siblings?**

- A. Record: any parseable ISO-8601 token with mismatch 409; lost-response retry gives 409; timeout is 409; any employee may edit any paper.
- B. Decide each item separately.
- C. Other.

**Q-3 (Eng, D-4, D-5). Frontend reload rules and refetch policy.**

- A. Clear edits and reload on every 409; refetch on focus and reconnect (current).
- B. As the siblings: keep edits on the timeout 409, clear and reload on the other stale or conflict 409s; no refetch on focus or reconnect.
- C. Also keep edits on the DT-6.5 return-discrepancy 409 so the user can correct them.
- D. Other.

**Q-4 (Product, D-10). Audit of admin overrides.**

- A. None, as DT-14.1 (current).
- B. Log user id and an optional reason for reconcile and the range recalculation, as PD-25.
- C. A mandatory reason for reconcile.
- D. Other.

**Q-5 (Eng, D-7). The 2000 limit message.**

- A. Only the 400 status is binding (as OD-5.3).
- B. The DT-5.12 message must be what the user sees (needs the DTO maximum raised or removed).
- C. Other.

**Q-6 (Product, D-8). Save when a paper has rows but no header.**

- A. 400, as now (current).
- B. Let the save create the header (conflicts with DT-3.3).
- C. Hide editing and show a message until an admin recalculation creates it.
- D. Other.

**Q-7 (Product, D-2). An identical re-save advances the token (DT-5.13).**

- A. Keep (current).
- B. A no-op save leaves the token unchanged, as Orders, Vehicle Allocation and Purchase.

**Q-8 (Eng, D-6). Several kinds of problem in one request.**

- A. An unknown cell aborts at once (current).
- B. Collect it together with the balance and inactive problems.

**Q-9 (Eng, D-9). Scale.**

- A. Keep; measure on the largest real history first (as PD-75).
- B. Index and bound the opening-balance read.
- C. Avoid the quadratic cascade for a range.
- D. Other.

**Q-10 (Product, D-16). Outstanding balance above 2000 per row.**

- A. Keep the cap (current).
- B. Cap the single save, not the row total.
- C. Other.

**Q-11 (Product, D-12). Tray-rule specificity when the rule ignores packaging.**

- A. Count every filled field (current).
- B. Count the packaging type only when the rule applies to packaging.
- C. Other.

**Q-12 (Eng, D-15). Consistency with siblings.**

- A. Leave the not-found text and vehicle ordering (current).
- B. Align both with the sibling modules.

**Q-13 (Eng, D-13, D-14). Frontend messages.**

- A. Silent rejection of an invalid typed value and the brief stale display (current).
- B. Toast the rejected value and keep the old rows until the refetch ends.

**Q-14 (Eng, D-18). Evidence needed to close the unverified rows.** Provide `WorkflowStateService`, `WorkflowBuilder`, `DependencyOrchestratorService`, `PropagationOutboxRepository`, the relay and the processor, the shared `extractErrorMessage`, and the `QueryClient` defaults. Then DY-32, DY-94 to DY-97 and D-11 can be settled.

---

No automated tests were written, as requested. Nothing was compiled or run; every Impl cell is a reading of the code.

---

## F. Revision After Decisions (Q-1 to Q-14)

The business owner answered all fourteen questions; where the answer was delegated ("do what is logically best"), the reviewer made the choice below and recorded it in `DAIRY_TRAYS_BUSINESS_DECISION.md`. **Sections A to E show the state before the decisions; this section supersedes them where they differ.** Code changes are written and format-checked (Prettier) but **not compiled or run**.

### F1. Corrections to the evidence statement

Section B listed several files as not provided. They were in the project: `WorkflowStateService`, `WorkflowBuilder`, `DependencyOrchestratorService`, the dependency register, `PropagationOutboxRepository`, the relay, the queue service and the queue processor. Read now, they settle most of the "U" rows:

- **DY-32 (workflow flags): OK.** `canEditDairyTrays` is true only for NIGHT\_SUBMITTED and REOPENED; the builder returns `{ status, editable }`.
- **DY-97 (finalize): OK.** `PAPER_TO_DAIRY_TRAYS_PROPAGATION` enqueues `DAIRY_TRAYS_FORWARD` for the paper.
- **DY-94 and DY-95: OK with one difference.** HTTP errors raised by a job become `UnrecoverableError` (no retry); other errors use BullMQ attempts 5 with exponential backoff (2 s); the relay re-queues PROCESSING rows stuck for 2 minutes and dispatches a row at most 5 times. The processor writes at most 25 details and the stored `last_error` is cut at 2,000 characters, so "the full list" in DT-6.5 and DT-10.5 was not accurate. The decision file now states the cap (new discrepancy D-19, resolved by documentation).
- **D-11 confirmed:** a request merged into an existing PENDING row is answered with that row's id.
- Still not seen: the shared `extractErrorMessage` and the `QueryClient` defaults (I-7 stays an inference).

### F2. Decision log

| Q | Decision | Change |
| --- | --- | --- |
| Q-1 | 200 as the sibling modules | Code: `@HttpCode(200)` on save, reconcile and recalculate. Doc: DT-5.9, Section 13 |
| Q-2 | Record the sibling rules for Dairy Trays | Doc: new DT-1.4 (no scoping), new DT-9.7 (token format, lost response, timeout 409) |
| Q-3 | Keep edits on the timeout and return-discrepancy 409; reload on a stale or exhausted-retry 409; no refetch on focus or reconnect | Code (frontend): `keepsEditsOn409`, page, hook, query options. Doc: new DT-14.5 |
| Q-4 | No audits | Doc: DT-14.1 states reconcile and range recalculation are not audited |
| Q-5 | Only the 400 status is binding for an over-limit value (as OD-5.3) | Doc: DT-5.12. No code change |
| Q-6 | Save stays refused when no header exists; the UI does not offer editing and explains why | Code (frontend). Doc: DT-3.3, DT-14.5 |
| Q-7 | A no-op save leaves the token unchanged | Code: service compares the ledger first. Doc: DT-5.13, DT-5.9, DT-9.6 |
| Q-8 | An unknown cell is collected with the other problems | Code: validation service. Doc: DT-5.6 |
| Q-9 | Keep; measure on the largest real history before go-live | Doc: new DT-10.10. No code change (an index needs a migration; one job per range would change DT-11.3) |
| Q-10 | Keep the 2,000 cap | Doc: DT-5.12 |
| Q-11 | Leave tray-rule specificity unchanged. The resolver is shared with Orders, Client Trays and Purchase and also decides frozen assignments, so changing it needs a decision covering all of them | Doc: DT-6.6. No code change |
| Q-12 | Align with the siblings | Code: `Order paper not found`; vehicle order name, nameless last, id. Doc: DT-3.2, DT-3.5 |
| Q-13 | Message for a rejected typed value; saved values stay until the refetch ends | Code (frontend). Doc: DT-14.5 |
| Q-14 | Files provided | See F1 |

### F3. Discrepancy status

| ID | Status |
| --- | --- |
| D-1 | Resolved (code, 200) |
| D-2 | Resolved (code, DT-5.13 amended) |
| D-3 | Resolved (documented, DT-1.4, DT-9.7) |
| D-4 | Resolved (frontend) |
| D-5 | Resolved (frontend, no refetch on focus or reconnect) |
| D-6 | Resolved (code, collected) |
| D-7 | Resolved (documented, only the 400 is binding) |
| D-8 | Resolved in the UI; the backend still answers 400 by design |
| D-9 | Open, operational (DT-10.10: measure before go-live) |
| D-10 | Accepted (no audits, recorded in DT-14.1) |
| D-11 | Confirmed and documented (DT-11.1) |
| D-12 | Accepted (shared resolver unchanged, DT-6.6) |
| D-13 | Resolved (frontend message) |
| D-14 | Resolved (frontend) |
| D-15 | Resolved (aligned with siblings) |
| D-16 | Accepted (cap kept) |
| D-17 | Unchanged (legacy code kept until the audit, DT-14.4) |
| D-18 | Closed by F1 (the files were available) |
| D-19 | New, resolved by documentation: `last_error` is capped at 25 details and 2,000 characters |

### F4. Scenarios whose expected result changed

| ID | New expected result |
| --- | --- |
| DY-06 | 404 text is `Order paper not found` |
| DY-07, DY-43, DY-104 | HTTP 200 |
| DY-25 | Rows sorted by vehicle name, nameless vehicles last, then id; NIGHT before MORNING |
| DY-44 | Same values as stored: 200, `changed: false`, the current token, nothing written |
| DY-45 | A second save with the token from the first response succeeds; it moves the token only if it changes something |
| DY-49 | 400 `One or more returns were rejected` with `Dairy tray row not found for vehicle X (SESSION)` inside `details[]`, together with any other problem |
| DY-63 | 2001 is a 400; only the status is binding |
| DY-103 | No audit is accepted |
| DY-121, DY-122 | Recorded as binding (DT-9.7); a retry with the new token is a no-op and leaves the token unchanged |
| DY-32 | OK |
| DY-94 to DY-97 | Verified against the processor, relay and orchestrator; `last_error` is capped |
| DY-133 | A rejected typed value shows an error toast and keeps the old value |
| DY-136 | Saved values stay on screen and editing is disabled until the refetch ends; a `changed: false` response shows an info toast |
| DY-138 | Draft is discarded and reloaded only for a stale or exhausted-retry 409 |
| DY-139 | No refetch on focus or reconnect |
| DY-142 | With no header the grid is not editable and a message explains why |

### F5. New scenarios

| ID | Given / When | Then | Evidence | Impl |
| --- | --- | --- | --- | --- |
| DY-150 | REOPENED paper, save with the same returns as stored | 200, `changed: false`, current token, no write, no forward check, no outbox row | DT-5.13 | Implemented, not yet run |
| DY-151 | Stale token with a payload that would change nothing | 409 | DT-5.13 | Implemented, not yet run |
| DY-152 | Save that changes one return | `changed: true`, token moves once | DT-5.13 | Implemented, not yet run |
| DY-153 | Same returns, but stored opening or taken is out of date | `changed: true`, the stored ledger is refreshed | DT-5.13 | Implemented, not yet run |
| DY-154 | One unknown cell and one return above the balance in one request | One 400 with both messages in `details[]` | DT-5.6 | Implemented, not yet run |
| DY-155 | A vehicle without a name and two named vehicles | Named vehicles first by name, the nameless one last | DT-3.5 | Implemented, not yet run |
| DY-156 | Save fails with the timeout 409 | Edits kept, no reload | DT-14.5 | FE, not yet run |
| DY-157 | Save fails with the return-discrepancy 409 | Edits kept, no reload, details shown | DT-14.5 | FE, not yet run |
| DY-158 | Save fails with the stale-token 409 | Draft discarded, grid reloaded | DT-14.5 | FE, not yet run |
| DY-159 | Save succeeds, refetch pending | Saved values still shown, editing and Save disabled until the refetch ends | DT-14.5 | FE, not yet run |
| DY-160 | Save returns `changed: false` | Info toast `No changes saved` | DT-5.9 | FE, not yet run |

### F6. Files changed

Backend: `dairy-trays.controller.ts`, `dairy-trays.service.ts`, `dairy-trays-validation.service.ts`, `dairy-trays.builder.ts`, `dairy-trays.constants.ts`. Frontend: `dairy-trays.api.ts`, `dairy-trays.types.ts`, `DairyTraysPage.tsx`, `DairyTraysGrid.tsx`, `useDairyTrays.ts`, `useSaveDairyTrays.ts`. Docs: `DAIRY_TRAYS_BUSINESS_DECISION.md` and this document. Paper, Purchase, Orders, Vehicle Allocation, the workflow files and the propagation files are untouched.

Existing tests or clients that must be updated (none were provided for Dairy Trays): anything asserting 201 on these POSTs, the text `Paper not found`, a top-level `Dairy tray row not found` message, a token advance on an identical save, or the old vehicle order.

### F7. Notes

- **Not compiled or run.** Type-check the frontend files in the repository first. The riskiest spots are `hasLedgerChanged(ledger.stored, lines)` in the service (its stored-row type), the `keepsEditsOn409` import in the page and hook, and the `finally` handling after `invalidateQueries` in the page.
- The vehicle order uses JavaScript `localeCompare`, not the database collation used by Vehicle Allocation, so equal-looking names can sort differently from that module.
- Q-9 and D-9 stay open until the measurement is done.
