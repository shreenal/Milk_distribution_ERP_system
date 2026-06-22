# Cash Settlement Module

## Overview
The Cash Settlement Module tracks physical cash received by the office, route-level expenses, cash denominations, direct collections, and bank deposits.
During the first morning close, the module acts as the final cash settlement step before morning submission.
After reopen, the module acts as a historical cash reference and difference-reporting screen rather than a fresh denomination-entry workflow.
It ensures that all physical cash received by the business is accounted for through denomination tracking and deposit reconciliation.

## Purpose
The module answers the following business questions:
* How much physical cash was received by each route?
* What expenses were incurred by each route?
* How much cash actually reached the office?
* What denominations were received?
* How much cash was collected directly by office employees?
* How much cash was deposited into banks?
* How much cash remains in hand after deposits?
* Do the original cash records reconcile correctly during first close?
* If a paper is reopened later, what difference exists between revised accounting totals and historical cash records?

## Workflow Position

Cash Settlement is part of the morning workflow and runs after collection cash values are available.

DRAFT
    ↓
NIGHT_SUBMITTED
    ↓
Morning workflow modules complete
    - Morning Orders
    - Trays
    - Morning Collections
    - Purchases
    ↓
Cash Settlement
    ↓
MORNING_SUBMITTED

Cash Settlement depends on Collections for:
- office_amount_given
- cash_collection

Client online collections and client bank deposits recorded in Collections are excluded from Cash Settlement because they do not represent physical office cash received by the office.


Cash Settlement depends on collection cash values being available from Collections:
- `office_amount_given`
- `cash_collection`
Cash Settlement must be completed before the paper can transition to MORNING_SUBMITTED during the first close workflow.


### Reopened Paper Workflow

When a paper is reopened:
- Collections and other business modules may still be corrected according to their own workflow rules.
- Cash Settlement does not restart as a fresh data-entry workflow.
- route denominations, direct collections, and bank deposits remain historical and read-only.
- route expenses remain editable.
- Revised route cash totals may change because collection data changed elsewhere and route expense corrections were made in Cash Settlement.
- Cash Settlement displays the difference between revised cash totals and historical cash records.

## Cash Inputs
The module receives cash information from three sources.

### 1. Night Collections
* **Source:** Collections Module
* **Field:** `office_amount_given`
* **Description:** Represents physical cash received by the office during night collection activities.

### 2. Morning Collections
* **Source:** Collections Module
* **Field:** `cash_collection`
* **Description:** Represents physical cash received by the office during morning collection activities.

### 3. Direct Collections
* **Source:** Cash Settlement Module
* **Description:** Represents cash collected directly from clients by office staff.
* **Examples:**
  * Owner
  * Employee A
  * Employee B
  * Employee C

Direct collections are not associated with delivery routes.

Direct collections are paper-level cash rows linked to order_paper, not to order_sheet.


## Supported Denominations

The system tracks note counts for:

- 2000
- 500
- 200
- 100
- 50
- 20
- 10
- Coins

Denomination totals are calculated automatically from note counts.

## Bank Deposit Denominations

Bank deposits are entered using denomination counts.

Example:

500 × 20
200 × 15

The deposit amount is calculated automatically from the entered note counts.

Deposit denominations represent the physical notes selected for deposit.

## Business Flow

### Route Cash Flow
```
office_amount_given
+
cash_collection
-
route_expenses
=
route_net_cash
```

### First Close Office Cash

```
Office Cash
=
Total Route Net Cash
+
Total Direct Collections
```

### Deposit Flow
```
  Office Cash
- Bank Deposits
= Remaining Cash

```
### Revised Office Cash

```

**Reopened paper revised cash view**

Revised Office Cash
=
Total Route Net Cash
+
Historical Direct Collection Cash

```

### Historical Cash On Hand
```
Historical Cash On Hand
=
Historical Route Denomination Cash
+
Historical Direct Collection Cash
-
Total Deposits

```

### Reconciliation Difference
```
Reconciliation Difference
=
Revised Office Cash
-
Historical Cash On Hand
```

## Module Sections

The Cash Settlement Module consists of five sections:

1. **Route Cash Settlement**  
   Tracks route-level cash receipts and expenses.

2. **Route Denominations**  
   Tracks denomination counts received from each route.

3. **Direct Collections**  
   Tracks cash collected directly by office staff.

4. **Bank Deposits**  
   Tracks cash selected for bank deposits and the denominations being deposited.

5. **Cash Summary**  
   Provides office-wide cash reconciliation and totals.



## Cash Settlement Workflow


### Step 1 - Route Collection Values Available
Cash Settlement consumes route cash values from Collections:
- `office_amount_given`
- `cash_collection`

These values must be available before final cash reconciliation for the paper.

Required fields:
* Night Collections
  - office_amount_given
* Morning Collections
  - cash_collection

### Step 2 - Route Settlement
For each route:
Route Cash = office_amount_given + cash_collection
Expenses are entered against the route.
Route Net Cash = Route Cash - Route Expenses

### Step 3 - Route Denominations
Physical notes received from the route are counted.

The denomination total must equal Route Net Cash.

### Step 4 - Direct Collections
Direct collections received by office staff are entered.

These collections are not associated with routes.

### Step 5 - Bank Deposits
Cash selected for bank deposits is entered.

Deposit denominations determine the deposit amount.

### Step 6 - Cash Summary


The summary calculates paper-level cash totals.

During normal first close, the summary represents the current day's cash settlement.

After reopen, the summary compares:
- revised route-side cash totals based on corrected collection and expense data
with
- historical denomination / direct collection / bank deposit records captured during the original close.

The summary exposes:
- Total Route Cash
- Total Route Expenses
- Total Route Net Cash
- Historical Route Denomination Cash
- Historical Direct Collection Cash
- Revised Office Cash
- Historical Cash On Hand
- Total Deposits
- Reconciliation Difference


## Data ownership rule

Route settlement does not persist copies of `office_amount_given` or `cash_collection`.

Cash Settlement is a consumer of Collections data and does not own collection amounts.

These values are always sourced from the Collections Module.

### Validation Rules During First Morning Close

#### Route Settlement Validation
```
Route Net Cash
=
office_amount_given
+
cash_collection
-
expense_total
```
#### Route Denomination Validation

```
Route Denomination Total
=
Route Net Cash
```

#### Direct Collection Validation

```
Direct Collection Amount
=
Sum of denomination values
```

#### Bank Deposit Amount Validation

```
Deposit Amount
=
Sum of deposited denomination values
```

#### Deposit Total Validation

```
Total Deposits
<=
Office Cash
```

#### Deposit Denomination Validation

```
For every denomination:
Deposited Note Count
<=
Available Note Count

Available Note Count
=
Route Denomination Counts
+
Direct Collection Counts

```

### Validation Rules After Reopen

After a paper is reopened, Cash Settlement splits into two parts:

#### Revised side
- route expenses remain editable
- revised route net cash is recalculated from:
  - current collection values from Collections
  - current route expense totals from Cash Settlement

#### Historical side
The following cash rows remain historical and are not re-entered or revalidated against revised cash totals:
- route denomination rows
- direct collection rows
- bank deposit rows

Therefore, after reopen:
- route denomination totals are not forced to match revised route net cash
- historical bank deposits are not forced to remain within revised office cash
- historical deposit denomination counts are not revalidated against revised denomination availability

The purpose of reopened Cash Settlement is to show the difference between revised accounting totals and historical cash records captured during the original close.

## Edit Rules

### Normal Workflow
```
DRAFT
- Cash Settlement not editable

NIGHT_SUBMITTED
- Route Expenses editable
- Route Denominations editable
- Direct Collections editable
- Bank Deposits editable

MORNING_SUBMITTED
- Locked

FINALIZED
- Locked
```

### Reopened Paper

REOPENED
- Route Expenses editable
- Route Denominations read-only
- Direct Collections read-only
- Bank Deposits read-only


## Reopen Behavior

Cash Settlement behaves differently after a paper is reopened.

During the first morning close, the module is used to enter and validate:
- route expenses
- route denomination counts
- direct collections
- bank deposits

After a paper is reopened:
- route denominations remain historical and read-only
- direct collections remain historical and read-only
- bank deposits remain historical and read-only
- route expenses remain editable
- collection corrections may change revised route cash totals
- the module shows the difference between revised cash expectations and historical cash records


#### Historical Corrections After Reopen

When a paper is reopened:
- route cash may change because collection amounts are corrected
- expense total may change because route expenses remain editable after reopen
- route net cash may therefore change

However, the following cash records remain historical:
- route denomination counts stored in cash_route_settlement
- direct collection rows stored in cash_direct_collection
- bank deposit rows stored in cash_bank_deposit

These historical cash rows are not automatically recomputed or re-entered after reopen.

As a result, reopened papers may show a difference between:
- revised route / office cash expectations
and
- historical cash records captured during the original close

This difference is retained for audit and reconciliation visibility.

#### Direct Collections Freeze After Reopen

Direct collection denomination rows represent the physical cash recorded during the original close.

When a paper is reopened:
- direct collection rows are not edited again
- denomination counts are not reconstructed
- direct collection rows remain as historical cash records from the original close


#### Bank Deposits Freeze After Reopen

Bank deposit rows represent the cash that was historically selected and deposited during the original close.

When a paper is reopened:
- bank deposit rows remain unchanged
- deposited denomination counts are not re-entered
- deposit rows remain historical records even if revised office cash later changes because collections or route expenses were corrected


## Route Expenses

Route expenses are recorded as individual expense lines.

Examples:

- Tea
- Loader
- Diesel
- Parking
- Repair

Expense types are managed through master_expense_type.

Expense Total
=
Sum of all route expense lines.


## Data Model

### Overview
The Cash Settlement Module stores route-level cash settlements, route expenses, direct collections, and bank deposits for a single paper.
The module is paper-centric and follows the same design pattern as Purchase and Vehicle Allocation.

### Route Identification

Routes are represented by order sheets.

Each route participating in a paper already has a corresponding order_sheet record.

Therefore:

order_sheet
1 → 1
cash_route_settlement

Cash Settlement does not introduce a separate route entity.

Relationship:

order_paper
│
├── cash_direct_collection
├── cash_bank_deposit
│
└── order_sheet
        │
        └── cash_route_settlement
                │
                └── cash_route_expense


### Historical Cash Records

The following tables act as close-day cash records and remain historically preserved after reopen:
- cash_route_settlement denomination fields
- cash_direct_collection
- cash_bank_deposit

These records capture the physical cash state recorded during the original close.
After reopen, revised accounting totals may change, but these historical cash rows are not regenerated.

### Route Cash Settlement

Represents the cash settlement for a single delivery route.

There is one Route Settlement record for each order sheet.

#### Relationship

order_sheet
1 → 1
cash_route_settlement
Uses:
* office_amount_given
* cash_collection

from Collections Module

#### Calculations
Route Cash = office_amount_given + cash_collection

Route Net Cash = Route Cash - Expense Total

#### Denominations
The following denominations are tracked:
* 2000
* 500
* 200
* 100
* 50
* 20
* 10
* Coins

The denomination total is calculated automatically.

#### Validation
During first morning close:
- Denomination Total must equal Route Net Cash

After reopen:
- historical denomination rows remain unchanged
- denomination totals are not forced to match revised route net cash

#### Historical Corrections

When a paper is reopened and route-side cash inputs are corrected:
* collection amounts may change through the Collections Module
* route expense entries may change through Cash Settlement
* route net cash is recalculated from the revised values

However:
* historical denomination counts are not modified automatically
* historical denomination counts remain as originally recorded

Therefore, route denomination totals may differ from revised route net cash after reopen.

Example:
* **Expected Route Cash** = 55,000
* **Recorded Denominations** = 50,000
* **Difference** = 5,000

This difference is retained for audit purposes.

### Route Expenses
Represents individual expenses incurred by a route.

#### Relationship
cash_route_settlement
1 → N
cash_route_expense


#### Purpose
Stores detailed expense records instead of a single expense total.

Examples:
* Tea
* Loader
* Diesel
* Parking
* Repair

#### Expense Type Source
Expense categories are managed through:
* `master_expense_type`

#### Expense Total
Expense Total = SUM(route expenses)


### Direct Collections
Represents cash collected directly from clients by office staff.
Direct collections are independent of route settlements and do not have route expenses.


#### Relationship

order_paper
1 → N
cash_direct_collection


#### Employee Source
Collectors are selected from:
* `master_employee`

#### Denominations
The following denominations are tracked:
* 2000
* 500
* 200
* 100
* 50
* 20
* 10
* Coins

Collection amounts are calculated automatically from denomination counts.

### Denomination Storage

Denominations are stored as fixed columns rather than normalized rows.

Supported fields:

- note_2000
- note_500
- note_200
- note_100
- note_50
- note_20
- note_10
- coins

This approach simplifies AG Grid integration, validation, reporting, and calculations because supported denominations are fixed.

### Bank Deposits
Represents cash selected for deposit into a bank.
Deposits may be made using cash originating from routes, direct collections, or a combination of both.

#### Relationship

order_paper
1 → N
cash_bank_deposit


#### Bank Source
Banks are selected from:
* `master_bank`

#### Deposit Structure
Each record represents a single deposit transaction.
Deposit 1
→ SBI

Deposit 2
→ HDFC


#### Denominations
Deposits are entered using denomination counts.

Example:
* 500 × 20
* 200 × 15
* 100 × 10

The deposit amount is calculated automatically.

#### Validation
For every denomination:
Deposited Note Count <= Available Note Count


Example:
* **Available:** 500 × 100
* **Invalid:** 500 × 120

### Cash Summary

The Cash Summary section is calculated automatically.

It behaves differently in first close and reopen mode.

#### First Close Summary
Shows the current day's settlement totals:
- Total Route Cash
- Total Route Expenses
- Total Route Net Cash
- Total Direct Collections
- Office Cash
- Total Deposits
- Remaining Cash

#### Reopened Summary
Shows revised accounting totals against historical cash records:
- Total Route Cash
- Total Route Expenses
- Total Route Net Cash
- Historical Route Denomination Cash
- Historical Direct Collection Cash
- Revised Office Cash
- Total Deposits
- Historical Cash On Hand
- Reconciliation Difference

#### Summary Fields

##### Total Route Cash
Sum of route cash across all routes.

##### Total Route Expenses
Sum of all route expenses across all routes.

##### Total Route Net Cash
Total Route Cash - Total Route Expenses

##### Historical Route Denomination Cash
Sum of all route denomination totals recorded in cash_route_settlement.

##### Historical Direct Collection Cash
Sum of all direct collection denomination totals recorded in cash_direct_collection.

##### Revised Office Cash
Total Route Net Cash + Historical Direct Collection Cash

##### Total Deposits
Sum of all historical bank deposit amounts recorded in cash_bank_deposit.

##### Historical Cash On Hand
Historical Route Denomination Cash
+
Historical Direct Collection Cash
-
Total Deposits

##### Reconciliation Difference
Revised Office Cash
-
Historical Cash On Hand

#### Reopen Editing Rule

Route expenses remain editable after reopen.

This allows corrected expense entries to adjust revised route net cash without modifying historical denomination, direct collection, or bank deposit records.


## Relationship with Collections Module

The Collections Module contains a collection type named `bank_deposit`.

This represents money deposited directly into the company's bank account by clients.

Example:

Client A
→ Deposits ₹5,000 into SBI

This is different from Cash Settlement bank deposits.

Cash Settlement bank deposits represent physical cash received by the office and subsequently deposited into a bank by the company.

Example:

Office Cash ₹50,000
→ Deposited into SBI
