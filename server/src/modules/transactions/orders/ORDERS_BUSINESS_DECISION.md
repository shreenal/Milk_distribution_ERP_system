# Orders Module: Business Decisions (Source of Truth)

**Scope:** `modules/transactions/orders/` only (controller, service, repository, builder, DTOs, `services/*`, constants).
**Purpose:** Binding business requirements. A reviewer or developer must NOT infer, assume, or "improve" behavior that is not written here. If code and this file disagree, this file wins. If this file is silent, STOP and ask. See Section 15 (Open Items).
**Rule for changes:** Any behavior change requires a new or amended decision ID below, approved by the business owner, before code changes.

Decision IDs (`OD-n`) are stable. Cite them in code comments, PRs and reviews.

---

## 0. Glossary

| Term | Meaning |
|---|---|
| Order paper | One per business day. Holds one sheet per delivery group. |
| Sheet | One delivery group's order grid for that day (`order_sheet`). |
| Grid | Milk grid and Non-Milk grid. Rows are clients, columns are products. |
| Line / order line | A saved row in `order_sheet_items` for one client + one product on one sheet. |
| Night entry | `ordered_qty`, what the client requested. |
| Morning entry | `delivered_qty`, what was actually delivered. |
| Sale date | Order date + 1 day. Rates are resolved as of this date. |
| Primary supplier | Client's supplier for the product's category (`master_client_category`). |
| Fallback supplier | Distributor listed in the product-priority table for this group + product. |
| Product link | Distributor + product record that carries rates (`master_product_link`). |
| Frozen field | Value captured when a line is created and never changed by later saves. |
| Concurrency token | `order_sheet.order_items_updated_at`, exposed as `itemsUpdatedAt` / sent as `expectedUpdatedAt`. |
| Sparse entry | The grid does not require a value in every cell. Blank means no entry. |
| Explicit quantity | A quantity actually supplied as a number (including 0). |

---

## 1. Access and Roles

**OD-1.1** All Orders endpoints require login (JWT) and the `EMPLOYEE` role. `ADMIN` also passes via the role hierarchy. No Orders endpoint is admin-only.

**OD-1.2** Night-save and morning-save are throttled to 60 requests per minute per user. Other endpoints use the global limit.

---

## 2. Workflow: what can be done at each paper status

**OD-2.1 Status matrix (binding):**

| Paper status | View sheet | Add/remove product | Night save (ordered) | Morning save (delivered) |
|---|---|---|---|---|
| DRAFT | Yes | Yes | Yes | No |
| NIGHT_SUBMITTED | Yes | No | No | Yes |
| MORNING_SUBMITTED | Yes | No | No | No |
| FINALIZED | Yes | No | No | No |
| REOPENED | Yes | No | No | Yes (delivery only) |

**OD-2.2 Night order is permanently immutable after night submission.** Original ordered quantities are locked once the paper leaves DRAFT. Reopening NEVER allows changing them. *(Former decisions 8 and 10, unchanged.)*

**OD-2.3 Reopen allows delivery corrections only.** It never permits editing night quantities, never creates new order lines (OD-7.6, OD-7.11), and never re-runs or recalculates the historical night plan.

**OD-2.4** Error messages for wrong status: night save outside DRAFT returns `Cannot edit night entries when paper is <STATUS>. Allowed status: DRAFT`. Morning save outside NIGHT_SUBMITTED/REOPENED returns `Cannot edit morning entries when paper is <STATUS>. Allowed statuses: NIGHT_SUBMITTED, REOPENED`. Both are HTTP 400.

---

## 3. Sheet View (`GET /orders/sheet/:sheetId`)

**OD-3.1 Every eligible client appears as a row even with no order.** *(KEEP.)* Eligible means: belongs to the sheet's group, is active, and is authorized for that category. Clients who already have lines on this sheet in that category also appear, even if since deactivated or moved. A blank row is normal.

**OD-3.2 Visible product columns.** A product is shown if it is active AND (marked `show_by_default` OR explicitly added to this sheet). Any product already billed on the sheet is also shown even if later deactivated or reclassified. Reason: a finalized paper must never change because of later catalog edits. Existing lines for such products stay editable while the paper is in DRAFT (OD-6.5b).

**OD-3.3 Ordering.** Products: display order (blank last), then brand name. Clients: name ascending.

**OD-3.4 What quantities/bills the grid displays:**
- DRAFT: ordered quantities and night bill amounts.
- NIGHT_SUBMITTED before any morning save: still ordered quantities and night bills (the delivery screen is pre-filled with ordered values; they are NOT yet stored as delivered).
- NIGHT_SUBMITTED after a morning save, MORNING_SUBMITTED, FINALIZED, REOPENED: delivered quantities and final bill amounts (blank delivered displays as 0).

**OD-3.5 Bill amount per row** is the sum of that client's line bills within the grid. Totals are the client count and the total bill amount.

**OD-3.6** The response includes `itemsUpdatedAt` (the concurrency token) and a workflow block. `workflow.editable` is true in DRAFT, NIGHT_SUBMITTED and REOPENED. It does NOT say which kind of edit is allowed. The frontend must use `status`.

**OD-3.7** Column hierarchy: Brand → Product Group → Product Type → size label. Only the Non-Milk grid adds the Packaging Type level. Each product column's field name is `product_<productId>`. Documented assumption (D7): Milk products do not differ by packaging type, so the Milk grid deliberately has no Packaging Type level. Two active Milk products that differ only by packaging type would render identical column labels, so the catalog must not contain such products. The Milk hierarchy must not be changed without a new decision.

---

## 4. Other Read Endpoints

**OD-4.1 `GET /orders/products?category=`** returns all active products in the category. `category` is required and must be `MILK` or `NON_MILK` (else 400). It does NOT exclude products already on the sheet. It is a catalog, not a "still addable" list.

**OD-4.2 `GET /orders/sheet/:sheetId/items`** returns raw line items (client, product, distributor). No workflow block and no totals. Sheet not found returns 404.

**OD-4.3 Sheet id format.** URL ids must be digits only, 1 to 2147483647. Otherwise 400 `Invalid id`.

---

## 5. Input Validation Rules (all quantities)

**OD-5.1 Sparse entry (binding).**
- `null`, blank (`""`), omitted = **no entry / no operation**. The cell is untouched.
- `0` = an explicitly entered zero and keeps its business meaning (OD-6.x, OD-7.x).
- Null/blank/omitted must NEVER: be converted to 0, create a line, trigger supplier resolution, require a rate, trigger billing, or be read as cancellation.
- Only entries with an explicit numeric quantity are processed.
- For an existing line, omitted/null means "unchanged". Existing values stay as they are (partial save). Nothing is deleted or zeroed by omission.

**OD-5.2 Precision (binding, all products, both phases).** Ordered and delivered quantities may have **at most 2 decimal places**. `5`, `5.5`, `5.25`, `5.00` are valid. `5.255` is **rejected** with `Invalid quantity: <n>. Quantity must be specified to at most 2 decimal places.` Values are NEVER silently rounded. Tray vs non-tray products make no difference.

**OD-5.3 Range and type.** Quantity is a JSON number from 0 to 10000 (ordered and delivered). Strings (`"5"`), NaN, Infinity and negatives are rejected. Negative values use `<field> cannot be negative`.

**OD-5.4 Units.** The quantity is in **order units** (e.g. crates), not litres or kg. Price is derived from the line's pricing quantity (Section 9).

**OD-5.5 Request shape.** `entries` must have 1 to 5000 items. `clientId` and `productId` are integers 1 to 2147483647. Unknown extra fields are rejected (400).

**OD-5.6 Duplicates.** The same client + product more than once in one request is rejected: `Duplicate entries found: ...`. Duplicates are checked among entries that carry an explicit quantity.

**OD-5.7 Validation order.** Precision and range checks run BEFORE the database transaction starts, so a malformed request never touches data.

**OD-5.8 No price input.** There is no price or rate field on any Orders request. Unknown fields are rejected.

---

## 6. Night Save (`POST /orders/sheet/:sheetId/night-save`)

Body: `{ entries: [{ clientId, productId, orderedQty? }], expectedUpdatedAt }`

**OD-6.1 Allowed only in DRAFT** (OD-2.1).

**OD-6.2 Atomic.** The whole request is one serializable transaction. If any entry fails, nothing is saved and the concurrency token is also rolled back. On a database serialization conflict the system makes at most 3 total attempts (1 initial attempt + 2 retries), then returns 409 `Your request conflicted with another update and could not be completed. Please retry.`

**OD-6.3 Concurrency check first (within the transaction).** After confirming the sheet exists and the paper status allows the operation, the concurrency token is checked (OD-12) before transactional entry validation, supplier resolution, rate resolution, or mutation. Request-shape validation, duplicate-entry validation, and quantity precision/range checks (OD-5.2, OD-5.3, OD-5.6, OD-5.7) occur before the transaction. Therefore, these pre-transaction validation errors may be returned before a stale-token conflict. Within the transaction, a stale token returns 409 before transactional entry validation, even if the request would otherwise be a no-op.

**OD-6.4 Nothing processed = true no-op.** If no entry is actually processed (all blank/null/omitted, or only explicit 0 on non-existent lines), the request changes no data and does NOT advance the token. The status check and the token check still run first (a stale token is still 409). On a match the response is success with the current, unchanged `itemsUpdatedAt`. See OD-12.8.

**OD-6.5 Per-entry validation: new lines vs existing lines (binding).**
- **(a) All entries with an explicit quantity (including 0):** the client and product must exist, and the precision/range rules (OD-5) apply.
- **(b) Existing line** (this client + product already has a line on this sheet): it may be updated or set to 0 (OD-6.9, OD-6.10) EVEN IF the client has since been deactivated or moved to another group, or the product has been deactivated or is no longer a default. Active-client, group-membership, category-authorization and active-product checks are NOT applied. The supplier, product link and all frozen fields never change (OD-8.6, OD-10). The product must still be available on the sheet, which an existing line satisfies by definition (OD-6.6 clause c). A positive quantity still requires a resolvable rate (OD-9.4). Reason: a deactivated product or client must remain cancellable so a DRAFT sheet is never stranded (a product cannot be removed until its ordered quantities are 0, OD-11.3).
- **(c) New line** (no existing line and explicit quantity > 0): ALL live checks apply: client is active and belongs to THIS sheet's group; product is active; client is authorized for the product's category (e.g. `Client "X" is not authorized to purchase MILK products`); product is available on this sheet (OD-6.6).
- **(d) Explicit 0 with no existing line:** creates nothing and is a no-op (OD-6.8, OD-12.8). Only (a) applies.

**OD-6.6 Product must exist on the sheet before it can be ordered (binding).** The product must be (a) a default product (`show_by_default`), OR (b) explicitly added to this sheet, OR (c) already have a line on this sheet **for any client** (a line for any client makes the product available for every eligible client). A product that merely exists and is active in the global catalog is NOT sufficient. Availability is only one gate: when creating a new line, client activity, group membership, category authorization, supplier resolution and pricing are still validated independently (OD-6.5c, Sections 8 and 9). Clause (c) is what keeps existing lines editable after the product is deactivated or stops being a default (OD-6.5b). This check applies to every processed entry (existing-line updates and new lines). Failure is 400 `Product <id> is not available on this sheet. Add it to the sheet before ordering it.`

**OD-6.7 New line, quantity > 0.** Create a line. Resolve the supplier (Section 8), resolve a rate (Section 9), freeze the line (Section 10), compute the night bill (Section 9.2).

**OD-6.8 New line, explicit 0.** Create nothing. No supplier or rate needed. Never create zero-valued lines because a cell is merely visible. This is a no-op and does not by itself advance the token (OD-12.8).

**OD-6.9 Existing line, positive quantity.** Update the ordered quantity, night rate and night bill. Supplier, tray type, order-unit config, owner and fallback flag stay frozen. Delivered/final fields are not touched.

**OD-6.10 Existing line, explicit 0 (cancellation).**
- Ordered quantity = 0, night bill = 0.
- Delivered quantity = 0 and final taxable/GST/bill = 0 are set immediately, so morning does not require re-entry.
- Final rate = the line's **stored night rate**, left as is and NOT re-resolved from the rate tables (0 if the line has no stored night rate). The cancellation does not change the stored night rate itself. Final GST % and inclusive flag = the product's current values. Morning handling of such a line: OD-7.12.

**OD-6.11 Raising a zeroed line back above 0.** Delivered quantity and all final fields (rate, GST %, GST amount, taxable, bill, inclusive flag) are cleared to empty so nothing stale survives. The line must be delivered afresh.

**OD-6.12 Persistence.** Bulk upsert in chunks of 1000 keyed on (sheet, client, product link). Fields frozen at creation are never overwritten. A unique-constraint collision (race) returns 409 `Another save changed this sheet at the same time. Please reload and retry.`

**OD-6.13 Side effect.** After saving, client-tray recalculation for the sheet runs in the same transaction (outside Orders scope). Its failure rolls back the order save. This includes a return-discrepancy conflict (409, CT-6.6): if the changed quantities would leave a stored client-tray return above its balance, on this sheet or, on a REOPENED paper, on any later sheet of the group, the whole order save is refused. Tray quantities are calculated by Client Trays (CT-6.4): quantities of all order lines for the same client + tray type + category are summed first and rounded once, half-up, not rounded line by line (e.g. three lines of 0.4 crates total 1.2 and give 1 tray). Orders work must not change this.

**OD-6.14 Response** `{ success: true, message, itemsUpdatedAt }` where `itemsUpdatedAt` is the NEW token (OD-12.4).

**OD-6.15 Night submission rule (not changed).** An empty night sheet is not a valid business scenario and is outside the normal workflow. No extra behavior may be built to support it. The existing submit-time validator (at least one line with quantity > 0 per sheet) stays as is. It is a sheet-level check on actual order lines. Blank cells are fine.

---

## 7. Morning Save (`POST /orders/sheet/:sheetId/morning-save`)

Body: `{ entries: [{ clientId, productId, deliveredQty? }], expectedUpdatedAt }`

**OD-7.1 Allowed only in NIGHT_SUBMITTED or REOPENED.** In NIGHT_SUBMITTED a morning save may update existing lines AND create new lines. In REOPENED it may only correct delivery on existing lines (OD-7.11).

**OD-7.2 Atomic, same transaction/retry rules as OD-6.2.** After sheet existence and workflow-state checks, the token is checked before transactional entry validation and mutation. Pre-transaction request-shape, duplicate-entry, and quantity precision/range validation follow OD-5.2, OD-5.3, OD-5.6 and OD-5.7. Nothing processed = true no-op (OD-6.4, OD-12.8): the current token is returned unchanged.

**OD-7.3 Existing line.** Existence of client and product is verified. Active status, group membership and category authorization are NOT re-enforced, because the order already exists and the client may have changed since. Negative and precision rules apply (OD-5).

**OD-7.4 Over-delivery is allowed.** Delivered may exceed ordered. There is no hard maximum relative to ordered. *(KEEP.)*

**OD-7.5 Over-delivery above 150% of ordered is a warning only.** During morning save, when a line's delivered quantity exceeds 150% of its ordered quantity, an informational warning is logged. It is logged only when the delivered value changes (a re-save with an unchanged value does not log again) and it is NOT logged again at morning submission. It never blocks the save or submission and needs no approval. It applies only where ordered > 0 (a morning-created line has ordered = 0, so it is not subject to this check). *(KEEP.)*

**OD-7.6 Morning may create new order lines, in NIGHT_SUBMITTED only (binding).** If the paper is NIGHT_SUBMITTED, and a valid client/product has **no existing line**, and an **explicit positive** delivered quantity is submitted, the system creates the line. This is NOT permitted when the paper is REOPENED (OD-7.11). The following rules apply:
- **Live validation as for night:** client active, in this sheet's group, authorized for the category; product active; product available on this sheet (OD-6.6).
- **Supplier** resolved exactly as night (Section 8).
- **Frozen config** captured exactly as night (OD-10.1): product link, tray type, units per order unit, pricing quantity and unit, owner distributor, fallback flag.
- **Pricing and GST:** live rate as of sale date, product's current GST % and inclusive flag. The rate is mandatory (OD-9.4).
- **Quantities:** `ordered_qty = 0`, `night_selling_rate = null`, `night_bill_amount = 0` (no customer night order exists). `delivered_qty` = submitted value.
- **Final billing** is computed with the same formula as every other final bill (Section 9.3).
- **Insert only.** Morning creation uses a plain INSERT, never an upsert, so a morning save can NEVER overwrite a locked night quantity. A uniqueness collision returns 409 (OD-6.12).
- Same transaction, same token, same tray-recalculation side effect.

**OD-7.7 Explicit 0 with no existing line creates nothing** and is a no-op. Blank/null never creates a line (OD-5.1).

**OD-7.8 Pricing source on morning save:**
- **Normal (non-reopened, or reopened line not yet validly billed):** live rate as of sale date (client rate, else distributor rate) plus the product's current GST % and inclusive flag. Missing rate fails the save: `No rate configured for client X product Y`. Exception: OD-7.12.
- **Reopened + line already billed with actual delivery (> 0):** original final rate, GST % and inclusive flag are retained (OD-9.6).

**OD-7.9 Side effects only on real work.** The "morning entry saved" flag (which flips the grid from ordered to delivered display) and tray recalculation run only if at least one entry was actually processed (an existing line updated or a new line created). An all-blank or all-zero-without-line request does not flip the grid view, advance the token, or run tray recalculation (OD-12.8).

**OD-7.10 Response** `{ success: true, message, itemsUpdatedAt }`.

**OD-7.11 REOPENED never creates lines (binding).** On a REOPENED paper, a morning save may only correct delivered quantities on lines that already exist. An explicit positive delivered quantity for a client/product with no existing line is rejected (400): `New order lines cannot be created while the paper is REOPENED. Reopened sheets allow delivery corrections to existing lines only.` The whole request fails and nothing is saved. An explicit `0` with no existing line remains a harmless no-op (OD-7.7). This is checked before any supplier or pricing work.

**OD-7.12 Cancelled lines need no live rate on morning save (binding).** A line is *previously cancelled* when its ordered quantity is 0 and it has a stored night rate (cancellation per OD-6.10 keeps the night rate; a morning-created line never has one). If a morning save sets such a line's delivered quantity to explicit `0`, no live rate is looked up or required. The save succeeds with delivered quantity 0, final taxable amount, GST amount and bill amount 0, and the line's existing final rate, GST % and inclusive flag (set by OD-6.10) unchanged. If a positive delivered quantity is entered for a cancelled line (NIGHT_SUBMITTED or REOPENED), the normal pricing rules apply (OD-7.8, OD-9.4). The exception applies only to previously cancelled lines, not to other lines whose quantity merely happens to be 0; those follow OD-7.8 / OD-9.6.

---

## 8. Supplier Resolution (night and morning-created lines)

**OD-8.1 Automatic.** Employees never choose a supplier. The system resolves it. *(KEEP.)*

**OD-8.2 Algorithm (binding, evaluated per client + product for NEW lines only):**
1. Find the client's **primary supplier** for the product's category. If the client has none, the order is rejected (OD-8.3).
2. Find distributors **allowed to supply** the product's brand + category + product group (active procurement rules held by an ACTIVE distributor; an inactive distributor is never eligible, OD-8.8). If none: `No eligible distributor found for product <id> in group <g>`.
3. Build the candidate list: the primary supplier (priority 0) if it is in the allowed set, plus any distributor that is in the allowed set AND listed as a fallback for this group + product (its configured priority number).
4. If the candidate list is empty: `No eligible supplier (primary or fallback) can supply product <p> for client <c> in group <g>`.
5. Walk candidates in ascending priority. Choose the **first with an active product link** for the product.
6. If nobody has an active link: `No product link found for any eligible distributor for product <p> in group <g>`.

**OD-8.3 A client with no primary supplier for the category cannot order that category (binding).** A client is eligible for a category only through its category record (`master_client_category`), which carries a required primary supplier (OD-15.3). If none exists the order is rejected with HTTP 400 `Missing <CATEGORY> supplier for client <id>`, before any fallback is considered. Fallback suppliers (OD-8.2, OD-8.4) apply only when the primary EXISTS but cannot supply the product: it is not an allowed supplier (OD-8.5) or has no active product link. A fallback never substitutes for a missing primary (OD-8.7). Otherwise an order is rejected only when no eligible supplier (primary or fallback) can supply the product.

**OD-8.4 Fallback flag.** If the chosen supplier is not the primary (because the primary is not an allowed supplier or has no active product link), the line is flagged `resolved_via_fallback = true` and a warning is logged.

**OD-8.5 A primary not in the procurement rules is silently skipped** (it is simply not a candidate). The same applies to a primary distributor that is inactive (OD-8.8).

**OD-8.6 Supplier is frozen per line (binding).** After a line exists, supplier/link changes in master data NEVER move that line. Subsequent saves reuse the line's stored product link. One client cannot hold the same product from two distributors on one sheet. *(KEEP.)*

**OD-8.7 Fallback never bypasses eligibility (binding).** Client and category authorization (OD-6.5c) is checked BEFORE supplier resolution. Supplier fallback only chooses WHO supplies an order that is already eligible. It can never make an unauthorized, inactive, or wrong-group client orderable, and it can never make an unavailable product orderable.

**OD-8.8 Inactive distributors are never selected for new lines (binding).** A distributor with `is_active = false` is not an eligible supplier for a NEW line (night-created or morning-created), even if its procurement rules and product links are still active. It is skipped like any other non-allowed distributor (OD-8.5): an inactive primary falls through to the fallback candidates (flagging `resolved_via_fallback`, OD-8.4); if no active distributor can supply, the errors of OD-8.2 apply. EXISTING lines keep their originally assigned supplier and product link (OD-8.6, OD-10.1) regardless of later deactivation.

---

## 9. Pricing, GST and Billing

**OD-9.1 Rate resolution (as of sale date, Asia/Kolkata business dates) (binding).** The sale date is a calendar date in the business timezone `Asia/Kolkata`. Validity is evaluated on calendar dates, not instants: each rate's stored effective-from / effective-to timestamp (a UTC instant) is read as the Asia/Kolkata calendar date it falls on. A rate is valid on the sale date when its effective-from date is on or before the sale date AND its effective-to is empty or its effective-to date is on or after the sale date.
1. Client's own active rate for the product link that is valid on the sale date. If several qualify, the latest effective-from wins.
2. Else the distributor's default selling rate for the product link, same validity rule.
3. Else none.
*Example, sale date 11 Oct: effective-from 11 Oct 10:00 IST is valid; effective-from 12 Oct 00:30 IST is not; effective-to 10 Oct 23:59 IST is not valid; effective-to 11 Oct 00:00 IST is valid.*

**OD-9.2 Night bill includes GST (binding).** The night bill uses the product's GST configuration and the SAME formula and rounding as the final bill (single shared implementation, `FinalBillingService`; `NightBillingService` delegates to it). `night_bill_amount` stores the **final amount (GST included)**. There are no separate night taxable/GST columns. Night and morning must never implement different GST rules.

**OD-9.3 Formulas (exact decimal arithmetic, 2-decimal half-up rounding).** Billed quantity = quantity (≤ 2 dp) × the line's frozen `pricing_quantity`.
- **GST-exclusive:** taxable = billed qty × rate. GST = taxable × GST%. Final = taxable + GST.
  *Example: qty 10, rate ₹100, 18% → taxable 1000, GST 180, final 1180.*
- **GST-inclusive:** final = billed qty × rate. Taxable = final ÷ (1 + GST%). GST = final − taxable.
  *Example: qty 10, rate ₹118, 18% → final 1180, taxable 1000, GST 180.*
- GST amount is always (rounded final − rounded taxable), so the three numbers always reconcile.
- Night example: crate with pricing quantity 12, rate ₹56 per litre, 10 crates, 0% GST → 10 × 12 × 56 = ₹6,720.

**OD-9.4 Missing rate fails the save (binding).** If a required rate cannot be resolved, the entire save fails and nothing is saved. Night: `No active rate found for product <id> on date <date>`. Morning: `No rate configured for client X product Y`. A rate is required for: any night entry with quantity > 0, and any morning entry that is processed under live pricing. A rate is NOT required for blank/null entries, nor for explicit 0 on a non-existent line. An explicit 0 on an existing line never looks up or requires a rate (OD-6.10): the line's stored night rate is kept as is. On morning save, a delivered quantity of 0 on a previously cancelled line likewise requires no rate (OD-7.12).

**OD-9.5 No manual price override (binding).** Employees cannot enter, change or override prices, rates, GST or amounts. All pricing is backend-controlled. *(KEEP.)*

**OD-9.6 Reopened + already billed keeps original pricing (binding).** On a REOPENED sheet, if a line already has a final rate, final GST % and a delivered quantity > 0, correcting the delivered quantity reuses the stored final rate, GST % and inclusive flag. It must not reprice with today's configuration. Lines billed before the inclusive flag was stored fall back to the product's current inclusive flag. A reopened line that was previously zero or never billed is priced at live rates.

**OD-9.7 Night GST freezing (as implemented).** Night GST uses the product's CURRENT GST % and inclusive flag each time the night line is saved. These are not frozen at night (no additional columns). This is the approved, binding behavior (OD-15.1 resolved): night GST must not be frozen.

---

## 10. Frozen Line Configuration

**OD-10.1 Frozen at line creation (night or morning-created) and never changed by later saves:** product link (supplier), tray type, units per order unit, pricing quantity, pricing unit, owner distributor (client's owner at creation), `resolved_via_fallback`.

**OD-10.2 Not frozen:** ordered quantity (until night submit), night rate and night bill (recomputed on each positive night save; a cancellation keeps the stored night rate, OD-6.10), delivered quantity and final fields (recomputed on morning saves, subject to OD-9.6).

**OD-10.3 Uniqueness.** One line per (sheet, client, product link) AND one per (sheet, client, product). A client cannot have two lines for the same product on one sheet.

---

## 11. Product Add / Remove (DRAFT only)

**OD-11.1 Suitability is NOT validated when adding a product (binding).** Adding a product does NOT check whether it suits every client on the route. Suitability (client authorization, supplier, link, rate) is validated when the employee attempts to order that product for a specific client. *(KEEP.)*

**OD-11.2 Add (`POST /orders/sheet/:sheetId/products`)**, body `{ productId, expectedUpdatedAt }`. Order of checks: sheet exists (404) → paper is DRAFT → **concurrency token check (OD-12)** → product not already explicitly added (`Product already exists in this sheet`) → product exists and is active → link created. Returns the refreshed sheet (including the new `itemsUpdatedAt`). Adding a product that is already default is allowed and harmless.

**OD-11.3 Remove (`DELETE /orders/sheet/:sheetId/products/:productId?expectedUpdatedAt=`)**. Order of checks: sheet exists (404) → DRAFT → **token check (OD-12)** → product exists → **default products can never be removed** (`Default products cannot be removed`) → blocked if any client has ordered quantity > 0 (`Cannot remove a product that already has ordered quantities. Set quantities to 0 first.`) → the explicit-add link (if one exists) and all leftover (zeroed) lines for that product on this sheet are deleted → if neither a link nor any line existed, `Product not found in this sheet` (400). A non-default product that was once a default or was never explicitly added can therefore be removed once no client has ordered quantity > 0. Default products can never be removed, even if deactivated. Returns the refreshed sheet.

**OD-11.4 Add and remove participate in the order-items concurrency token (binding).** They use the same `expectedUpdatedAt` / `itemsUpdatedAt` check as saves. A stale token returns the standard 409 conflict. *(KEEP.)*

---

## 12. Concurrency Token

**OD-12.1** The sheet's `order_items_updated_at` is the token. It is returned on sheet load and on every save/add/remove response path.

**OD-12.2 Matching.** A request must send the last token it saw. On a brand-new sheet whose token is empty, send explicit `null` (never omit the field, see OD-12.7). A mismatch returns 409 `Order data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.`

**OD-12.3 Shared token.** Night save, morning save, add product and remove product all use the same token. A change by any of them makes the others stale.

**OD-12.4 Save responses return the new token (binding).** Night-save and morning-save return `itemsUpdatedAt`: the newly generated token when data changed, or the unchanged current token for a no-op save (OD-12.8). The frontend replaces its local token with it and can save again WITHOUT reloading. Add/remove return the full sheet, which includes the new token. A stale token must still produce the 409 conflict.

**OD-12.5 Rollback.** The token is updated inside the same transaction as the data. If the save fails, the token is rolled back with it.

**OD-12.6 Malformed token.** An unparseable date returns 400 `Invalid expectedUpdatedAt`.

**OD-12.7 Omission is invalid; explicit `null` only for the initial mutation (binding).** `expectedUpdatedAt` is REQUIRED on every mutating endpoint (night-save, morning-save, add product, remove product).
- **Omitted → always 400**, on every endpoint. It is never treated as `null` and never defaulted.
- **Explicit `null`** is permitted only for the first mutation on a sheet whose token is still empty. If a token already exists, `null` produces the normal 409 stale-data conflict.
- **A value** must be ISO-8601 and equal the current token, else 409 (or 400 if malformed, OD-12.6).
- **JSON bodies (night-save, morning-save, add product):** send `"expectedUpdatedAt": null` for an explicit null. The `ExpectedUpdatedAt` decorator skips validation only for `null`, and the DTOs do NOT use `@IsOptional()`, so an omitted field fails DTO validation (`expectedUpdatedAt should not be null or undefined`).
- **Query string (remove product):** a query string cannot carry a JSON null, so explicit null is the literal text `expectedUpdatedAt=null`. The controller converts exactly the string `null` into a null token before calling the service. Any other value is parsed as a date (unparseable → 400 `Invalid expectedUpdatedAt`; parseable but different from the current token → 409). A missing `expectedUpdatedAt` parameter returns 400 `expectedUpdatedAt is required. Send the last itemsUpdatedAt, or the literal "null" if the sheet has never been saved.`
- Do not change this contract without a new decision.

**OD-12.8 No-op saves never advance the token (binding).** For night-save and morning-save:
1. The supplied token is compared with the current token FIRST. A mismatch is 409 even if the request would otherwise be a no-op.
2. A request is a no-op when no entry is processed. Processed means an entry that targets an existing line (any explicit quantity, including 0) or creates a new line (explicit quantity > 0). Not processed: blank/null/omitted entries, and explicit 0 for a client/product with no line.
3. On a no-op with a matching token: respond success with the CURRENT `itemsUpdatedAt` (null if the sheet has never been saved). Do not update the token, do not set the morning-entry-saved flag, do not run tray recalculation or any dependency propagation.
4. Only a request that processes at least one entry advances the token (once per request), inside the same transaction as the data change.
5. Any save that targets an existing line counts as a data change even if the submitted values equal the stored ones, because the line is rewritten and its `updated_at` changes. Employees should send only cells they changed.
Reason: an empty or meaningless request must not invalidate another editor's valid token.

---

## 13. Submission and Finalization Gates (validators owned by Orders)

**OD-13.1 Night submit.** Every sheet must have at least one line with ordered quantity > 0: `No orders entered for sheet "<group>". Please enter at least one order before submitting.` The check operates on actual lines. Blank cells are fine. Employees need not enter zeros.

**OD-13.2 Morning submit: empty sheet is rejected (binding).** A sheet with NO order lines fails: `No order lines exist for sheet "<group>". A sheet with no orders cannot be submitted.`

**OD-13.3 Morning submit: completeness.** Every existing line must have a delivered quantity (not null): `Delivered quantity missing for: <product codes>`. Morning submission operates on actual order lines. It does NOT require zeros for clients/products with no line.

**OD-13.4 Sanity.** Negative delivered quantities block (`Negative quantities not allowed`). Over-delivery above 150% is only a warning, logged at morning save and never at submission (OD-7.5).

**OD-13.5 Empty grid ≠ empty sheet.** An individual blank client row or product cell is normal. A sheet is "empty" only when it has zero order lines.

**OD-13.6 First-morning-save practical rule.** Before the first morning save, the grid shows ordered quantities pre-filled but they are not stored as delivered. Because morning submit requires every line to have a delivered value, the frontend must send a delivered quantity for EVERY existing line on the first morning save. (Previously cancelled lines already hold delivered quantity 0 from OD-6.10; sending 0 for them needs no rate, OD-7.12.)

---

## 14. HTTP Status Conventions

**OD-14.1 Sheet not found is 404 everywhere** (sheet view, items, add product, remove product, night save, morning save). *(Previously 400 in some endpoints.)*

| Situation | Status |
|---|---|
| Format/validation errors, wrong paper status, business rule rejection (precision, product not on sheet, no supplier, no rate, no line to remove, etc.) | 400 |
| Sheet not found | 404 |
| Stale token, serialization retry exhausted, unique-constraint race, client-tray return discrepancy (OD-6.13, CT-6.6) | 409 |
| Not authenticated / lacks role | 401 / 403 |
| Throttled | 429 |

**OD-14.2** Client or product not found inside an entry is 400 (`Client with ID X not found`, `Product with ID X not found`).

---

## 15. Open Items and Resolved Items

No item is currently open. A new ambiguity must be recorded here and decided before any code change.

**OD-15.1 RESOLVED.** Night GST is NOT frozen. It uses the product's current GST % and inclusive flag on each night save (OD-9.7). (ID retained so references stay stable.)

**OD-15.2 RESOLVED.** Morning-created lines are allowed in NIGHT_SUBMITTED only and are rejected on REOPENED. See OD-7.6 and OD-7.11. (ID retained so references stay stable.)

**OD-15.3 RESOLVED.** A client is eligible for a category only if it has a category record with a primary supplier. A client without one cannot order that category, and fallback never bypasses this (OD-8.3, OD-8.7). Because the primary supplier is a required column, this state is not normally reachable; the `Missing <CATEGORY> supplier` rejection is kept as a guard. (ID retained so references stay stable.)

**OD-15.4 RESOLVED.** Only the GST-inclusive night total is stored; no separate night taxable/GST amounts are persisted (OD-9.2). (ID retained so references stay stable.)

---

## 16. Change Log (this version)

| ID | Type | Summary |
|---|---|---|
| OD-5.2 | Changed | 2-decimal maximum for all quantities, rejected not rounded |
| OD-6.6 | Changed | Product must be default/added/already on sheet before ordering |
| OD-8.3 | Changed | A client with no primary supplier for the category cannot order it (rejected). Fallbacks apply only when a primary exists but cannot supply the product |
| OD-9.2 | Changed | GST included in the night bill, one shared formula |
| OD-13.2 | Changed | Empty sheet blocked at morning submission |
| OD-7.6 / 7.11 | Changed | Morning may create new lines (insert-only, fully frozen), in NIGHT_SUBMITTED only. REOPENED allows delivery corrections to existing lines and rejects new lines |
| OD-11.4 | Changed | Add/remove product use the concurrency token |
| OD-12.4 | Changed | Save responses return the new `itemsUpdatedAt` |
| OD-14.1 | Changed | Sheet not found = 404 everywhere |
| OD-6.5 / 3.2 / 6.6 | Changed | Live eligibility checks apply only to NEW lines. Existing lines stay updatable/cancellable after client or product deactivation or group change |
| OD-6.4 / 7.2 / 12.8 | Changed | No-op saves return the current token unchanged. Stale token still 409. No token advance, morning flag or tray recalculation |
| OD-8.7 / 15.3 | Clarified | Fallback never bypasses authorization. OD-15.3 resolved: no primary supplier means not eligible (see OD-8.3) |
| OD-6.10 / 9.4 / 10.2 | Changed | Cancelling a line keeps its stored night rate (never re-resolved; 0 if none stored). An explicit 0 on an existing line never needs a rate |
| OD-12.7 | Clarified | Controller converts exact `null` query string to a null token |
| OD-12.7 | Changed | Omitted `expectedUpdatedAt` is always 400 (including remove product); explicit `null` only for the first mutation; remove product sends literal `null` in the query string |
| OD-5.1 | Clarified | Sparse entry: null/blank/omitted = no operation; explicit 0 keeps its meaning |
| OD-3.1, 11.1, 2.2, 2.3, 7.4, 7.5, 8.1, 8.6, 9.4, 9.5, 9.6, 6.15 | Kept | Existing behavior confirmed as business rules |
| OD-6.2 | Clarified | Max 3 total attempts (1 initial + 2 retries), then 409 (D1) |
| OD-8.2 / 8.5 / 8.8 | Changed | Inactive distributors never selected for new lines; existing lines keep their supplier (D2) |
| OD-7.12 / 7.8 / 9.4 / 13.6 | Changed | Delivered 0 on a previously cancelled line needs no live rate (D3) |
| OD-6.6 | Clarified | "Already has a line" means any client on the sheet; other checks stay independent (D4) |
| OD-11.3 | Changed | Remove deletes link if present plus zeroed lines; error only if neither existed; defaults never removable (D5) |
| OD-9.1 | Changed | Rate validity evaluated on Asia/Kolkata calendar dates (D6) |
| OD-3.7 | Documented | Milk grid has no packaging level by design (D7) |
| OD-7.5 / 13.4 | Changed | Over-delivery warning logged at morning save when the value changes, not at submission (D8) |
| OD-6.13 | Changed | Tray rounding is aggregate-then-round (CT-6.4), replacing per-line rounding (D9). A client-tray return discrepancy (CT-6.6) refuses the order save with 409 |
| OD-9.7 / 15.1 / 15.4 | Resolved | Night GST not frozen; only GST-inclusive night total stored (D10a/b) |