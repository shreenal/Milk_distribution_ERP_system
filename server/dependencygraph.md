# Milk Distribution ERP
# Business Dependency Architecture

> Version: 1.0
>
> Purpose:
> This document captures the **business dependency graph** of the ERP.
> It intentionally ignores UI, controllers and implementation details and focuses only on:
>
> - Source of truth
> - Business ownership
> - Upstream dependencies
> - Downstream dependencies
> - Regeneration behavior
> - REOPENED implications

---

# 1. Dependency Philosophy

Every business module belongs to one of four categories.

## A. Root Entities

Business facts entered directly by users that originate business data.

Examples

- Orders
- Purchase
- Collections


## B. Planning Entities

Business decisions created from reference data.

These are initially generated using upstream information but become
independent business facts once saved.

Example

- Vehicle Allocation

---

## C. Hybrid Entities

Contain both

- derived values
- manually entered values

Example

- Client Tray Tracking
- Dairy Tray Tracking

---

## D. Derived Entities

Never edited directly.

Always regenerated from upstream entities.

Examples

- Billing
- Distributor Transfer
- Purchase Variance
- Derived Summary
- Reports


Cash Settlement is a hybrid business module containing
persisted business entities and a derived summary.

---

# 2. Complete Business Dependency Graph

```
                                       ORDERS
                             ordered_qty / delivered_qty
                                   │
                ┌──────────────────┼──────────────────────┐
                │                  │                      │
                ▼                  ▼                      ▼
      Allocation Summary      Billing            Distributor Transfer
                │                                     (derived)
                ▼
       Vehicle Allocation
                │
                ▼
           Purchase Entry
                │
        ┌───────┴──────────────┐
        ▼                      ▼
 Purchase Variance      Dairy Tray Tracking
                                │
                                ▼
                     Next Day Dairy Opening


delivered_qty
      │
      ▼
Client Tray Tracking
      │
      ▼
Next Day Client Opening


Collections
      │
      ▼
Route Cash
      │

Route Expenses
      │

Route Denominations
      │

Direct Collections
      │

Bank Deposits
      │
      ▼
Cash Settlement Summary
```

---

# Data Flow Types

Reference Data

- Allocation Summary
- Purchase Prefill

Persisted Business Data

- Orders
- Vehicle Allocation
- Purchase
- Collections

Persisted Calculated Fields

- Bill Amount
- GST
- Purchase Amount

Hybrid Business Data

- Client Tray Tracking
- Dairy Tray Tracking

Derived Artifacts

- Billing
- Distributor Transfer
- Purchase Variance
- Reports

---

# 3. Module Analysis

---

# Orders

## Business Entity

```
order_sheet_items
```

---

## Manual Fields

```
ordered_qty

delivered_qty
```

---

## Persisted Calculated Fields

```
night_bill_amount

final_bill_amount

gst

taxable_amount
```

---

## Upstream Dependencies

None.

Orders is a root business entity.

---

## Downstream Dependencies

```
Billing

Vehicle Allocation Summary

Distributor Transfer

Client Tray Tracking
```

---

## Source of Truth

```
ordered_qty

delivered_qty
```

---

## REOPENED Impact

Changing

```
delivered_qty
```

invalidates

```
Billing

Distributor Transfer

Client Tray Tracking

Allocation Summary
```

---

# Vehicle Allocation

## Business Entities

```
vehicle_distribution_assignment

vehicle_allocation
```

---

## Manual Fields

```
Vehicle

Distributor

Allocated Qty
```

---

## Reference Data

Generated from

```
Allocation Summary
```

which itself comes from Orders.

The summary is NOT persisted.

---

## Upstream Dependencies

```
Orders

↓

Allocation Summary
```

---

## Downstream Dependencies

```
Purchase
```

---

## Source of Truth

```
vehicle_allocation
```

NOT

Allocation Summary.

---

## REOPENED Impact

Orders may change.

Vehicle Allocation is **not automatically regenerated** because it represents
human planning decisions.

Reference summary is regenerated.

Saved allocations are preserved.

User decides whether allocations require revision.
---

# Purchase

## Business Entity

```
purchase_entry
```

---

## Manual Fields

```
purchased_qty

gatepass_date
```

---

## Reference Dependencies

```
Vehicle Allocation (prefill)

Vehicle Assignments

Distributor Product Links

Distributor Rates
```

---

## Persisted Calculated Fields

```
purchase_rate

purchase_amount
```

---

## Derived Artifacts

```
Purchase Variance
```

---

## Downstream Dependencies

```
Dairy Tray Tracking

Purchase Variance
```

---

## Source of Truth

```
purchase_entry
```

---

# Client Tray Tracking

## Business Entity

```
client_tray_transaction
```

---

## Manual Field

```
trays_returned
```

---

## Derived Fields

```
opening_balance

trays_taken

closing_balance
```

---

## Dependency

```
Orders.delivered_qty

↓

Tray Rules

↓

trays_taken
```

---

## Cross-Day Dependency

```
Yesterday Closing

↓

Today's Opening

↓

Today's Closing

↓

Tomorrow Opening
```

---

## REOPENED Impact

Changing

```
delivered_qty
```

changes

```
trays_taken

closing_balance

future opening balances
```

---

# Dairy Tray Tracking

## Business Entity

```
dairy_tray_transaction
```

---

## Manual Field

```
trays_returned
```

---

## Derived Fields

```
opening_balance

trays_taken

closing_balance
```

---

## Dependency

```
Purchase

↓

Tray Rules

↓

trays_taken
```

---

## Cross-Day Dependency

```
Yesterday Closing

↓

Today's Opening

↓

Today's Closing

↓

Tomorrow Opening
```

---

## REOPENED Impact

Changing Purchase changes

```
trays_taken

closing_balance

future opening balances
```

---

# Collections

## Business Entity

```
client_collection
```

---

## Manual Fields

Night

```
office_amount_given
```

Morning

```
cash_collection

cheque_collection
```

Admin

```
online_collection

bank_deposit
```

---

## Derived Fields

```
employeeTotal

adminTotal

grandTotal
```

These are UI calculations only.

---

## Downstream Dependency

```
Cash Settlement
```

---

## Source of Truth

```
client_collection
```

---

# Cash Settlement

## Business Entities

```
cash_route_settlement

cash_route_expense

cash_direct_collection

cash_bank_deposit
```

---

## Manual Fields

Route Expenses

```
Expense

Amount
```

Route Denominations

```
Currency Counts
```

Direct Collections

```
Employee

Currency Counts
```

Bank Deposits

```
Bank

Currency Counts
```

---

## Persisted Data

```
Route Expenses
Route Denominations
Direct Collections
Bank Deposits
```

## Derived Summary

```
Route Cash
Route Net Cash
Office Cash
Cash In Hand
Reconciliation Difference
```

---

## Upstream Dependency

```
Collections
```

---

## REOPENED

Historical cash is preserved.

Expected cash is recalculated.

Difference is shown as

```
Reconciliation Difference
```

instead of rewriting history.

---

# Distributor Transfer

## Business Entity

```
distributor_transfer
```

---

## Manual Fields

None.

---

## Source

```
Orders.delivered_qty
```

---

## Lookup Dependencies

```
Supply Rules

Billing Group

Owner Distributor
```

---

## Downstream

Reports only.

---

## Regeneration

Always safe.

Entire module can be deleted and regenerated.

---

# Purchase Variance

## Source

```
Allocated Qty

vs

Purchased Qty
```

---

No independent business data.

Always regenerated.

---

# Billing

## Source

```
ordered_qty (Draft)

delivered_qty (Submitted)
```

---

Always regenerated.

---

# 4. Classification Matrix

| Module             | Category | Source of Truth             | Regeneratable | Cross-Day |
| ------------------ | -------- | --------------------------- | ------------- | --------- |
| Orders             | Root     | ordered_qty, delivered_qty  | No            | No        |
| Vehicle Allocation | Planning | vehicle_allocation          | No            | No        |
| Purchase           | Root     | purchase_entry              | No            | No        |
| Client Tray        | Hybrid   | returned + derived balances | Partial       | Yes       |
| Dairy Tray         | Hybrid   | returned + derived balances | Partial       | Yes       |
| Billing            | Derived  | Orders                      | Yes           | No        |
| Collections        | Root     | client_collection               | No            | No        |
| Distributor Transfer | Derived  | Orders                        | Yes           | No        |
| Purchase Variance    | Derived  | Purchase + Vehicle Allocation | Yes           | No        |
| Cash Settlement      | Hybrid   | Settlement tables             | Partial       | No        |


---

# 5. Cross-Day Dependencies

Only two modules affect future papers.

```
Client Tray Tracking
```

```
Client Tray Closing Balance

↓

Next Day Client Tray Opening Balance
```

---

```
Dairy Tray Tracking
```

```
Dairy Tray Closing Balance

↓

Next Day Dairy Tray Opening Balance
```

Everything else is confined to a single Order Paper.

---

# 6. REOPENED Impact Matrix

| Changed Entity     | Invalidates                | Auto Regenerate | Manual Review | Cross-Day |
| ------------------ | -------------------------- | --------------- | ------------- | --------- |
| Orders             | Billing                    | ✓               | ✗             | ✗         |
| Orders             | Distributor Transfer       | ✓               | ✗             | ✗         |
| Orders             | Client Tray Tracking       | ✓               | ✗             | ✓         |
| Orders             | Vehicle Allocation Summary | ✓               | ✗             | ✗         |
| Vehicle Allocation | Purchase                   | ✗               | ✓             | ✗         |
| Purchase           | Dairy Tray Tracking        | ✓               | ✗             | ✓         |
| Purchase           | Purchase Variance          | ✓               | ✗             | 
✗         |
| Collections        | Cash Settlement Summary    | ✓               | ✗             | ✗         |


---

# 7. Core Architectural Principle

Every module follows one lifecycle.

```
Reference Data
        │
        ▼
User enters business facts
        │
        ▼
Persistent Business Entity
        │
        ▼
Derived Artifacts
```

Example

```
Orders
        │
        ▼
Allocation Summary
        │
        ▼
Vehicle Allocation
        │
        ▼
Purchase
        │
        ▼
Dairy Tray Tracking
```


# 8. Architectural Invariants

1. Reference data is never persisted.

2. Business entities are never regenerated automatically.

3. Hybrid entities preserve manual inputs while recalculating derived values.

4. Derived artifacts are always disposable and regeneratable.

5. Cross-day entities propagate only through opening balances.

6. Workflow State controls edit permissions only; it never owns business data.


The fundamental design rule is:

- **Root entities** preserve business facts.
- **Planning entities** preserve operational decisions.
- **Hybrid entities** combine derived values with manual corrections.
- **Derived entities** are disposable and should always be regenerated from their upstream sources.