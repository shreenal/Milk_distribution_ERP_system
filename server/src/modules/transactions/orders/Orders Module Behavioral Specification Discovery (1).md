# Orders Module: Behavioral Specification Discovery

QA behavioral specification discovery for the Orders module. No automated tests are included.

## Evidence and Labels

`ORDERS_BUSINESS_DECISION.md` is the requirements baseline. It declares itself binding, so its OD-n items are treated as confirmed requirements. The Orders code, the Paper, Client Trays, Vehicle Allocation and Collections decision files, and the frontend Orders feature files were used as supporting evidence.

**Not available** (each would shrink the Unknowns list): existing tests and issue/bug history, the Swagger output (`metadata.js`), UI mockups, the `QueryClient` defaults (affects D-2), the frontend `http`/error helpers, `paper.types.ts`.

**Labels:** **\[C\]** confirmed requirement (OD/PA/CT id). **\[O\]** observed in code only. **\[I\]** inferred assumption. **\[U\]** unknown, needs a decision.

Section D is the implementation-vs-expectation comparison (process steps 7 and 8).

**Revision note:** the business owner answered Q1 to Q14 after this was first written. The Impl cells in section C were updated where the answer changes them, and section F records the decisions, discrepancy status and new scenarios. Sections D and E below show the state before the decisions. Code changes are implemented but not yet compiled or run.

## A. Feature Behavior Map

### A1. Surface

| Endpoint (prefix `/api`) | Role | Throttle (per user) | Purpose |
| --- | --- | --- | --- |
| `GET /orders/sheet/:sheetId` | EMPLOYEE (ADMIN passes) | global 300/min | Milk and non-milk grids, workflow, `itemsUpdatedAt` |
| `GET /orders/products?category=` | same | global | Catalog of active products for a category |
| `GET /orders/sheet/:sheetId/items` | same | global | Raw order lines |
| `POST /orders/sheet/:sheetId/night-save` | same | 60/min | Set ordered quantities |
| `POST /orders/sheet/:sheetId/morning-save` | same | 60/min | Set delivered quantities, create morning-created lines |
| `POST /orders/sheet/:sheetId/products` | same | global | Add a product column (DRAFT only) |
| `DELETE /orders/sheet/:sheetId/products/:productId?expectedUpdatedAt=` | same | global | Remove a product column (DRAFT only) |

### A2. What each paper status allows \[C: OD-2.1, 2.3, 3.4\]

| Paper status | Add/remove product | Night save | Morning save | Grid shows |
| --- | --- | --- | --- | --- |
| DRAFT | Yes | Yes | No | ordered qty, night bill |
| NIGHT\_SUBMITTED, no morning save yet | No | No | Yes (update and create lines) | ordered qty, night bill |
| NIGHT\_SUBMITTED, after a morning save | No | No | Yes | delivered qty, final bill |
| MORNING\_SUBMITTED / FINALIZED | No | No | No | delivered qty, final bill |
| REOPENED | No | No | Yes, existing lines only | delivered qty, final bill |

### A3. Order-line lifecycle

1. **Created at night** (DRAFT, explicit qty > 0): supplier resolved, config frozen, night rate and bill computed \[C: OD-6.7, 8, 10\].
2. **Updated at night** (qty > 0): qty, night rate and bill change. Supplier, tray type, order-unit config, owner and fallback flag stay frozen \[C: OD-6.9\].
3. **Cancelled** (explicit 0 on an existing line): ordered 0, night bill 0, delivered 0, final fields 0, final rate = stored night rate, no rate lookup \[C: OD-6.10\].
4. **Re-raised** (0 to >0): delivered and all final fields cleared \[C: OD-6.11\].
5. **Delivered** (morning, NIGHT\_SUBMITTED or REOPENED): delivered qty and final billing, live pricing, or frozen pricing in the OD-9.6 case.
6. **Created in the morning** (NIGHT\_SUBMITTED only, explicit delivered > 0, no line): insert-only, ordered 0, night rate null, night bill 0 \[C: OD-7.6, 7.11\].
7. **Deleted:** only through product removal in DRAFT, when no client has ordered qty > 0 \[C: OD-11.3\].

### A4. Side effects and downstream consumers

- **Concurrency token:** `order_sheet.order_items_updated_at` advances once per request that changes data. Shared by night-save, morning-save, add and remove \[C: OD-12\].
- **Client Trays recalculation:** runs in the same transaction after every processed save. A return conflict gives 409 and rolls back the whole Orders save \[C: OD-6.13, CT-6.6\].
- **REOPENED corrections:** also enqueue a forward-cascade outbox row, after a dry-run conflict check \[C: CT-10.2\].
- **Morning-entry-saved flag:** set on the first processed morning save; flips the grid and tray basis from ordered to delivered \[C: OD-7.9, CT-6.5\].
- **Warning log:** over-delivery above 150% of ordered \[C: OD-7.5\].
- **Consumers:** Vehicle Allocation reads ordered qty. Distributor Transfer reads delivered qty. Paper readiness gates call Orders validators \[C: OD-13, PA-6.2, PA-7.2\].

### A5. Business invariants

| ID | Invariant | Source |
| --- | --- | --- |
| INV-1 | Night ordered qty is never editable after DRAFT, even on reopen | OD-2.2 |
| INV-2 | Frozen line fields never change after creation | OD-8.6, 10.1 |
| INV-3 | Blank/null/omitted is "no entry", never 0. Explicit 0 keeps its meaning | OD-5.1 |
| INV-4 | Qty is 0 to 10000 with at most 2 decimal places, rejected not rounded | OD-5.2, 5.3 |
| INV-5 | No price, rate, GST or amount can be supplied by the client | OD-5.8, 9.5 |
| INV-6 | One line per (sheet, client, product) and per (sheet, client, link) | OD-10.3 |
| INV-7 | GST amount = rounded final minus rounded taxable, one shared night/final formula | OD-9.2, 9.3 |
| INV-8 | Each save is all-or-nothing, including the token | OD-6.2, 12.5 |
| INV-9 | A no-op never advances the token, sets the flag or recalculates trays | OD-12.8 |
| INV-10 | `expectedUpdatedAt` is mandatory on every mutation. Omitted is always 400 | OD-12.7 |
| INV-11 | REOPENED never creates lines and never edits ordered qty | OD-2.3, 7.11 |
| INV-12 | Later catalog edits never change what a sheet shows or bills | OD-3.2 |
| INV-13 | Tray quantity is summed then rounded once. A correction never leaves a return above its balance | OD-6.13, CT-6.4, 6.6 |

**Security constraints**

- SEC-1: JWT required on all endpoints; an inactive user gets 401 \[I, from `JwtStrategy`\].
- SEC-2: the role comes from the DB-backed user, never the body.
- SEC-3: unknown body fields are rejected (400) \[C: OD-5.5\].
- SEC-4: id format is digits only, 1 to 2147483647 \[C: OD-4.3\].
- SEC-5: per-user throttle applies \[C: OD-1.2\].
- SEC-6: raw SQL is parameterized \[O\].
- SEC-7: body limit is 1 MB \[O\].
- SEC-8: unexpected errors are masked with a request id \[I, from PA-11.5\].
- SEC-9: there is no per-group or per-sheet authorization \[U: Q3\].

## B. Requirement and Evidence Inventory

### B1. Confirmed requirements (index)

| Theme | IDs |
| --- | --- |
| Access and throttling | OD-1.1, 1.2 |
| Workflow matrix and error messages | OD-2.1 to 2.4 |
| Sheet view | OD-3.1 to 3.7 |
| Other reads | OD-4.1 to 4.3 |
| Input validation | OD-5.1 to 5.8 |
| Night save | OD-6.1 to 6.15 |
| Morning save | OD-7.1 to 7.12 |
| Supplier resolution | OD-8.1 to 8.8 |
| Pricing, GST, billing | OD-9.1 to 9.7 |
| Frozen config | OD-10.1 to 10.3 |
| Product add/remove | OD-11.1 to 11.4 |
| Concurrency token | OD-12.1 to 12.8 |
| Submission gates | OD-13.1 to 13.6 |
| HTTP statuses | OD-14.1, 14.2 |
| Cross-module | PA-6.5, 7.5, 17.4 (no-operation exemption), PA-18 (revert), CT-6.4, 6.5, 6.6, 10.2 |

### B2. Observed behavior not covered by any requirement

| ID | Observation | Evidence |
| --- | --- | --- |
| O-1 | DTO `@Min(0)` rejects negative qty with the class-validator text before the service's "cannot be negative" message can fire | `save-*-entries.dto.ts` |
| O-2 | A JSON token accepts any non-strict ISO-8601 string, including date-only. The query-string token accepts any `Date`-parseable string. A mismatch gives 409, not 400 | `expected-updated-at.decorator.ts`, `optimistic-concurrency.service.ts` |
| O-3 | Transaction timeout (10 s) returns 409 "took too long and nothing was saved" (Orders doc silent; PA-11.3 covers it) | `transaction-runner.ts` |
| O-4 | A partial first morning save is accepted. Unsent lines then display and count as 0 | `orders.service.ts`, `order.builder.ts` |
| O-5 | After revert-morning (NIGHT\_SUBMITTED), morning saves reprice at live rates. Frozen pricing applies only when REOPENED | `billing.service.ts` (`hasFrozenCommercials`) |
| O-6 | Fallback candidates sort by priority, primary at 0. A fallback with priority 0 ties with the primary and order depends on DB row order | `order-commercial.service.ts` |
| O-7 | Over-delivery warning is a log line inside the transaction. Repeated on serialization retries and emitted even if the save later rolls back | `billing.service.ts` |
| O-8 | UI refetches the sheet after save instead of using the returned token. Only the "Order data has changed..." 409 is treated as stale | `useSaveOrders.ts` |
| O-9 | UI product selector lists the whole catalog. UI makes all product cells editable when `workflow.editable`, including no-line cells on REOPENED | `OrdersProductSelector.tsx`, `OrdersGrid.tsx` |
| O-10 | `useOrders` disables only `refetchOnWindowFocus` | `useOrders.ts` |
| O-11 | Add/remove error texts ("Products can only be added while the paper is in DRAFT" etc.) are not in the doc | `orders.service.ts` |
| O-12 | `validateQuantitySanity` (negative delivered) and "Missing supplier" cannot be triggered through the public API | validators, DTOs |

### B3. Inferred (assumptions)

- **I-1:** An inactive user token gets 401 (from `JwtStrategy`, outside the Orders doc).
- **I-2:** A double-click on Save yields one success and one 409 (follows from OD-12 token rules).
- **I-3:** Save concurrent with Paper night-submit yields exactly one winner (follows from PA-11.1 and OD-2.1).
- **I-4:** Group delivery sessions are irrelevant to Orders edits. Orders never reads `delivery_session`.
- **I-5:** Unexpected DB errors give a masked 500 with nothing saved.

### B4. Unknowns

See section E.

## C. Behavioral Scenario Matrix

**Impl column:** OK means the code appears to satisfy the expectation. D-n points to a discrepancy in section D. U-n points to an open question in section E. N/A means it cannot be observed through the API.

### C1. Access, throttling, request shape

| ID | Given / When | Then (observable) | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-01 | No/expired JWT, call any of the 7 endpoints | 401 | none | OD-1.1 | OK |
| S-02 | Valid EMPLOYEE or ADMIN JWT, call any endpoint | Allowed | none | OD-1.1 | OK |
| S-03 | Deactivated user with an unexpired token | 401 | none | I-1 | OK |
| S-04 | Same user sends a 61st night-save within 60 s | 429. Another user unaffected | none | OD-1.2 | OK |
| S-05 | Body has an unknown field (e.g. `price`, `rate`, or per-entry) | 400, nothing saved | none | OD-5.5, 5.8 | OK |
| S-06 | Employee of group A edits group B's sheet | Allowed | - | SEC-9 | OK (OD-1.3) |

### C2. Reads

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-10 | Sheet id missing in DB, any Orders endpoint | 404 "Order sheet not found" | none | OD-14.1 | OK |
| S-11 | Id is `abc`, `0`, `-1`, `2147483648` | 400 "Invalid id". `007` is read as 7 | none | OD-4.3 | OK |
| S-12 | DRAFT sheet, never saved, GET sheet | Ordered qty and night bill. `itemsUpdatedAt` null. `workflow.editable` true | none | OD-3.4, 3.6 | OK |
| S-13 | NIGHT\_SUBMITTED, no morning save, GET | Still ordered qty and night bill | none | OD-3.4 | OK |
| S-14 | NIGHT\_SUBMITTED after a morning save, or REOPENED, GET | Delivered qty and final bill. Blank delivered shows 0 | none | OD-3.4 | OK |
| S-15 | MORNING\_SUBMITTED / FINALIZED, GET | Delivered qty. `editable` false | none | OD-3.4, 3.6 | OK |
| S-16 | Client active, in group, authorized, GET | Row appears even with no order | none | OD-3.1 | OK |
| S-17 | Client has lines on this sheet but since deactivated/moved | Row still appears | none | OD-3.1 | OK |
| S-18 | Product is `show_by_default` or explicitly added and active | Column shown | none | OD-3.2 | OK |
| S-19 | Product billed on the sheet then deactivated | Column still shown | none | OD-3.2 | OK |
| S-20 | Milk and non-milk columns | Milk has no packaging-type level; non-milk does. Field names `product_<id>` | none | OD-3.7 | OK |
| S-21 | Mixed clients/products | Products by display\_order (blank last) then brand. Clients by name. Row bill = sum of the client's line bills. Totals = client count and total bill | none | OD-3.3, 3.5 | OK |
| S-22 | `GET /products?category=MILK` | Active MILK catalog, including products already on the sheet | none | OD-4.1 | OK |
| S-23 | `category` missing or `FOO` | 400 | none | OD-4.1 | OK |
| S-24 | `GET /items` | Raw lines, no workflow block, no totals. 404 if sheet missing | none | OD-4.2 | OK |

### C3. Night save: validation and token

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-30 | DRAFT, token never set, save with `expectedUpdatedAt: null` and a valid entry | 200 `{success, message, itemsUpdatedAt}` with a new token | Line created. Token set once | OD-12.7, 6.14 | OK |
| S-31 | Any mutation with `expectedUpdatedAt` omitted | 400, on all four mutating endpoints | none | OD-12.7 | OK |
| S-32 | Token already set, send `null` | 409 stale | none | OD-12.7 | OK |
| S-33 | Malformed token (`"abc"`) | 400 "Invalid expectedUpdatedAt" | none | OD-12.6 | OK |
| S-34 | Date-only or other loose ISO token | 409, or 400 for a non-date string | none | O-2 | OK (OD-12.10) |
| S-35 | `entries: []`, or more than 5000 items | 400 | none | OD-5.5 | OK |
| S-36 | qty 5, 5.5, 5.25, 5.00 | Accepted | stored as given | OD-5.2 | OK |
| S-37 | qty 5.255 | 400 "at most 2 decimal places". Never rounded | none | OD-5.2 | OK |
| S-38 | qty 10000 | OK | line stored | OD-5.3 | OK |
| S-39 | qty 10000.01, `"5"` | 400 | none | OD-5.3 | OK |
| S-40 | qty -1 | 400 with message "\<field> cannot be negative" | none | OD-5.3 | OK (400 only, OD-5.3) |
| S-41 | Same (client, product) twice with explicit qty | 400 "Duplicate entries found" | none | OD-5.6 | OK |
| S-42 | Same pair once blank and once explicit | Accepted | processed as one entry | OD-5.6 | OK |
| S-43 | All entries blank/null/`""` | 200, token unchanged | no writes, no tray recalc | OD-5.1, 6.4, 12.8 | OK |
| S-44 | Explicit 0 for a pair with no line | 200, token unchanged | creates nothing | OD-6.8 | OK |
| S-45 | Explicit 0 for a nonexistent client/product id | 400 "Client/Product with ID X not found" | none | OD-6.5a, 14.2 | OK |
| S-46 | Stale token with an otherwise no-op payload | 409 | none | OD-12.8 | OK |
| S-47 | Paper not DRAFT, night save | 400 "Cannot edit night entries when paper is X. Allowed status: DRAFT" | none | OD-2.4 | OK |
| S-48 | Pre-transaction error (precision) together with a stale token | 400 (precision) first | none | OD-6.3 | OK |

### C4. Night save: business rules

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-50 | Valid new line, qty > 0, rate exists | 200 with new token | Line with link, tray type, units, pricing qty/unit, owner, fallback flag frozen. Night rate/bill computed. Tray ledger recalculated. Token advanced once | OD-6.7, 10.1, 6.13 | OK |
| S-51 | New line: client inactive, in other group, or not authorized for the category | 400, nothing saved | none | OD-6.5c | OK |
| S-52 | New line: product inactive, or not default, not added, and no line for any client | 400 "not available on this sheet..." | none | OD-6.6 | OK |
| S-53 | Client has no primary supplier for the category | 400 "Missing \<CAT> supplier for client X" | none | OD-8.3 | OK (guard; not API-reachable, O-12) |
| S-54 | Primary is allowed and has an active link | Primary chosen, `resolved_via_fallback = false` | frozen | OD-8.2 | OK |
| S-55 | Primary not allowed, inactive, or has no active link; fallback allowed and listed | Fallback chosen, flag true, warning logged | frozen | OD-8.2, 8.4, 8.5, 8.8 | OK |
| S-56 | No eligible supplier / no active link on any candidate | 400 with the OD-8.2 message | none | OD-8.2 | OK |
| S-57 | Primary and a fallback both at priority 0 | Primary chosen; among fallbacks, lowest distributor id | - | O-6 | Implemented, not yet run (OD-8.2) |
| S-58 | No applicable rate for sale date | 400 "No active rate found for product X on date D", whole request fails | none | OD-9.4 | OK |
| S-59 | Client rate and distributor rate both valid | Client rate wins. If several, latest `effective_from` | - | OD-9.1 | OK |
| S-60 | Rate effective-from 11 Oct 10:00 IST, sale date 11 Oct | Valid | - | OD-9.1 | OK |
| S-61 | Rate effective-from 12 Oct 00:30 IST, or effective-to 10 Oct 23:59 IST, sale date 11 Oct | Not valid | - | OD-9.1 | OK |
| S-62 | Rate effective-to 11 Oct 00:00 IST, sale date 11 Oct | Valid | - | OD-9.1 | OK |
| S-63 | GST-exclusive: qty 10, rate 100, 18% | taxable 1000, GST 180, bill 1180 | stored as `night_bill_amount` | OD-9.3 | OK |
| S-64 | GST-inclusive: qty 10, rate 118, 18% | bill 1180, taxable 1000, GST 180 | - | OD-9.3 | OK |
| S-65 | Pricing qty 12, Rs 56/L, 10 crates, 0% | Rs 6,720 | - | OD-9.3 | OK |
| S-66 | Product GST % changed after line creation, re-save the line | New GST used (not frozen at night) | night bill recomputed | OD-9.7 | OK |
| S-67 | Existing line, qty > 0, supplier/link/tray rule changed in master data, save | qty/rate/bill update. Supplier, tray type, units, owner, fallback flag unchanged | - | OD-6.9, 8.6, 10.1 | OK |
| S-68 | Existing line of a deactivated client/product, qty changed or set to 0 | Allowed. Positive qty still needs a rate | - | OD-6.5b | OK |
| S-69 | Existing line, explicit 0 | Ordered 0, night bill 0, delivered 0, final taxable/GST/bill 0. Final rate = stored night rate. No rate lookup. GST%/inclusive = product's current | tray recalculated | OD-6.10 | OK |
| S-70 | Zeroed line, qty > 0 | Delivered and all final fields cleared. Night rate/bill recomputed | - | OD-6.11 | OK |
| S-71 | 1 bad entry among 50 | Whole request fails, nothing saved, token unchanged | rollback | OD-6.2, 12.5 | OK |
| S-72 | Save would leave a stored tray return above its balance | 409 with `details[]`, nothing saved | rollback | OD-6.13, CT-6.6 | OK |
| S-73 | Three lines of 0.4 crates for the same client and tray type | Tray taken = 1 (sum then round) | ledger | OD-6.13, CT-6.4 | OK |

### C5. Morning save

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-80 | NIGHT\_SUBMITTED, existing line, delivered 12 vs ordered 10 | Accepted. Final bill computed | flag set, tray recalc, token advanced | OD-7.4, 7.9 | OK |
| S-81 | Delivered > 150% of ordered (ordered > 0) | Accepted. Warning logged when the value changes | log only | OD-7.5 | N/A (log only, OD-7.5) |
| S-82 | Existing line of a deactivated client or product, delivered corrected | Allowed. Live rate still required | - | OD-7.3, 7.8 | OK |
| S-83 | NIGHT\_SUBMITTED, no line, delivered > 0, valid client/product | New line: ordered 0, night rate null, night bill 0, frozen config, final bill with live rate and GST | INSERT only | OD-7.6 | OK |
| S-84 | Same, but the unique key already exists (race) | 409 "Another save changed this sheet..." | rollback | OD-6.12, 7.6 | OK |
| S-85 | REOPENED, no line, delivered > 0 | 400 "New order lines cannot be created while the paper is REOPENED...", whole request fails | none | OD-7.11 | OK |
| S-86 | REOPENED, explicit 0 with no line | 200 no-op, token unchanged | none | OD-7.7, 7.11 | OK |
| S-87 | REOPENED, line already billed (rate, GST%, delivered > 0), master rate/GST changed, correct delivered | Original rate, GST%, inclusive flag reused | - | OD-9.6 | OK |
| S-88 | REOPENED, line previously 0 or never billed, corrected | Live rate and current GST | - | OD-9.6 | OK |
| S-89 | Line cancelled at night (ordered 0, night rate present), delivered 0 | Success, no rate lookup. Final fields 0, rate/GST/flag unchanged | - | OD-7.12 | OK |
| S-90 | Same cancelled line, delivered > 0 | Live pricing. Missing rate gives 400 "No rate configured for client X product Y" | - | OD-7.12, 7.8 | OK |
| S-91 | Morning-created line (no night rate), delivered set to 0, no live rate | 400 missing rate | - | OD-7.12, 7.8 | OK |
| S-92 | First morning save on a sheet | Grid flips from ordered to delivered. Tray basis flips | flag set | OD-3.4, 7.9, CT-6.5 | OK |
| S-93 | First morning save sends only some existing lines | Backend accepts. Unsent lines show and count as 0 | - | OD-13.6 | Accepted (OD-13.6) |
| S-94 | Morning save with nothing processed | 200, token unchanged, flag not set, no tray recalc | none | OD-7.9, 12.8 | OK |
| S-95 | Paper is DRAFT, MORNING\_SUBMITTED or FINALIZED | 400 "Cannot edit morning entries when paper is X. Allowed statuses: NIGHT\_SUBMITTED, REOPENED" | none | OD-2.4 | OK |
| S-96 | REOPENED correction | Tray recalculation. Forward conflict dry run. Cascade outbox row. A later-sheet conflict gives 409 and nothing saved | same transaction | OD-6.13, CT-10.2 | OK |
| S-97 | Paper reverted to NIGHT\_SUBMITTED, previously billed line, delivered corrected | Original rate, GST % and inclusive flag kept for lines already billed (delivered > 0) | - | O-5 | Implemented, not yet run (OD-9.6) |

### C6. Product add and remove

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-100 | DRAFT, valid active product, current token | Refreshed sheet with new `itemsUpdatedAt` | Link created. Token advanced | OD-11.2 | OK |
| S-101 | Product already explicitly added | 400 "Product already exists in this sheet" | rollback (token too) | OD-11.2 | OK |
| S-102 | Product is a default, or inactive, or unknown | Default: allowed, harmless. Inactive/unknown: 400 | - | OD-11.2 | OK |
| S-103 | Paper is not DRAFT | 400 | none | OD-2.1 | OK |
| S-104 | Stale token or token omitted on add/remove | 409 / 400 | none | OD-11.4, 12.7 | OK |
| S-105 | Remove: non-default product, no client with qty > 0 | Link and all zeroed lines deleted. Refreshed sheet | token advanced | OD-11.3 | OK |
| S-106 | Remove: default product, even if deactivated | 400 "Default products cannot be removed" | - | OD-11.3 | OK |
| S-107 | Remove: some client has ordered qty > 0 | 400 "Set quantities to 0 first" | - | OD-11.3 | OK |
| S-108 | Remove: no link and no lines | 400 "Product not found in this sheet" | - | OD-11.3 | OK |
| S-109 | Query `expectedUpdatedAt` missing, empty, literal `null`, unparseable, stale | 400, 400, null-token path, 400, 409 | - | OD-12.7 | OK |
| S-110 | User A adds/removes, user B holds the old token and saves | B gets 409 stale | - | OD-12.3 | OK |

### C7. Concurrency, retry, failure

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-120 | Two users save the same sheet with the same token | One succeeds. The other gets 409 (stale, or "conflicted with another update" after 3 attempts) | one write | OD-6.2, 12.3 | OK |
| S-121 | Double-click Save with the same payload and token | First succeeds. Second 409 | one write | I-2 | OK (UI disables button until refetch) |
| S-122 | Re-save identical values with the fresh token | Treated as a change. Token advances. Line `updated_at` changes | rewrite | OD-12.8.5 | OK |
| S-123 | Client never received the success response and retries with the old token | 409 although the data was saved | - | - | Accepted (OD-12.9) |
| S-124 | Save races Paper night submit | Exactly one wins. A losing save gets 400 (status) | serializable | I-3 | OK |
| S-125 | Transaction exceeds 10 s | 409 "took too long and nothing was saved" | rollback | O-3 | Accepted (OD-6.2) |
| S-126 | DB error or unexpected exception | Masked 500 with `requestId`, nothing saved | rollback | I-5 | OK |
| S-127 | Unique-key race on line insert | 409 "Another save changed this sheet... reload and retry" | rollback | OD-6.12 | OK (UI reloads, OD-12.10) |

### C8. Submission gates owned by Orders

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-130 | Night submit: sheet with at least 1 line of ordered qty > 0 | Passes the Orders gate | - | OD-13.1 | OK |
| S-131 | Night submit: sheet only has zeroed lines or none | 400 "No orders entered for sheet X...", unless no-operation or inactive group with no lines | - | OD-13.1, PA-6.5 | OK |
| S-132 | Morning submit: sheet with no lines | 400 "No order lines exist...", unless exempt | - | OD-13.2, PA-7.5 | OK |
| S-133 | Morning submit: a line has null delivered | 400 "Delivered quantity missing for: \<codes>" | - | OD-13.3 | OK |
| S-134 | Negative delivered stored | "Negative quantities not allowed" | - | OD-13.4 | N/A (O-12) |

## D. Discrepancies and Gaps

| ID | Type | Finding | Severity |
| --- | --- | --- | --- |
| D-1 | Doc differs from code | OD-5.3 says negatives give "\<field> cannot be negative". The API returns the class-validator text because the DTO `@Min(0)` fires first. The service message is unreachable. | Low |
| D-2 | Spec intent differs from UI | `useOrders` says a background refetch must not swap the token. Only `refetchOnWindowFocus` is disabled. Reconnect, remount and a default `staleTime` of 0 may still refetch, depending on `QueryClient` defaults (not provided). A silent token swap would let a save pass with unsaved edits against changed data, defeating OD-12.2. | **Medium (unverified)** |
| D-3 | Doc differs from UI | The UI refreshes and clears edits only for the "Order data has changed..." 409. The "Another save changed this sheet... reload and retry" 409 and the retry-exhausted 409 get a toast but no reload, so the token stays old. | Low to Medium |
| D-4 | Spec gap / risk | OD-13.6 makes the frontend responsible for sending every line on the first morning save. A direct API client can send a subset. The grid then flips, unsent lines count as 0, and trays drop (CT-6.5). Nothing server-side enforces completeness. | **Medium** |
| D-5 | Spec gap | Pricing after revert-morning (O-5): lines already billed are repriced at live rates, because frozen pricing is tied to REOPENED only. PA-18.4 and OD-9.6 are silent. | Medium |
| D-6 | Spec gap | A timeout gives 409 in code. The Orders doc lists only serialization conflicts. | Low |
| D-7 | Spec gap | Priority 0 or a tie with the primary gives nondeterministic supplier choice (O-6). | Low (depends on master-data rules) |
| D-8 | Spec gap / UX | REOPENED grid allows typing in no-line cells, which guarantees a 400 (OD-7.11). The selector offers products already on the sheet, which guarantees "already exists" (OD-4.1 only says the endpoint is a catalog). | Low |
| D-9 | Observability | The over-delivery warning (OD-7.5) is log-only. It is repeated on retries and emitted even if the save later rolls back. It cannot be asserted through the API. | Low |
| D-10 | Cannot be tested via API | OD-13.4 (negative delivered), OD-8.3 (missing supplier) and the OD-7.5 warning can only be exercised with DB seeding, if at all. | Info |
| D-11 | Doc silent | Error wording for add/remove status failures. Authorization scope across groups (SEC-9). Retry/idempotency after a lost response. | Low to Medium |

**Scenarios the current implementation appears unable to satisfy**

- **S-93:** it cannot be rejected server-side as OD-13.6 implies.
- **S-97:** no requirement can be tested until the repricing question is decided.
- **S-123:** the retry cannot succeed safely.
- **S-81 / S-134:** these cannot be asserted through the API.

## E. Open Questions (decisions needed)

Each question lists the owner. "(current)" marks what the code does today. No answer is recommended.

**All questions below were answered after this section was written. See section F for the decisions; only Q13 has a residual check left.**

**Q1 (Product + Eng, D-4). Partial first morning save.**

- A. Reject unless every existing line is included.
- B. Accept; the frontend is responsible (current).
- C. Accept, but do not flip the display or tray basis until every line has a delivered value.
- D. Other.

**Q2 (Product, D-5). Pricing after revert-morning.**

- A. Reprice at live rates on each save (current).
- B. Keep the original final pricing for lines already billed, as in OD-9.6.
- C. Frozen only for lines with delivered > 0, extended to NIGHT\_SUBMITTED-with-flag.
- D. Other.

**Q3 (Product). Who may edit which sheet?**

- A. Any employee, any group's sheet (current).
- B. Only employees assigned to that group.
- C. Reads open; writes scoped.
- D. Other.

**Q4 (Eng, D-6). Transaction timeout response.**

- A. 409 retryable (current).
- B. 503.
- C. 500.
- D. Also cap the effective work per request.

**Q5 (Eng + Product). Lost-response retry.**

- A. 409 stale is acceptable (current).
- B. Support an idempotency key.
- C. Treat an identical payload as already applied.
- D. Other.

**Q6 (Eng, D-1). Negative-quantity message.**

- A. The DTO default text is acceptable (current).
- B. Must read "\<field> cannot be negative".
- C. Only the 400 status matters.

**Q7 (Eng, O-2). Token strictness.**

- A. Full timestamp only.
- B. Any ISO-8601, including date-only (current).
- C. Same as B, but a mismatch from a non-timestamp input returns 400, not 409.

**Q8 (Product, D-7). Fallback priority.**

- A. Priority must be 1 or more, enforced in master data.
- B. Primary always wins ties.
- C. Lowest distributor id wins.
- D. Undefined.

**Q9 (Product, D-8). Product selector.**

- A. Show the full catalog (current).
- B. Hide products already on the sheet.
- C. Show them but disabled.

**Q10 (Product, D-8). REOPENED grid.**

- A. Allow typing in no-line cells; the server rejects (current).
- B. Lock cells that have no line.
- C. Other.

**Q11 (Eng, D-3). Reload on other 409s.**

- A. Reload only on the stale message (current).
- B. Reload on any 409 from a save.
- C. Show an explicit "Reload" action.

**Q12 (Product, D-9). Over-delivery warning.**

- A. Log only (current).
- B. Persist a flag or audit record.
- C. Return `warnings[]` in the save response.
- D. Not needed as a requirement.

**Q13 (Eng, D-2). Sheet-query refetch policy** (needs the `QueryClient` defaults).

- A. Disable all automatic refetch for the sheet query.
- B. Allow refetch, but adopt the new token only when no unsaved edits exist.
- C. Keep current behavior if the defaults already disable it.

**Q14 (Product, D-11). Add/remove wording.**

- A. Document the current messages as binding.
- B. Define new messages in the decision file.
- C. Not important.

## F. Revision After Decisions (Q1 to Q14)

All fourteen questions are answered and recorded in `ORDERS_BUSINESS_DECISION.md`. Code changes are implemented but not yet compiled or run.

### F1. Decision log

| Q | Decision | Effect | Spec reference |
| --- | --- | --- | --- |
| Q1 | Option B: server accepts a partial first morning save | Documented, no code change | OD-13.6 |
| Q2 | Frozen pricing for lines with delivered > 0, extended to NIGHT\_SUBMITTED after a morning save | Code changed | OD-9.6, OD-7.8 |
| Q3 | Any employee, any group's sheet | Documented | OD-1.3 |
| Q4 | Timeout 409 left as is (not a production blocker) | Documented | OD-6.2 |
| Q5 | Lost-response retry gives 409, accepted | Documented | OD-12.9 |
| Q6 | Best: only the 400 is binding for negatives | Documented | OD-5.3 |
| Q7 | Best: any parseable ISO-8601 token, mismatch is 409 | Documented | OD-12.10 |
| Q8 | Best: primary wins ties, then lowest distributor id | Code changed | OD-8.2 |
| Q9 | Selector hides products already on the sheet | UI changed | OD-4.4 |
| Q10 | Lock cells that have no line on REOPENED | UI changed | OD-7.13 |
| Q11 | Best: reload and clear edits on every "sheet changed" 409; keep edits on a timeout 409 | UI changed | OD-12.10 |
| Q12 | Over-delivery warning is log only | Documented | OD-7.5 |
| Q13 | Best: no refetch on focus or reconnect | UI changed | OD-12.10 |
| Q14 | Add/remove error wording documented | Documented | OD-11.5 |

### F2. Discrepancy status

| ID | Status | Note |
| --- | --- | --- |
| D-1 | Resolved | Only the 400 is binding (OD-5.3) |
| D-2 | Partly mitigated | Reconnect refetch off. Still needs the `QueryClient` defaults to confirm |
| D-3 | Resolved | UI reloads on every sheet-changed 409 |
| D-4 | Accepted risk | Server does not enforce a full first morning save |
| D-5 | Resolved | Original pricing kept after the first morning save |
| D-6 | Accepted | Timeout stays 409 |
| D-7 | Resolved | Deterministic tie-break |
| D-8 | Resolved | Selector and REOPENED grid changed |
| D-9 | Accepted | Log only |
| D-10 | Unchanged | Still not testable through the API |
| D-11 | Resolved | Messages documented, scope and retry decided |

### F3. New scenarios

| ID | Given / When | Then | State / side effects | Evidence | Impl |
| --- | --- | --- | --- | --- | --- |
| S-140 | DRAFT sheet, open the Add product selector | Products already a column of the sheet are not offered | none | OD-4.4 | Implemented, not yet run |
| S-141 | REOPENED paper, grid shown | Cells with no line are not editable. Cells with a line (including 0) are | none | OD-7.13 | Implemented, not yet run |
| S-142 | NIGHT\_SUBMITTED, first morning save on a line | Live rate and current GST applied | flag set after the save | OD-9.6 | Implemented, not yet run |
| S-143 | Same line, a later morning save after a master rate change, delivered > 0 | Original final rate, GST % and inclusive flag kept | final amounts recomputed with the old rate | OD-9.6 | Implemented, not yet run |
| S-144 | Save returns 409 "took too long, nothing was saved" | Unsaved edits are kept. Sheet is not reloaded | none | OD-12.10 | Implemented, not yet run |
| S-145 | Save returns 409 stale, unique-key race, or exhausted retry | Edits cleared. Sheet reloaded with the current token | none | OD-12.10 | Implemented, not yet run |
| S-146 | Window regains focus or the network reconnects while edits are unsaved | Sheet is not refetched. Token unchanged | none | OD-12.10 | Implemented, not yet run |
| S-147 | Primary and a fallback share priority 0 | Primary chosen every time | frozen on the line | OD-8.2 | Implemented, not yet run |

### F4. Still open

- **Q13 residual:** confirm the `QueryClient` defaults (interval refetch, cache reuse on navigating back).
- **Not run:** none of the code changes have been compiled or tested.
- **Q2 side effect:** a master rate change after the first morning save is not reflected in later delivered corrections.
