Based strictly on the code you provided, I would fill it like this:

# BUSINESS DEPENDENCY REGISTER

## Dependency: orders → vehicle-allocations

**Dependency ID:**  
DEP-001

**Source Module:**  
orders

**Target Module:**  
vehicle-allocations

**Dependency Type:**  
CONSUMPTION

**Trigger:**  
ON_READ

**What does the target need from the source?**  
Vehicle Allocation needs the current ordered quantities and their supply context to determine what quantities are available/required for allocation to vehicles for the selected delivery session.

**Source data:**
- `order_item.orderedQty`
- `order_item.productId`
- `order_item.groupId`
- `order_item.distributorId`
- `order_item.category`
- `order_item.deliverySession`
- Product/brand information associated with the order item
- Group information associated with the order item

**Target uses it for:**  
Vehicle Allocation filters the order items by `DeliverySession`, groups them by distributor/category/brand, aggregates ordered quantities by group and product, and uses the resulting summary to construct the vehicle-allocation grid and allocation requirements.

**Direct or Transitive:**  
DIRECT

**Session-aware:**  
YES

**Session relationship:**  
NIGHT → NIGHT / MORNING → MORNING

The selected Vehicle Allocation session is passed into the order-item summary builder, which only includes order items belonging to that session.

**What happens when source changes?**  
The Vehicle Allocation requirements are recalculated when the allocation data is read. Since the allocation summary is built from the current order items, a change to ordered quantity, product, group, distributor, category, or delivery session can change the allocation grid for that session.

There is no propagation operation shown that automatically updates persisted vehicle-allocation records when an order changes. Therefore, the dependency is read-time consumption, not automatic downstream synchronization.

**What happens when source is incomplete?**  
Based on the code shown, Vehicle Allocation does not explicitly block because an order is incomplete. It consumes whatever order items are returned by the repository and builds the allocation summary from them.

Therefore, an incomplete order source can result in incomplete/partial allocation requirements unless another validation or workflow rule outside the shown code prevents Vehicle Allocation from being used.

**What happens when source is finalized?**  
No direct downstream action is shown in this code.

Finalization is handled through the workflow state, and the Vehicle Allocation workflow determines whether allocation can be edited based on the paper status and session. Finalizing Orders does not itself propagate or regenerate Vehicle Allocation records based on the code provided.

**Implementation currently:**  
- `VehicleAllocationService.getVehicleAllocations()`
  - Reads order items through `OrderItemsRepository.findOrderItemsWithSupplyContextByPaperId()`
  - Passes them to `AllocationSummaryBuilder.build()`
- `AllocationSummaryBuilder.build()`
  - Filters by `DeliverySession`
  - Groups by distributor/category/brand
  - Aggregates `orderedQty` by group/product
- `VehicleAllocationBuilder.buildVehicleAllocationGrids()`
  - Converts the resulting summaries into the vehicle allocation grid
- `VehicleAllocationService.saveVehicleAllocations()`
  - Persists the vehicle allocation selected by the user

**Centralized:**  
NO

The dependency is implemented across the Vehicle Allocation service, the common `OrderItemsRepository`, `AllocationSummaryBuilder`, and `VehicleAllocationBuilder`. There is no single dependency-definition component shown that centrally declares this business dependency.

**Verified:**  
PARTIALLY

The dependency is directly evident from the provided implementation. The exact behavior when Orders are incomplete or finalized depends on workflow/validation behavior outside the code shown.

**Notes:**  
This is a **CONSUMPTION** dependency, not PROPAGATION. Vehicle Allocation reads Order data to construct its own allocation requirements; it does not cause Order data to be created or modified.

The `DeliverySession` relationship is explicitly session-aware in the implementation. The same order paper can supply data to both Night and Morning Vehicle Allocation, with each allocation operation consuming only the corresponding session's order items.


You have `DEP-001` completed. Based on the code you provided afterward, the next dependencies to enter are these three.

One important point: `orders → client-trays` appears twice because there are genuinely two different business relationships: one is propagation on order save, and one is consumption when the tray sheet is read. Keep them as separate dependencies if your register is meant to capture actual dependency semantics rather than only one edge per module pair.

## DEP-002

### BUSINESS DEPENDENCY REGISTER

## Dependency: orders → client-trays

**Dependency ID:**
DEP-002

**Source Module:**
orders

**Target Module:**
client-trays

**Dependency Type:**
PROPAGATION

**Trigger:**
ON_SAVE

**What does the target need from the source?**
Client Trays needs the current order quantities and delivered quantities from the order sheet so that its tray transactions can be recalculated when order data changes.

**Source data:**

* `order_sheet_items.ordered_qty`
* `order_sheet_items.delivered_qty`
* `order_sheet_items.client_id`
* `order_sheet_items.product_id`
* Product information used to resolve the applicable tray rule
* `order_sheet.group_id`
* `order_paper.status`
* `order_paper.sale_date`

**Target uses it for:**
Client Trays calculates `trays_taken` for each client and tray type from the current order quantities/delivered quantities. It then recalculates the corresponding opening balance and closing balance while preserving manually entered `trays_returned`.

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

The propagation is triggered for the specific `order_sheet` being saved. The sheet belongs to a particular delivery group/session, so the recalculation is scoped to that sheet.

The propagation service itself does not explicitly filter `sheetItems` by `delivery_session`; session isolation is provided through the specific order sheet/group being recalculated.

**What happens when source changes?**
When Night or Morning order entries are saved, Client Tray state is recalculated immediately.

`OrdersService.saveNightEntriesService()` calls:

`clientTraysPropagationService.recalculateFromSheet(sheetId, tx)`

after saving the Night entries.

`OrdersService.saveMorningEntriesService()` does the same after saving the Morning entries.

The propagation recalculates:

* `opening_balance`
* `trays_taken`
* `closing_balance`

It preserves `trays_returned` because that is manually entered data.

**What happens when source is incomplete?**
The propagation service does not explicitly block because order data is incomplete.

It recalculates from the currently available `order_sheet_items`.

If an item has no applicable tray rule, that item is skipped.

If no transaction entries are generated, the propagation returns without writing Client Tray transactions.

Therefore, based on the provided code, incomplete order data can result in partial downstream Client Tray state rather than automatically blocking the propagation.

**What happens when source is finalized?**
There is no separate finalization-triggered action in this dependency.

The propagation occurs when order entries are saved.

However, the paper status affects the calculation:

* `DRAFT` → `ordered_qty` is used for tray calculation.
* After `DRAFT` → `delivered_qty` is used for tray calculation.

Finalization itself is handled by a separate `paper → client-trays` dependency.

**Implementation currently:**

* `OrdersService.saveNightEntriesService()`

  * Saves Night order entries.
  * Calls `ClientTraysPropagationService.recalculateFromSheet()`.
* `OrdersService.saveMorningEntriesService()`

  * Saves Morning order entries.
  * Calls `ClientTraysPropagationService.recalculateFromSheet()`.
* `ClientTraysPropagationService.recalculateFromSheet()`

  * Recalculates the current sheet.
* `ClientTraysPropagationService.recalculateSheet()`

  * Reads current order-sheet items.
  * Resolves tray rules.
  * Calculates trays taken.
  * Preserves returned quantities.
  * Recalculates closing balances.
  * Writes Client Tray transactions.

**Centralized:**
YES

The downstream propagation logic is centralized in `ClientTraysPropagationService`.

The Orders module only triggers the propagation.

**Verified:**
YES

The dependency is directly implemented in the provided code. Both Night and Morning order-save paths explicitly invoke Client Tray propagation.

**Notes:**
This is a true **PROPAGATION** dependency because saving Orders actively causes Client Tray state to be recalculated.

This is different from `orders → vehicle-allocations`, which is primarily **CONSUMPTION / ON_READ**.

---

# DEP-003

### BUSINESS DEPENDENCY REGISTER

## Dependency: orders → client-trays

**Dependency ID:**
DEP-003

**Source Module:**
orders

**Target Module:**
client-trays

**Dependency Type:**
CONSUMPTION

**Trigger:**
ON_READ

**What does the target need from the source?**
Client Trays needs the order-sheet items belonging to the current sheet, including client, product, ordered quantity, and delivered quantity.

**Source data:**

* `order_sheet_items`
* `order_sheet_items.client_id`
* `order_sheet_items.product_id`
* `order_sheet_items.ordered_qty`
* `order_sheet_items.delivered_qty`
* Product brand
* Product group
* Product type
* Packaging type

**Target uses it for:**
Client Trays uses the order-sheet items to determine applicable tray rules, calculate trays taken for each client/tray type, and construct the Client Tray grid.

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

The Client Tray sheet is tied to a specific order sheet/group. Therefore, the consumed order data is scoped to that sheet.

**What happens when source changes?**
When the Client Tray sheet is read again, it reads the current `order_sheet_items` and rebuilds the tray calculation from those values.

Therefore, a changed order quantity or delivered quantity can change the displayed tray calculation.

There is no requirement for a separate synchronization event for this read-time relationship.

**What happens when source is incomplete?**
The provided code does not explicitly block Client Trays because an order is incomplete.

If a client has no sheet items, that client is excluded from the generated tray grid.

If a product has no applicable tray rule, it is skipped during tray calculation.

**What happens when source is finalized?**
No direct action is triggered by finalization through this dependency.

The Client Tray builder receives the current `OrderPaperStatus`, and the status affects whether ordered or delivered quantity is used for the calculation.

Finalization-specific propagation is handled separately by `paper → client-trays`.

**Implementation currently:**

* `ClientTraysService.getTraySheetService()`

  * Retrieves the current order sheet.
  * Calls `ClientTraysRepository.getSheetItems(sheet.id)`.
* `ClientTraysBuilder.buildTrayBilling()`

  * Receives the order-sheet items.
* `ClientTraysBuilder.buildGrid()`

  * Filters items by client.
  * Resolves tray rules.
  * Calculates trays taken.
  * Builds the Client Tray grid.

**Centralized:**
NO

The read dependency is distributed across `ClientTraysService`, `ClientTraysRepository`, `ClientTraysBuilder`, and `TrayCalculationService`.

**Verified:**
YES

The Client Trays read path directly retrieves and uses order-sheet items.

**Notes:**
This is separate from DEP-002.

DEP-002 means:

```text
Order saved
    ↓
Client Tray recalculated
```

DEP-003 means:

```text
Client Tray opened/read
    ↓
Current Order data consumed
    ↓
Tray grid calculated
```

---

# DEP-004

### BUSINESS DEPENDENCY REGISTER

## Dependency: paper → client-trays

**Dependency ID:**
DEP-004

**Source Module:**
paper

**Target Module:**
client-trays

**Dependency Type:**
PROPAGATION

**Trigger:**
ON_FINALIZE

**What does the target need from the source?**

Client Trays needs the paper's order sheets and paper state to recalculate Client Tray transactions when the paper reaches the finalization boundary.

The propagation also uses the paper's `sale_date` to locate subsequent order sheets for the same delivery group and propagate tray balances forward.

**Source data:**

* `paperId`
* `order_paper.status`
* `order_paper.sale_date`
* Paper's `order_sheet` records
* `order_sheet.group_id`
* Order-sheet items
* Product information used to resolve tray rules
* Existing Client Tray transactions
* Previous sheet's closing balances

**Target uses it for:**

Client Trays recalculates tray transactions for the paper's order sheets.

For each sheet, it calculates:

* `opening_balance`
* `trays_taken`
* `closing_balance`

while preserving the manually entered:

* `trays_returned`

`trays_taken` is derived from the order-sheet items:

* `ordered_qty` when the sheet's paper status is `DRAFT`
* `delivered_qty` after `DRAFT`

The resulting closing balance becomes the opening balance for the next sheet belonging to the same delivery group.

**Direct or Transitive:**
DIRECT

`PaperService` directly calls:

```text
ClientTraysPropagationService.propagateFromPaper()
```

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

The Client Tray transaction itself does not contain a `delivery_session` field.

Session identity comes from the `order_sheet → master_group → delivery_session` relationship.

`propagateFromPaper()` retrieves all sheets belonging to the paper, while `propagateFromSheet()` continues through later sheets using:

```text
group_id + sale_date
```

Therefore the propagation remains within the same delivery group, whose delivery session is fixed.

The implementation does **not** explicitly filter Client Tray propagation using `DeliverySession.NIGHT` or `DeliverySession.MORNING`.

**What happens when source changes?**

At finalization, Client Tray propagation is executed for all order sheets belonging to the paper.

For each sheet:

```text
Current sheet
    ↓
recalculate Client Tray transactions
    ↓
find previous sheet
    ↓
derive opening balance
    ↓
calculate trays taken
    ↓
preserve returned trays
    ↓
calculate closing balance
```

The service then finds the next sheet for the same `group_id` and later `sale_date`:

```text
Current sheet
    ↓
Next sheet for same group
    ↓
Next sheet for same group
    ↓
...
```

Therefore a recalculation can affect the Client Tray state of subsequent papers for the same delivery group.

**What happens when source is incomplete?**

`PaperService` first executes:

```text
validateFinalizeReadiness(paperId, tx)
```

If finalization readiness fails, Client Tray propagation is not executed.

If Client Tray propagation throws an error, the Prisma transaction fails, so the paper is not finalized.

Therefore:

```text
Paper not ready
    ↓
Finalize readiness fails
    ↓
Client Tray propagation does not run
    ↓
Paper is not finalized
```

**What happens when source is finalized?**

The important detail is that propagation actually happens **before** the paper is persisted as `FINALIZED`.

The sequence is:

```text
validateFinalizeReadiness()
        ↓
validateTransition(FINALIZED)
        ↓
ClientTraysPropagationService.propagateFromPaper()
        ↓
DairyTraysPropagationService.propagateFromPaper()
        ↓
DistributorTransferPropagationService.propagate()
        ↓
paperRepository.finalizePaper()
```

All of this occurs inside the same Prisma transaction.

Therefore Client Tray propagation must succeed before the paper can be committed as `FINALIZED`.

**Implementation currently:**

* `PaperService.finalizePaperService()`

  * Validates finalization readiness.
  * Validates the workflow transition.
  * Calls `ClientTraysPropagationService.propagateFromPaper()`.
  * Finalizes the paper.

* `ClientTraysPropagationService.propagateFromPaper()`

  * Retrieves all order sheets belonging to the paper.
  * Calls `propagateFromSheet()` for each sheet.

* `ClientTraysPropagationService.propagateFromSheet()`

  * Recalculates the starting sheet.
  * Finds the next sheet for the same `group_id`.
  * Continues propagation through subsequent papers.

* `ClientTraysPropagationService.recalculateSheet()`

  * Reads order-sheet items.
  * Resolves product tray rules.
  * Reads existing Client Tray transactions.
  * Reads the previous sheet's closing balances.
  * Calculates trays taken.
  * Preserves manually entered returned quantities.
  * Calculates closing balances.
  * Persists the recalculated transactions.

* `ClientTraysRepository`

  * `getSheetsByPaperId()`
  * `findSheetById()`
  * `getSheetItems()`
  * `getPreviousSheet()`
  * `getPreviousTrayBalances()`
  * `getNextSheet()`
  * `replaceTrayTransactions()`

**Centralized:**
YES

The propagation logic is centralized in:

```text
ClientTraysPropagationService
```

`PaperService` is responsible for invoking that propagation at the finalization boundary.

**Verified:**
YES

The dependency is directly demonstrated by the provided code.

`PaperService.finalizePaperService()` explicitly invokes:

```text
clientTraysPropagationService.propagateFromPaper(
  paperId,
  tx,
)
```

The propagation service then explicitly recalculates Client Tray transactions and follows subsequent sheets.

**Notes:**

This is a lifecycle propagation dependency from the Paper module into Client Trays.

It is distinct from the order-level dependency:

```text
orders → client-trays
```

because this dependency is triggered by paper finalization rather than by an individual order modification.

There is also an important distinction in session handling:

```text
Paper
  ↓
Order Sheet
  ↓
Master Group
  ↓
Delivery Session
```

The Client Tray transaction does not independently store the session. Therefore the implementation is session-aware through the order-sheet/group structure rather than through an explicit `delivery_session` field on Client Tray transactions.

One correction to your original wording is especially important:

> "Client Trays needs the paper's order sheets and their associated order data so that Client Tray state can be fully recalculated before the paper is finalized."

This is broadly correct, but "fully recalculated" could be misleading because the propagation also preserves `trays_returned` as manual data. It recalculates the derived fields, not the entire transaction.

The most precise statement is:

> **Client Trays needs the paper's order sheets and associated order data to recalculate the derived Client Tray balances before the paper is finalized, while preserving manually entered tray returns.**


Yes. This adds another dependency that needs to be included in the register.

There are actually two distinct relationships here, just like with Client Trays:

1. `orders → distributor-transfer` — the transfer module consumes order-sheet data.
2. `paper → distributor-transfer` — finalization explicitly triggers distributor-transfer propagation.

The second one is directly visible in your `PaperService`:

```ts
await this.distributorTransferPropagationService.propagate(
  paperId,
  tx,
);
```

So I would add the following.

## DEP-005

### BUSINESS DEPENDENCY REGISTER

**Dependency:** `orders → distributor-transfer`

**Dependency ID:**
DEP-005

**Source Module:**
orders

**Target Module:**
distributor-transfer

**Dependency Type:**
CONSUMPTION

**Trigger:**
ON_READ

**What does the target need from the source?**
Distributor Transfer needs the order-sheet items belonging to the paper, together with their group, delivery-session, client, product, distributor, and supply-rule context, to determine the distributor transfer requirements.

**Source data:**

* `order_sheet_items`
* `order_sheet.group_id`
* `master_group.delivery_session`
* `master_group.supply_rules`
* `order_sheet_items.client_id`
* `master_client.owner_distributor`
* `master_client.billing_group`
* `order_sheet_items.product_id`
* Product/brand/product-group/product-type/packaging information

**Target uses it for:**
Distributor Transfer builds transfer summaries from the order-sheet items, validates those summaries against configured distributor transfer rules, and generates distributor transfer entities.

The repository explicitly retrieves `order_sheet_items` for the given `paperId` and includes the relevant group, supply-rule, client, distributor, billing-group, and product context.

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

The source data includes `master_group.delivery_session`, and the source records belong to order sheets associated with the paper.

However, the shown `getTransferSourceItems()` implementation retrieves all order-sheet items for the paper. It does not explicitly filter by `delivery_session`.

Therefore, the dependency has session information available, but explicit session filtering is **not demonstrated in the code provided**.

**What happens when source changes?**
When the transfer summary/generation is executed again, the current order-sheet items are read and the transfer summary is rebuilt.

A change to relevant order-sheet/client/product/distributor data can therefore change the calculated transfer requirements.

The provided code does not show an automatic `OrdersService → DistributorTransferService` call after every order save.

**What happens when source is incomplete?**
The provided `DistributorTransferService` does not itself establish that incomplete orders block transfer generation.

It builds summaries from whatever source items are returned and then validates the resulting summaries against distributor transfer rules.

Therefore, based strictly on this code, incomplete source data is not independently proven to block the module unless `validateTransferRules()` or an upstream workflow/finalization validation does so.

**What happens when source is finalized?**
There is a separate finalization dependency:

`paper → distributor-transfer`.

Finalization explicitly invokes `DistributorTransferPropagationService.propagate()`.

Therefore, don't describe Order finalization as an effect of this `orders → distributor-transfer` dependency. That belongs to DEP-006 below.

**Implementation currently:**

* `DistributorTransferService.getTransferSummary()`

  * Retrieves transfer source items for the paper.
  * Builds transfer summaries.
  * Builds transfer grids.
* `DistributorTransferService.generateTransfer()`

  * Retrieves transfer source items.
  * Builds transfer summaries.
  * Retrieves transfer rules.
  * Validates transfer requirements.
  * Builds transfer entities.
  * Persists them using `replaceDistributorTransfers()`.
* `DistributorTransferRepository.getTransferSourceItems()`

  * Reads the underlying `order_sheet_items` and associated business context.

**Centralized:**
NO

The consumption relationship is distributed between `DistributorTransferService`, `DistributorTransferRepository`, and the transfer builders.

**Verified:**
YES

The provided code directly shows Distributor Transfer consuming `order_sheet_items` as its source.

**Notes:**
This is **CONSUMPTION**, not PROPAGATION.

The transfer module uses order data to calculate its own transfer requirements. The code shown does not show Orders directly causing Distributor Transfer state to be updated on every order save.

---

## DEP-006

### BUSINESS DEPENDENCY REGISTER

**Dependency:** `paper → distributor-transfer`

**Dependency ID:**
DEP-006

**Source Module:**
paper

**Target Module:**
distributor-transfer

**Dependency Type:**
PROPAGATION

**Trigger:**
ON_FINALIZE

**What does the target need from the source?**
Distributor Transfer needs the complete paper context and its order-sheet data to generate/recalculate the distributor transfer state before the paper becomes finalized.

**Source data:**

* `paperId`
* Order sheets belonging to the paper
* Order-sheet items belonging to those sheets
* Paper lifecycle/finalization state
* Group/client/product/distributor context associated with the paper's orders

**Target uses it for:**
Distributor Transfer propagation generates/recalculates the distributor transfer state associated with the paper.

The exact internal recalculation performed by `DistributorTransferPropagationService.propagate()` is not included in the code you provided, so the precise downstream fields should not be inferred from this code alone.

**Direct or Transitive:**
DIRECT

`PaperService` directly invokes:

```ts
await this.distributorTransferPropagationService.propagate(
  paperId,
  tx,
);
```

**Session-aware:**
PARTIALLY VERIFIED

**Session relationship:**
BOTH

The underlying transfer source data contains `delivery_session`, but the actual implementation of `DistributorTransferPropagationService.propagate()` has not been provided here.

Therefore, do not claim explicit Night/Morning propagation behavior until that service is inspected.

**What happens when source changes?**
At finalization, Distributor Transfer propagation is executed against the paper.

The exact recalculation behavior cannot be fully established without the implementation of `DistributorTransferPropagationService`.

**What happens when source is incomplete?**
`PaperService` first executes:

```ts
validateFinalizeReadiness(paperId, tx)
```

Therefore the intended finalization flow requires the paper to pass finalization readiness before Distributor Transfer propagation occurs.

If finalization readiness fails, Distributor Transfer propagation is not reached.

If the propagation itself fails inside the transaction, the paper should not be finalized because `finalizePaperService()` has not yet reached `finalizePaper()`.

**What happens when source is finalized?**
Distributor Transfer propagation happens immediately before finalization:

```text
validate finalization readiness
        ↓
validate workflow transition
        ↓
Client Tray propagation
        ↓
Dairy Tray propagation
        ↓
Distributor Transfer propagation
        ↓
FINALIZE PAPER
```

All of these operations occur inside the same Prisma transaction.

**Implementation currently:**

* `PaperService.finalizePaperService()`

  * Validates finalization readiness.
  * Validates workflow transition.
  * Calls `ClientTraysPropagationService.propagateFromPaper()`.
  * Calls `DairyTraysPropagationService.propagateFromPaper()`.
  * Calls `DistributorTransferPropagationService.propagate()`.
  * Calls `paperRepository.finalizePaper()`.

The exact implementation of `DistributorTransferPropagationService.propagate()` is not provided, so its internal behavior remains unverified.

**Centralized:**
YES

The trigger is centralized in `PaperService`, and the propagation mechanism is delegated to `DistributorTransferPropagationService`.

**Verified:**
PARTIALLY

The **ON_FINALIZE trigger is verified** directly from `PaperService`.

The internal propagation behavior and session semantics are **not verified** because `DistributorTransferPropagationService` itself was not provided.

**Notes:**
This is a separate lifecycle dependency from `orders → distributor-transfer`.

The distinction is:

```text
orders → distributor-transfer
CONSUMPTION / ON_READ

Paper → distributor-transfer
PROPAGATION / ON_FINALIZE
```


## DEP-007

### BUSINESS DEPENDENCY REGISTER

**Dependency:** `vehicle-allocations → purchase`

**Dependency ID:**
DEP-007

**Source Module:**
vehicle-allocations

**Target Module:**
purchase

**Dependency Type:**
CONSUMPTION

**Trigger:**
ON_READ

**What does the target need from the source?**
Purchase needs the vehicle allocation and vehicle-distributor assignment data to determine what can be purchased for each vehicle, distributor, product, category, and delivery session.

**Source data:**

* `vehicle_allocation.vehicle_id`
* `vehicle_allocation.distributor_id`
* `vehicle_allocation.category`
* `vehicle_allocation.product_id`
* `vehicle_allocation.allocated_qty`
* `vehicle_allocation_paper.delivery_session`
* `vehicle_distribution_assignment.vehicle_id`
* `vehicle_distribution_assignment.distributor_id`
* `vehicle_distribution_assignment.category`
* `vehicle_distribution_assignment.vehicle_allocation_paper_id`
* `vehicle_distribution_assignment.vehicle_allocation_paper.delivery_session`

**Target uses it for:**
Purchase uses vehicle allocations to construct the purchase grid and determine the allocation against which purchase quantities are entered.

It also uses vehicle-distributor assignments to determine which distributor is assigned to each vehicle/category and to validate that the purchase entry matches that assignment.

The Purchase repository directly retrieves both:

```text
vehicle_allocation
vehicle_distribution_assignment
```

for the given order paper.

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

The vehicle allocation paper contains `delivery_session`, and Purchase retrieves that session together with both allocations and vehicle assignments.

Purchase therefore consumes allocation information belonging to the delivery session being processed.

The same order paper can have separate vehicle allocations for:

```text
NIGHT
MORNING
```

and Purchase consumes the corresponding allocation records.

**What happens when source changes?**
When Purchase is read, the current vehicle allocations and assignments are retrieved and used to construct the purchase requirements.

If the vehicle allocation changes, the Purchase grid/requirements can change accordingly.

During Purchase save, the current vehicle allocations are read again and used to validate the submitted purchase entries.

There is no propagation mechanism shown that automatically modifies already-persisted purchase entries when a vehicle allocation changes.

Therefore:

```text
Vehicle Allocation changes
        ↓
Purchase consumes new allocation on read/save
        ↓
Existing purchase records are not automatically regenerated
```

**What happens when source is incomplete?**
Purchase is blocked when the required vehicle allocation information does not exist.

The Purchase read path checks for:

```text
No vehicle assignments
        → error

No vehicle allocations
        → error
```

During Purchase save, each submitted purchase entry must also correspond to an existing vehicle allocation.

Therefore Purchase cannot independently proceed with purchase data when the required vehicle allocation has not been established.

Vehicle-distributor assignment consistency is also checked. A purchase entry cannot use a distributor that does not match the distributor assigned to that vehicle/category.

**What happens when source is finalized?**
There is no direct `vehicle-allocation → purchase` finalization propagation shown.

Vehicle Allocation does not call a Purchase propagation service when its own data becomes finalized.

Purchase editability is controlled separately through the workflow state.

Therefore:

```text
Vehicle Allocation finalized
        ↓
No direct Purchase propagation shown
```

The dependency remains a consumption/validation relationship.

**Implementation currently:**

`PurchaseRepository.findVehicleAllocationsByPaperId()`

* Reads `vehicle_allocation`
* Includes `vehicle_allocation_paper.delivery_session`
* Retrieves vehicle, distributor, category, product and allocation information.

`PurchaseRepository.findVehicleAssignmentsByPaperId()`

* Reads `vehicle_distribution_assignment`
* Includes the associated `vehicle_allocation_paper.delivery_session`
* Retrieves vehicle, distributor and category assignment information.

`PurchaseService.getPurchases()`

* Reads vehicle assignments.
* Reads vehicle allocations.
* Uses them to construct the Purchase grids.

`PurchaseService.savePurchases()`

* Reads current vehicle allocations.
* Matches submitted purchase entries against allocations.
* Reads vehicle assignments.
* Validates vehicle/distributor/category/session consistency before saving Purchase entries.

**Centralized:**
NO

The dependency is implemented across the Purchase service and repository rather than through a centralized dependency-definition mechanism.

The source module does not explicitly push data into Purchase. Purchase pulls the required allocation data.

**Verified:**
YES

The relationship is directly demonstrated by the provided Purchase implementation.

The repository explicitly reads `vehicle_allocation` and `vehicle_distribution_assignment`, and the Purchase service uses those records when constructing and validating Purchase entries.

**Notes:**
This is primarily a **CONSUMPTION** dependency:

```text
vehicle-allocations
        ↓
   Purchase reads
        ↓
purchase requirements
```

There is also a **VALIDATION** aspect in the implementation because Purchase save rejects entries when the corresponding allocation does not exist or when the vehicle/distributor/category relationship does not match.

If your dependency register permits multiple dependency records for the same module pair, this should be recorded separately as:

```text
vehicle-allocations → purchase
Type: VALIDATION
Trigger: ON_SAVE
```

Do not change DEP-007 to VALIDATION, because the primary relationship is still that Purchase **consumes** vehicle-allocation data to construct and process its own work.


DEP-008
BUSINESS DEPENDENCY REGISTER

Dependency:
purchase → dairy-trays

Dependency ID:
DEP-008

Source Module:
purchase

Target Module:
dairy-trays

Dependency Type:
CONSUMPTION

Trigger:
ON_READ

What does the target need from the source?
Dairy Trays needs the current purchase entries to determine the products/quantities carried by each vehicle and therefore calculate the dairy trays taken by each vehicle and delivery session.

Source data:

purchase_entry.vehicle_id
purchase_entry.distributor_id
purchase_entry.category
purchase_entry.product_id
purchase_entry.purchased_qty
purchase_entry.delivery_session
Product information associated with the purchase entry

Target uses it for:
Dairy Trays uses Purchase entries to build the dairy tray grid.

The purchase entries provide the products and quantities associated with each vehicle. Dairy Trays then applies the configured product tray rules to determine the corresponding tray quantities.

The repository explicitly retrieves Purchase entries for the current paper:

dairy-trays
    ↓
getPurchaseEntries(paperId)
    ↓
purchase_entry
    ↓
DairyTraysBuilder.buildDairyTrayGrid()

Direct or Transitive:
DIRECT

Session-aware:
YES

Session relationship:
NIGHT → NIGHT / MORNING → MORNING

The purchase_entry contains delivery_session, and the Dairy Tray transaction itself is also keyed by:

dairy_tray_paper_id
delivery_session
vehicle_id
tray_type_id

The Dairy Tray save path explicitly receives deliverySession for every returned-tray entry.

Therefore the Dairy Tray domain is explicitly session-aware.

What happens when source changes?
When Dairy Trays is read again, it retrieves the current Purchase entries and rebuilds the dairy-tray grid.

Therefore changes to:

purchased quantity
vehicle
product
distributor
category
delivery session

can affect the calculated dairy tray requirements.

There is no automatic update merely from the read relationship itself.

The automatic recalculation after a Purchase save is a separate PROPAGATION / ON_SAVE dependency.

What happens when source is incomplete?
Based on the provided Dairy Trays code, there is no explicit check that Purchase must contain entries before the Dairy Tray grid can be opened.

getDairyTrayGrid() retrieves:

vehicles
tray types
tray rules
purchase entries

and passes them to the builder.

Therefore, based strictly on this code, missing Purchase entries do not directly block opening the Dairy Tray grid.

The resulting grid may contain no purchase-derived tray quantities.

What happens when source is finalized?
No direct finalization action is shown for this consumption dependency.

The Dairy Tray grid simply reads the current Purchase entries.

The separate finalization dependency is:

paper → dairy-trays
PROPAGATION / ON_FINALIZE

which is already triggered from PaperService.finalizePaperService().

Implementation currently:

DairyTraysService.getDairyTrayGrid()

Retrieves the current paper.
Creates/gets the Dairy Tray paper.
Calls DairyTraysRepository.getPurchaseEntries(paperId).
Passes those Purchase entries into DairyTraysBuilder.buildDairyTrayGrid().

DairyTraysRepository.getPurchaseEntries()

retrieves:

purchase_entry
product information
vehicle information

for the given order paper.

Centralized:
NO

The dependency is implemented across:

DairyTraysService
DairyTraysRepository
DairyTraysBuilder

There is no central dependency registry shown in the implementation.

Verified:
YES

The dependency is directly demonstrated by the provided code.

DairyTraysService explicitly reads Purchase entries and uses them to construct the Dairy Tray grid.

Notes:
This is CONSUMPTION, not propagation.

The relationship is:

Purchase
    │
    │ purchase entries
    ▼
Dairy Trays
    │
    ▼
calculate/display tray requirements

The separate propagation relationship should be recorded as the next dependency:

purchase → dairy-trays / PROPAGATION / ON_SAVE

because your earlier Purchase implementation explicitly calls DairyTraysPropagationService.recalculateCurrentPaper() after saving Purchase entries.

## DEP-009

### BUSINESS DEPENDENCY REGISTER

**Dependency:**
`purchase → dairy-trays`

**Dependency ID:**
DEP-009

**Source Module:**
purchase

**Target Module:**
dairy-trays

**Dependency Type:**
PROPAGATION

**Trigger:**
ON_SAVE

**What does the target need from the source?**
Dairy Trays needs the newly saved Purchase entries so that its current dairy-tray transactions can be recalculated from the latest purchase quantities.

**Source data:**

* `purchase_entry.vehicle_id`
* `purchase_entry.distributor_id`
* `purchase_entry.category`
* `purchase_entry.product_id`
* `purchase_entry.purchased_qty`
* `purchase_entry.delivery_session`
* Product information associated with the purchase entry

**Target uses it for:**
Dairy Trays uses the Purchase data to recalculate the trays taken by each vehicle and tray type.

The Purchase entries determine the products and quantities associated with vehicles. The applicable product tray rules are then used to calculate the corresponding dairy-tray transactions.

The important distinction is that Purchase is not merely read by Dairy Trays here. Saving Purchase explicitly triggers:

```text
Purchase saved
    ↓
DairyTraysPropagationService.recalculateCurrentPaper()
    ↓
Current Dairy Tray state recalculated
```

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

Purchase entries contain `delivery_session`.

Dairy Tray transactions are also explicitly session-aware. The transaction uniqueness key contains:

```text
dairy_tray_paper_id
delivery_session
vehicle_id
tray_type_id
```

Therefore the propagated Dairy Tray state is separated by delivery session.

**What happens when source changes?**
When Purchase entries are saved or replaced, the Purchase service immediately calls:

```ts
await this.dairyTraysPropagationService.recalculateCurrentPaper(
  paperId,
  tx,
);
```

The propagation recalculates the current Dairy Tray state using the latest Purchase data.

Therefore:

```text
Purchase quantity changes
        ↓
Purchase entries replaced
        ↓
Dairy Tray recalculation triggered
        ↓
Current Dairy Tray transactions updated
```

The propagation happens inside the same Prisma transaction as the Purchase save.

**What happens when source is incomplete?**
Purchase validation occurs before the Purchase entries are persisted.

If Purchase validation fails, the transaction does not reach the Dairy Tray propagation.

Therefore:

```text
Invalid/incomplete Purchase
        ↓
Purchase save fails
        ↓
Dairy Tray propagation is not executed
```

If a valid Purchase save contains fewer entries than before, the propagation service is responsible for recalculating the current Dairy Tray state from the resulting Purchase state.

The exact behavior for zero Purchase entries should not be inferred further without the implementation of `DairyTraysPropagationService`.

**What happens when source is finalized?**
There is no separate finalization trigger for this dependency.

The propagation happens when Purchase is saved.

Paper finalization has a separate dependency:

```text
paper → dairy-trays
PROPAGATION / ON_FINALIZE
```

During paper finalization, `PaperService` explicitly calls:

```text
DairyTraysPropagationService.propagateFromPaper()
```

Therefore Purchase finalization and Paper finalization should not be conflated.

**Implementation currently:**
`PurchaseService.savePurchases()`

* Validates the submitted Purchase entries.
* Replaces the Purchase entries.
* Calls `DairyTraysPropagationService.recalculateCurrentPaper()`.

The downstream propagation is implemented by:

`DairyTraysPropagationService.recalculateCurrentPaper()`

which recalculates the current Dairy Tray state.

`DairyTraysRepository` provides the downstream persistence methods, including:

* `getPurchaseEntries()`
* `replaceTrayTransactions()`
* `updateTrayReturns()`

**Centralized:**
YES

The downstream recalculation is delegated to `DairyTraysPropagationService`.

The Purchase module only triggers the propagation after successfully saving its own data.

**Verified:**
YES

The dependency is directly demonstrated by the provided Purchase implementation.

The Purchase service explicitly invokes `DairyTraysPropagationService.recalculateCurrentPaper()` after saving Purchase entries.

The Dairy Trays module also explicitly consumes Purchase entries when building its grid.

**Notes:**
This is a **PROPAGATION** dependency because saving Purchase actively causes Dairy Tray state to be recalculated.

It is distinct from:

`purchase → dairy-trays / CONSUMPTION / ON_READ`

where Dairy Trays reads Purchase entries to build its grid.

The two relationships are therefore:

```text
DEP-008
purchase → dairy-trays
CONSUMPTION / ON_READ
```

and:

```text
DEP-009
purchase → dairy-trays
PROPAGATION / ON_SAVE
```

The propagation occurs within the same transaction as the Purchase save, making the Purchase save and current Dairy Tray recalculation part of one atomic operation.


Based on the code you just provided, the next dependency is:

`collections → cash-settlement`

The important point is that this specific pair is **CONSUMPTION**, not AGGREGATION. Cash Settlement reads Collection data and uses it as one of its inputs. The overall Cash Settlement calculation can be classified as AGGREGATION because it combines collections, route settlement, direct collections, and bank deposits, but that does not make every individual upstream edge an AGGREGATION dependency.

## DEP-010

### BUSINESS DEPENDENCY REGISTER

**Dependency:**
`collections → cash-settlement`

**Dependency ID:**
DEP-010

**Source Module:**
collections

**Target Module:**
cash-settlement

**Dependency Type:**
CONSUMPTION

**Trigger:**
ON_READ

**What does the target need from the source?**
Cash Settlement needs the collection amounts recorded against each order sheet/client in order to calculate the overall cash position for the paper.

**Source data:**

* `client_collection.office_amount_given`
* `client_collection.cash_collection`
* `client_collection.cheque_collection`
* `client_collection.online_collection`
* `client_collection.bank_deposit`
* `client_collection.order_sheet_id`
* `client_collection.client_id`
* `client_collection.category`
* Order sheet `delivery_session`

**Target uses it for:**
Cash Settlement reads the client collection records associated with every order sheet belonging to the paper.

These collection values form one of the monetary inputs into the Cash Settlement calculation.

The repository explicitly loads:

```text
order_paper
    └── order_sheet
          └── client_collection
```

through `CashSettlementRepository.getCashSettlementData()`.

The Cash Settlement builder then receives the complete paper data:

```ts
const settlement = this.builder.buildCashSettlement(paper);
```

Therefore the relationship is:

```text
Collections
     ↓
client_collection
     ↓
Cash Settlement
```

**Direct or Transitive:**
DIRECT

**Session-aware:**
YES

**Session relationship:**
NIGHT → NIGHT / MORNING → MORNING

Collections are stored against an `order_sheet`, and each order sheet belongs to a delivery group/session.

`CashSettlementRepository.getCashSettlementData()` retrieves the `master_group.delivery_session` together with each order sheet.

Therefore the collection data entering Cash Settlement retains its delivery-session context.

However, Cash Settlement itself is a paper-level settlement. The provided code does not show separate Cash Settlement records being persisted independently for Night and Morning. Therefore the session is an input/context dimension rather than a separate Cash Settlement paper.

**What happens when source changes?**
When Collection data changes, the next Cash Settlement read retrieves the latest `client_collection` records.

There is no propagation service shown in `CollectionsService` that automatically recalculates or persists Cash Settlement when a Collection is saved.

Therefore:

```text
Collection changes
       ↓
No automatic Cash Settlement write shown
       ↓
Next Cash Settlement read
       ↓
Latest collections are consumed
```

The Cash Settlement result is therefore dynamically rebuilt from the current source data when it is read.

**What happens when source is incomplete?**
Based strictly on the provided code, saving incomplete Collection data does not directly trigger a Cash Settlement failure.

The Collection service validates client/category relationships, but it does not validate that all collections required by Cash Settlement are complete.

Cash Settlement retrieves whatever `client_collection` records currently exist.

Therefore:

```text
Collections incomplete
        ↓
No explicit blocking shown here
        ↓
Cash Settlement can still read the available collection data
```

Whether Cash Settlement itself later rejects incomplete collection data depends on `CashSettlementValidationService` and `CashSettlementBuilder`, which were not provided here.

**What happens when source is finalized?**
No direct downstream effect is shown when Collections are finalized.

The Collection service does not call Cash Settlement during a collection save or finalization operation.

Paper finalization is controlled separately through the workflow.

Therefore there is no evidence in the provided code for:

```text
Collections finalized
        ↓
Cash Settlement automatically finalized/recalculated
```

Do not record such a propagation dependency unless the finalization implementation explicitly demonstrates it.

**Implementation currently:**
`CashSettlementRepository.getCashSettlementData()`

This method retrieves:

```text
order_paper
 ├── order_sheet
 │    ├── master_group.delivery_session
 │    ├── client_collection
 │    └── cash_route_settlement
 │         └── expenses
 ├── cash_direct_collections
 └── cash_bank_deposits
```

`CashSettlementService.getCashSettlementService()`

calls:

```ts
const paper =
  await this.cashSettlementValidationService.getCashSettlementPaper(
    paperId,
  );

const settlement = this.builder.buildCashSettlement(paper);
```

The Cash Settlement therefore consumes Collection data as part of the paper-level settlement input.

**Centralized:**
NO

The dependency itself is implemented through the Cash Settlement repository/service and the Collection persistence model.

There is no centralized dependency-definition component shown.

**Verified:**
YES

The dependency is directly demonstrated by the provided code.

`CashSettlementRepository.getCashSettlementData()` explicitly retrieves `client_collection` records from the order sheets, and Cash Settlement builds its result from that retrieved paper data.

**Notes:**
This dependency should not be classified as `AGGREGATION` merely because Cash Settlement combines multiple monetary sources.

The broader Cash Settlement structure is:

```text
Client Collections ───┐
Route Settlement ─────┤
Direct Collections ───┼──→ Cash Settlement
Bank Deposits ────────┘
```

The **overall Cash Settlement operation is aggregation**, but the individual relationship:

```text
collections → cash-settlement
```

is **CONSUMPTION** because Cash Settlement consumes Collection data as one of its inputs.

DEP-011 — paper → dairy-trays

Dependency:
paper → dairy-trays

Dependency ID:
DEP-011

Source Module:
paper

Target Module:
dairy-trays

Dependency Type:
PROPAGATION

Trigger:
ON_FINALIZE

What does the target need from the source?
Dairy Trays needs the finalized paper as the starting point for recalculating dairy-tray state for that paper and subsequent papers.

The propagation uses the paper's:

paperId
sale_date
associated purchase entries
existing dairy-tray transactions
previous paper's closing balances
delivery-session information

Target uses it for:
Dairy Trays recalculates the tray transactions for the finalized paper and then propagates the resulting tray state forward to subsequent papers.

The most important downstream calculation is the opening balance:

Previous paper's closing balance
                ↓
Current paper's opening balance

The current paper's trays_taken comes from Purchase entries, while manually entered trays_returned values are preserved.

The propagation therefore maintains the longitudinal dairy-tray balance across papers.

Direct or Transitive:
DIRECT

PaperService directly invokes DairyTraysPropagationService.propagateFromPaper().

Session-aware:
YES

Session relationship:
NIGHT → NIGHT / MORNING → MORNING

The propagation service explicitly handles both sessions.

For each transaction it uses:

vehicle_id
delivery_session
tray_type_id

The previous closing balance is keyed by:

vehicle_id_deliverySession_trayTypeId

and the current transaction is generated separately for:

DeliverySession.NIGHT
DeliverySession.MORNING

Therefore Night and Morning tray balances remain session-specific.

What happens when source changes?
When paper finalization occurs, Dairy Tray propagation recalculates the finalized paper and every subsequent paper reachable through getNextPaper().

The sequence is:

Paper finalized
      ↓
Dairy Tray propagation starts
      ↓
Recalculate current paper
      ↓
Find next paper by sale_date
      ↓
Recalculate next paper
      ↓
Continue until no next paper exists

For each paper, the propagation:

Reads current Purchase entries.
Resolves product-to-tray rules.
Reads existing Dairy Tray transactions.
Preserves manually entered trays_returned.
Reads the previous paper's closing balances.
Calculates trays_taken.
Calculates opening/closing balances.
Replaces the calculated Dairy Tray transactions.

This means the dependency is not limited to the finalized paper. A change at finalization can affect downstream papers because their opening balances depend on previous closing balances.

What happens when source is incomplete?
PaperService calls:

validateFinalizeReadiness(paperId, tx)

before calling Dairy Tray propagation.

Therefore, if the paper fails finalization readiness, the Dairy Tray propagation is not reached.

If Dairy Tray propagation itself fails, the Prisma transaction fails and the paper is not finalized.

So the lifecycle is:

Incomplete paper
      ↓
Finalization readiness fails
      ↓
No Dairy Tray propagation
      ↓
Paper remains unfinalized

What happens when source is finalized?
Dairy Tray propagation happens immediately before the paper is finalized.

The actual sequence in PaperService is:

validateFinalizeReadiness()
        ↓
validateTransition(FINALIZED)
        ↓
Client Tray propagation
        ↓
Dairy Tray propagation
        ↓
Distributor Transfer propagation
        ↓
finalizePaper()

All of this occurs inside the same Prisma transaction.

Therefore Dairy Tray propagation must succeed before the paper can be committed as FINALIZED.

There is an additional important behavior: propagateFromPaper() continues into subsequent papers. Therefore finalization of one paper can recalculate Dairy Tray state beyond the source paper.

Implementation currently:

PaperService.finalizePaperService()

Calls:
DairyTraysPropagationService.propagateFromPaper(paperId, tx)

DairyTraysPropagationService.propagateFromPaper()

Starts at paperId
      ↓
recalculatePaper(currentPaperId)
      ↓
getNextPaper()
      ↓
repeat

DairyTraysPropagationService.recalculatePaper()

Gets Purchase entries
      ↓
Gets tray rules
      ↓
Gets existing Dairy Tray transactions
      ↓
Gets previous paper
      ↓
Gets previous closing balances
      ↓
Calculates trays_taken
      ↓
Preserves trays_returned
      ↓
Calculates opening/closing balances
      ↓
Replaces Dairy Tray transactions

Centralized:
YES

The downstream propagation logic is centralized in:

DairyTraysPropagationService

PaperService only acts as the lifecycle trigger.

Verified:
YES

The PaperService explicitly invokes:

DairyTraysPropagationService.propagateFromPaper()

during finalization.

The supplied propagation implementation explicitly shows that it recalculates the current paper and then walks through subsequent papers.

Notes:
This is a lifecycle propagation dependency.

It is different from the two existing Purchase → Dairy Trays dependencies:

purchase → dairy-trays
CONSUMPTION / ON_READ

and:

purchase → dairy-trays
PROPAGATION / ON_SAVE

The three relationships are:

purchase
   │
   ├── CONSUMPTION / ON_READ
   │       ↓
   │   dairy-trays grid
   │
   └── PROPAGATION / ON_SAVE
           ↓
       current dairy-tray state




paper
   │
   └── PROPAGATION / ON_FINALIZE
           ↓
       current dairy-tray state
           ↓
       subsequent papers

There is also an important correction to the register numbering. Your existing DEP-010 was collections → cash-settlement. That should become DEP-011 if we insert this dependency according to the actual dependency sequence.

The corrected sequence at this point is:

ID	Source	Target	Type	Trigger
DEP-001	orders	vehicle-allocations	CONSUMPTION	ON_READ
DEP-002	orders	client-trays	PROPAGATION	ON_SAVE
DEP-003	orders	client-trays	CONSUMPTION	ON_READ
DEP-004	paper	client-trays	PROPAGATION	ON_FINALIZE
DEP-005	orders	distributor-transfer	CONSUMPTION	ON_READ
DEP-006	paper	distributor-transfer	PROPAGATION	ON_FINALIZE
DEP-007	vehicle-allocations	purchase	CONSUMPTION	ON_READ
DEP-008	purchase	dairy-trays	CONSUMPTION	ON_READ
DEP-009	purchase	dairy-trays	PROPAGATION	ON_SAVE
DEP-010	paper	dairy-trays	PROPAGATION	ON_FINALIZE
DEP-011	collections	cash-settlement	CONSUMPTION	ON_READ