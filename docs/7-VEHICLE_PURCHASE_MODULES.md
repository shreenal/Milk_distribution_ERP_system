  # Vehicle Allocation & Purchase Modules

  ## Vehicle Allocation Module

  ### Overview

  Manages daily vehicle load planning and distributor assignments. **CRITICAL: Vehicle allocations are locked permanently after NIGHT_SUBMITTED.**

  **Location**: `src/modules/vehicle-allocation/`

  ---

  ### Files

  ```
  vehicle-allocation/
  ├── vehicle-allocation.controller.ts
  ├── vehicle-allocation.service.ts
  ├── vehicle-allocation.repository.ts
  ├── vehicle-allocation.module.ts
  ├── vehicle-allocation.builder.ts
  ├── vehicle-allocation-validation.service.ts
  ├── vehicle-allocation.constants.ts
  └── dto/
      └── save-vehicle-allocation.dto.ts
  ```

  ---

  ### Controller

  **Location**: `src/modules/vehicle-allocation/vehicle-allocation.controller.ts`

  ```typescript
  @Controller('vehicle-allocations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class VehicleAllocationController {
    
    @Get('group-summary/:paperId')
    @Roles('EMPLOYEE')
    async getGroupSummary(@Param('paperId', ParseIntPipe) paperId: number) { }

    @Get(':paperId/vehicle-allocations')
    @Roles('EMPLOYEE')
    async getVehicleAllocations(@Param('paperId', ParseIntPipe) paperId: number) { }

    @Post(':paperId/vehicle-allocations')
    @Roles('EMPLOYEE')
    async saveVehicleAllocations(
      @Param('paperId', ParseIntPipe) paperId: number,
      @Body() dto: SaveVehicleAllocationDto,
    ) { }
  }
  ```

  ---

  ### Endpoints

  #### 1. GET /vehicle-allocations/group-summary/:paperId

  **Purpose**: Get group-wise order summary for allocation planning

  **Auth**: EMPLOYEE

  **Request**:
  ```bash
  curl -X GET http://localhost:3000/vehicle-allocations/group-summary/1 \
    -H "Authorization: Bearer <TOKEN>"
  ```

  **Response** (200 OK):
  ```json
  {
    "summaries": [
      {
        "summaryKey": "1_2",
        "brandId": 1,
        "brandName": "Amul",
        "productGroupId": 2,
        "productGroupName": "Milk",
        "columns": [
          {
            "field": "product_10"
          }
        ],
        "rows": [
          {
            "groupId": 1,
            "groupName": "Group A",
            "product_10": 100,
            "product_11": 150
          }
        ]
      }
    ]
  }
  ```

  ---

  #### 2. GET /vehicle-allocations/:paperId/vehicle-allocations

  **Purpose**: Get all vehicle allocations for paper

  **Auth**: EMPLOYEE

  **Request**:
  ```bash
  curl -X GET http://localhost:3000/vehicle-allocations/1/vehicle-allocations \
    -H "Authorization: Bearer <TOKEN>"
  ```

  **Response** (200 OK):
  ```json
  {
    "allocations": [
      {
        "summaryKey": "1_2",
        "brandId": 1,
        "brandName": "Amul",
        "productGroupId": 2,
        "productGroupName": "Milk",
        "summaryTotal": {
          "product_10": 100,
          "product_11": 150
        },
        "columns": [
          {
            "headerName": "Amul Gold 1L",
            "field": "product_10",
            "productId": 10
          },
          {
            "headerName": "Amul Taaza 500ml",
            "field": "product_11",
            "productId": 11
          }
        ],
        "rows": [
          {
            "vehicleId": 1,
            "vehicleName": "Vehicle A",
            "product_10": 60,
            "product_11": 100
          },
          {
            "vehicleId": 2,
            "vehicleName": "Vehicle B",
            "product_10": 40,
            "product_11": 50
          }
        ]
      }
    ],
    "vehicleAssignments": {
      "assignments": [
        {
          "vehicleId": 1,
          "vehicleName": "Vehicle A",
          "distributorId": 10
        },
        {
          "vehicleId": 2,
          "vehicleName": "Vehicle B",
          "distributorId": 11
        }
      ],
      "distributors": [
        {
          "id": 10,
          "name": "Distributor A"
        },
        {
          "id": 11,
          "name": "Distributor B"
        }
      ]
    }
  }
  ```

  ---

  #### 3. POST /vehicle-allocations/:paperId/vehicle-allocations

  **Purpose**: Save vehicle allocations and distributor assignments

  **Auth**: EMPLOYEE

  **Request**:
  ```bash
  curl -X POST http://localhost:3000/vehicle-allocations/1/vehicle-allocations \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "allocations": [
        {
          "vehicleId": 5,
          "productId": 10,
          "allocatedQty": 100
        },
        {
          "vehicleId": 5,
          "productId": 11,
          "allocatedQty": 150
        }
      ],
      "assignments": [
        {
          "vehicleId": 5,
          "distributorId": 10
        }
      ]
    }'
  ```

  **Request Body (SaveVehicleAllocationDto)**:
  ```typescript
  {
    allocations: {
      vehicleId: number;       // @IsInt(), ✓ required
      productId: number;       // @IsInt(), ✓ required
      allocatedQty: number;    // @IsNumber(), ✓ required
    }[];
    
    assignments: {
      vehicleId: number;       // @IsInt(), ✓ required
      distributorId: number;   // @IsInt(), ✓ required
    }[];
  }
  ```

  **Response** (200 OK):
  ```json
  {
    "allocations": [
      {
        "summaryKey": "1_2",
        "brandId": 1,
        "brandName": "Amul",
        "productGroupId": 2,
        "productGroupName": "Milk",
        "summaryTotal": {
          "product_10": 100,
          "product_11": 150
        },
        "columns": [
          {
            "headerName": "Amul Gold 1L",
            "field": "product_10",
            "productId": 10
          },
          {
            "headerName": "Amul Taaza 500ml",
            "field": "product_11",
            "productId": 11
          }
        ],
        "rows": [
          {
            "vehicleId": 1,
            "vehicleName": "Vehicle A",
            "product_10": 60,
            "product_11": 100
          },
          {
            "vehicleId": 2,
            "vehicleName": "Vehicle B",
            "product_10": 40,
            "product_11": 50
          }
        ]
      }
    ],
    "vehicleAssignments": {
      "assignments": [
        {
          "vehicleId": 1,
          "vehicleName": "Vehicle A",
          "distributorId": 10
        },
        {
          "vehicleId": 2,
          "vehicleName": "Vehicle B",
          "distributorId": 11
        }
      ],
      "distributors": [
        {
          "id": 10,
          "name": "Distributor A"
        },
        {
          "id": 11,
          "name": "Distributor B"
        }
      ]
    }
  }
  ```

  **⚠️ CRITICAL: Edit Rule - DRAFT STATE ONLY**

  Once NIGHT_SUBMITTED is pressed, vehicle allocations are **PERMANENTLY LOCKED** and cannot be modified, even if paper is reopened.

  ---

  ### DTO

  #### SaveVehicleAllocationDto

  ```typescript
  class VehicleAllocationItemDto {
    @IsInt()
    vehicleId!: number;

    @IsInt()
    productId!: number;

    @IsNumber()
    allocatedQty!: number;
  }

  class VehicleAssignmentItemDto {
    @IsInt()
    vehicleId!: number;

    @IsInt()
    distributorId!: number;
  }

  export class SaveVehicleAllocationDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VehicleAllocationItemDto)
    allocations!: VehicleAllocationItemDto[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => VehicleAssignmentItemDto)
    assignments!: VehicleAssignmentItemDto[];
  }
  ```

  ---

  ### Service: VehicleAllocationService

  **Public Methods**:

  #### `getGroupSummary(paperId: number)`

  Returns grouped product summary grids by Brand + Product Group for allocation planning.

  ---

  #### `getVehicleAllocations(paperId: number)`

  Returns allocation grids and vehicle assignment grid generated by VehicleAllocationBuilder.

  ---

  #### `saveVehicleAllocations(paperId: number, dto: SaveVehicleAllocationDto)`

  1. Validate order paper exists
  2. Validate workflow state using WorkflowStateService
  3. Validate allocations using VehicleAllocationValidationService
  4. Validate assignments using VehicleAllocationValidationService
  5. Create vehicle_allocation_paper if missing
  6. Filter allocations where allocatedQty > 0
  7. Replace vehicle allocations
  8. Filter assignments where distributorId exists
  9. Replace vehicle assignments
  10. Return refreshed allocation grids

  ---


  ### VehicleAllocationValidationService

#### validateVehicleAllocations(paperId, dto)

Checks:
1. Build group summary.
2. Calculate required quantity per product.
3. Calculate allocated quantity per product.
4. Validate allocated quantity equals required quantity.

Rule:

Total Allocated Qty per Product
=
Group Summary Qty

---

#### validateVehicleAssignments(paperId, dto)



Checks:

1. Vehicle exists.
2. Distributor exists.
3. Vehicle is assigned only once.
4. Load distributor procurement rules.
5. Expand rules into distributorId + productId combinations.
6. For every allocated product on the vehicle:
   distributorId_productId must exist.
---

#### validateVehicleAllocationsForNightSubmit(paperId)

Checks:
1. Load saved allocations.
2. Validate all products are fully allocated.

---

#### validateVehicleAssignmentsForNightSubmit(paperId)

Checks:
1. Load saved assignments.
2. Find vehicles with allocations.
3. Validate every allocated vehicle has a distributor assignment.

  ### Builder: VehicleAllocationBuilder

  **Location**: `src/modules/vehicle-allocation/vehicle-allocation.builder.ts`

  Responsible for generating vehicle allocation grids, vehicle assignment grids, and applying saved allocation data.

  #### Public Methods

  ##### buildGroupSummary()


Night Group Summary

Grouping:
- Uses master_client.delivery_group_id

Quantity Source:
- Uses order_sheet_items.ordered_qty

  Builds group-wise product summaries from order sheet items.

  Responsibilities:
  - Groups products by Brand + Product Group
  - Aggregates ordered quantities across groups
  - Generates dynamic product columns
  - Produces summary grids used for allocation planning

  ##### buildVehicleAllocationGrids()

  Creates empty vehicle allocation grids.

  Responsibilities:
  - Creates one row per vehicle
  - Creates dynamic product fields
  - Calculates summary totals
  - Builds allocation structure for frontend editing

  ##### applyVehicleAllocations()

  Applies saved vehicle allocation records to allocation grids.

  Responsibilities:
  - Maps vehicle allocations to grid rows
  - Populates allocated quantities
  - Returns hydrated allocation grids

  ##### buildVehicleAssignmentGrid()

  Creates vehicle-distributor assignment grid.

  Responsibilities:
  - Creates one row per vehicle
  - Loads available distributors
  - Initializes empty assignments

  ##### applyVehicleAssignments()

  Applies saved distributor assignments.

  Responsibilities:
  - Maps distributors to vehicles
  - Populates assignment grid
  - Returns hydrated assignment data

  ### Data Models

  **vehicle_allocation_paper**:
  ```typescript
  {
    id: Int;
    order_paper_id: Int @unique;
    created_at: DateTime;
    updated_at: DateTime;
    allocations: vehicle_allocation[];
    assignments: vehicle_distribution_assignment[];
  }
  ```

  **vehicle_allocation**:
  ```typescript
  {
    id: Int;
    vehicle_allocation_paper_id: Int;
    vehicle_id: Int;
    product_id: Int;
    allocated_qty: Decimal(10,2);
    created_at: DateTime;
    updated_at: DateTime;
  }
  ```

  **vehicle_distribution_assignment**:
  ```typescript
  {
    id: Int;
    vehicle_allocation_paper_id: Int;
    vehicle_id: Int;
    distributor_id: Int;
    created_at: DateTime;
    updated_at: DateTime;
  }
  ```

  ---

  ### ⚠️ Permanent Lock Mechanism

  **Why?**
  - Vehicle allocations determine:
    - Product quantities per vehicle
    - Purchase orders per distributor/vehicle
    - Tray exchange expectations
    - Distribution routes

  **If allowed to change after NIGHT_SUBMITTED**:
  - Purchase orders become invalid
  - Route calculations break
  - Tray expectations inconsistent
  - Distributor assignments conflict

  **Implementation**:
  ```typescript
  // WorkflowStateService
  canEditVehicleAllocations(status: OrderPaperStatus): boolean {
    return status === OrderPaperStatus.DRAFT;  // ONLY in DRAFT
  }
  ```

  **Enforcement**:
  ```typescript
  // Before saving
  if (!this.workflowState.canEditVehicleAllocations(paper.status)) {
    throw new BadRequestException(
      'Vehicle allocations are locked after NIGHT_SUBMITTED'
    );
  }
  ```

  ---

  ## Purchase Module

  ### Overview

  Manages procurement orders from distributors. Quantities, rates, and amounts are tracked for each purchase order.

  **Location**: `src/modules/purchase/`

  ---

  ### Files

  ```
  purchase/
  ├── purchase.controller.ts
  ├── purchase.service.ts
  ├── purchase.repository.ts
  ├── purchase.module.ts
  ├── purchase-validation.service.ts
  ├── purchase.constants.ts
  ├── purchase.builder.ts
  └── dto/
      └── purchase.dto.ts
  ```

  ---

  ### Controller

  **Location**: `src/modules/purchase/purchase.controller.ts`

  ```typescript
  @Controller('purchases')
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class PurchaseController {
    
    @Get(':paperId')
    @Roles('EMPLOYEE')
    async getPurchases(@Param('paperId', ParseIntPipe) paperId: number) { }

    @Post(':paperId')
    @Roles('EMPLOYEE')
    savePurchases(
      @Param('paperId', ParseIntPipe) paperId: number,
      @Body() dto: SavePurchaseDto,
    ) { }
  }
  ```

  ---

  ### Endpoints

  #### 1. GET /purchases/:paperId

  **Purpose**: Get all purchase orders for paper

  **Auth**: EMPLOYEE

  **Request**:
  ```bash
  curl -X GET http://localhost:3000/purchases/1 \
    -H "Authorization: Bearer <TOKEN>"
  ```

  **Response** (200 OK):
  ```json
  {
    "purchases": [
      {
        "purchaseKey": "10_1_2",
        "distributorId": 10,
        "distributorName": "Distributor A",
        "brandId": 1,
        "brandName": "Amul",
        "productGroupId": 2,
        "productGroupName": "Milk",
        "columns": [],
        "rows": [
          {
            "vehicleId": 5,
            "vehicleName": "Vehicle A",
            "product_10_allocated": 100,
            "product_10_purchased": 100,
            "product_10_rate": 20,
            "product_10_amount": 2000
          }
        ]
      }
    ]
  }
  ```

  ---

  #### 2. POST /purchases/:paperId

  **Purpose**: Save or update purchase orders

  **Auth**: EMPLOYEE

  **Request**:
  ```bash
  curl -X POST http://localhost:3000/purchases/1 \
    -H "Authorization: Bearer <TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{
      "entries": [
        {
          "distributorId": 10,
          "vehicleId": 5,
          "productId": 10,
          "purchasedQty": 100
        },
        {
          "distributorId": 10,
          "vehicleId": 5,
          "productId": 11,
          "purchasedQty": 150
        }
      ]
    }'
  ```

  **Request Body (SavePurchaseDto)**:
  ```typescript
  {
    entries: {
      distributorId: number;    // @IsInt(), ✓ required
      vehicleId: number;        // @IsInt(), ✓ required
      productId: number;        // @IsInt(), ✓ required
      purchasedQty: number;     // @IsNumber(), ✓ required
    }[];
  }
  ```

  **Response** (200 OK):
  ```json
  {
    "purchases": [
      {
        "purchaseKey": "10_1_2",
        "distributorId": 10,
        "distributorName": "Distributor A",
        "brandId": 1,
        "brandName": "Amul",
        "productGroupId": 2,
        "productGroupName": "Milk",
        "columns": [],
        "rows": []
      }
    ]
  }
  ```

**Auto-calculated Fields**:
- `allocated_qty`: derived from matching `vehicle_allocation`
- `gatepass_date`: resolved from `order_paper.sale_date` and the purchased product brand's `gatepass_date_policy`
- `purchase_rate`: looked up from `distributor_product_rate` using `distributorId + productId + gatepass_date`
- `purchase_amount`: `purchased_qty × purchase_rate`


  ---

  ### DTO

  #### SavePurchaseDto

  ```typescript
  class PurchaseEntryDto {
    @IsInt()
    distributorId!: number;

    @IsInt()
    vehicleId!: number;

    @IsInt()
    productId!: number;

    @IsNumber()
    purchasedQty!: number;
  }

  export class SavePurchaseDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PurchaseEntryDto)
    entries!: PurchaseEntryDto[];
  }
  ```

  ---

  ### Service: PurchaseService

  **Public Methods**:

  #### `getPurchases(paperId: number)`

1. Validate order paper exists.
2. Validate vehicle allocation paper exists.
3. Validate vehicle assignments exist.
4. Load products.
5. Load procurement rules.
6. Build purchase grids.
7. Load saved vehicle allocations.
8. Apply vehicle allocations to grids.
9. For each allocation:
   - find the vehicle's assigned distributor
   - resolve gatepass date from `order_paper.sale_date` and brand `gatepass_date_policy`
   - load applicable distributor product rate for that distributor + product + gatepass date
10. Apply those rate defaults to the purchase grids.
11. If purchase paper exists, load saved purchase entries.
12. Apply saved purchase entries.
13. Return grids.


### Vehicle–Distributor Assignment Rule

Purchase logic assumes one distributor assignment per vehicle for a paper.

Source:
- `vehicle_distribution_assignment`

Rule:
- each vehicle can be assigned to exactly one distributor
- purchase rate defaults are resolved using that assigned distributor

  ---



#### `savePurchases(paperId: number, dto: SavePurchaseDto)`

1. Validate order paper exists.
2. Validate workflow state.
3. Validate purchases.
4. Filter DTO entries to rows where `purchasedQty > 0`.
5. Create purchase paper if missing.
6. Load vehicle allocations.
7. Build allocation lookup map using `vehicleId + productId`.
8. For each purchase entry:
   - find matching allocation
   - resolve gatepass date from `order_paper.sale_date` and brand `gatepass_date_policy`
   - load applicable distributor product rate for `distributorId + productId + gatepassDate`
   - calculate purchase amount
9. Replace all purchase entries for the purchase paper.
10. Return refreshed purchase grids.

  ---

  #### Purchase Validation Rules

  - purchasedQty cannot be negative
  - Product must exist
  - Vehicle must exist
  - Distributor must exist
  - Vehicle must be assigned to the distributor
  - Procurement rule must exist for distributor + product
  - Vehicle allocation must exist
  - purchasedQty cannot exceed allocatedQty


  --- 

  ### PurchaseValidationService

#### validatePurchases(paperId, dto)

Checks:

1. Product exists.
2. Vehicle exists.
3. Distributor exists.
4. purchasedQty cannot be negative.
5. purchasedQty = 0 is allowed and skipped during validation.
6. Vehicle belongs to assigned distributor.
7. Procurement rule exists for distributor + product.
8. Allocation exists for vehicle + product.
9. Purchased quantity does not exceed allocated quantity.

---

#### validatePurchasesComplete(paperId)

Checks:

1. purchase_paper exists.
2. Vehicle allocations exist.
3. Every vehicle allocation has a purchase entry.

---

  ### Builder: PurchaseBuilder

  **Location**: `src/modules/purchase/purchase.builder.ts`

  Responsible for generating purchase grids and progressively enriching them with allocation, rate, and purchase-entry data.

  #### Public Methods

  ##### buildPurchaseGrids()

  Creates purchase grids from procurement rules.

  Responsibilities:
  - Groups products by Distributor + Brand + Product Group
  - Only vehicles assigned to the distributor are included.
  - Grids with no assigned vehicles are not generated.
  - Filters vehicles assigned to each distributor
  - Creates dynamic product columns
  - Generates empty purchase rows

  ##### applyVehicleAllocations()

  Applies vehicle allocation quantities.

  Responsibilities:
  - Populates allocated quantities
  - Initializes purchased quantities with allocated values
  - Pre-fills purchase grid
  - 
   Formula:
   Purchased Qty = Allocated Qty

 ##### applyPurchaseRates()

Applies resolved purchase-rate defaults to the purchase grids.

Input:
- distributorId
- vehicleId
- productId
- purchaseRate

Responsibilities:
- finds the matching purchase grid using distributor + product presence
- finds the matching vehicle row
- sets `product_{id}_rate`
- recalculates `product_{id}_amount` using current purchased quantity

Formula:
purchase_amount = purchased_qty × purchase_rate


  ##### applyPurchaseEntries()

  Applies saved purchase entries.

  Responsibilities:
  - Loads previously saved purchases
  - Restores purchased quantities
  - Restores rates
  - Restores amounts
  - Returns fully hydrated purchase grids

### Purchase Grid Row Structure

```typescript
{
  vehicleId,
  vehicleName,

  product_{id}_allocated,
  product_{id}_purchased,
  product_{id}_rate,
  product_{id}_amount
}
```

### Purchase Column Structure

For every product, the builder generates:

```text
Product
├── Allocated
├── Purchased
├── Rate
└── Amount
```

Allocated → read-only
Purchased → editable
Rate → read-only
Amount → read-only

Example:

```typescript
{
  headerName: 'Amul Gold 1L',
  children: [
    {
      headerName: 'Allocated',
      field: 'product_10_allocated',
    },
    {
      headerName: 'Purchased',
      field: 'product_10_purchased',
    },
    {
      headerName: 'Rate',
      field: 'product_10_rate',
    },
    {
      headerName: 'Amount',
      field: 'product_10_amount',
    },
  ],
}
```

  ### Data Model

  **purchase_paper**:
  ```typescript
  {
    id: Int;
    order_paper_id: Int @unique;
    created_at: DateTime;
    updated_at: DateTime;
    entries: purchase_entry[];
  }
  ```

  **purchase_entry**:
```typescript
{
  id: Int;
  purchase_paper_id: Int;
  distributor_id: Int;
  vehicle_id: Int;
  product_id: Int;
  purchased_qty: Decimal(10,2);
  purchase_rate: Decimal(10,2);       // From distributor_product_rate
  purchase_amount: Decimal(12,2);     // Calculated: qty × rate
  allocated_qty: Decimal(10,2)?;      // From vehicle_allocation
  gatepass_date: DateTime @db.Date;          // Resolved from brand gatepass policy
  created_at: DateTime;
  updated_at: DateTime;
}
  ```

  ---

  ### Purchase Rate Lookup

  **Table**: `distributor_product_rate`

  ```typescript
  {
    id: Int;
    distributor_id: Int;
    product_id: Int;
    purchase_rate: Decimal(10,2);      // Cost per unit
    selling_rate: Decimal(10,2);       // Resale rate
    effective_from: DateTime;
    effective_to: DateTime?;
    is_active: Boolean;
  }
  ```

  **Query Logic**:
  ```typescript
  // Find active rate for distributor + product
  const rate = await prisma.distributor_product_rate.findFirst({
  where: {
    distributor_id,
    product_id,
    is_active: true,
    effective_from: { lte: gatepassDate },
    OR: [
      { effective_to: null },
      { effective_to: { gte: gatepassDate } },
    ],
  },
  orderBy: {
    effective_from: 'desc',
  },
});
  ```

  ---

  ### Edit Rules

  ```
  NIGHT_SUBMITTED: ✅ Editable (after orders known)
  REOPENED:        ✅ Editable (for corrections)
  Other states:    ❌ Locked
  ```

  **Rationale**: Purchases depend on:
  1. Night order quantities (known after NIGHT_SUBMITTED)
  2. Vehicle allocations (frozen at NIGHT_SUBMITTED)
  3. Distributor rates (stable, historical)

  ---


### Default Purchase Quantity

When allocations are applied:

Purchased Qty = Allocated Qty

Users may modify Purchased Qty before saving.



  ## Vehicle & Purchase Workflow Summary

  ### Vehicle Allocation Workflow

  ```
  1. DRAFT: Plan vehicle allocations
    - Decide which product goes to which vehicle
    - Assign vehicles to distributors
    - Lock by pressing "NIGHT_SUBMITTED"

  2. NIGHT_SUBMITTED onwards:
    - ⚠️ PERMANENTLY LOCKED
    - Cannot modify (even if reopened)
    - Routes are set, tray expectations calculated
    - Cash Settlement reconciliation depends on finalized route collections
  ```

  ### Purchase Workflow

  ```text
  1. NIGHT_SUBMITTED: Enter purchase orders
    - Vehicle allocations are already frozen
    - Purchase grids are prefilled from vehicle allocations
    - Employee reviews / edits purchased quantities per distributor / vehicle / product
    - System resolves gatepass date per product brand
- System applies distributor purchase rates using distributor + product + gatepass date
    - System calculates purchase amounts
    - System resolves purchase_entry.gatepass_date from brand gatepass policy

  2. Can edit in:
    - NIGHT_SUBMITTED
    - REOPENED

  3. Locked in:
    - DRAFT
    - MORNING_SUBMITTED
    - FINALIZED
  ```



### Purchase Gatepass Date Logic

Each `purchase_entry` stores its own `gatepass_date`.

Resolution rule:
- `SAME_DAY` → `purchase_entry.gatepass_date = order_paper.sale_date`
- `PREVIOUS_DAY` → `purchase_entry.gatepass_date = order_paper.sale_date - 1 day`

Source of policy:
- `master_brand.gatepass_date_policy`

Why this matters:
- Different brands may follow different dairy gatepass date rules.
- Historical purchase rate lookup must use `purchase_entry.gatepass_date`.
- Distributor outstanding and purchase-date-sensitive accounting should use `purchase_entry.gatepass_date`, not the paper's generic workflow date.

  ---

  ## Integration Example

  **Complete Daily Workflow**:

```text
Day starts (DRAFT):
1. Create paper
2. Enter night orders
3. Plan vehicle allocations
4. Assign vehicles to distributors
5. Click NIGHT_SUBMITTED
   - vehicle allocations become permanently locked

Working phase after NIGHT_SUBMITTED:
1. Record morning delivery quantities / shortages
2. Complete trays entry
3. Complete collections entry
4. Enter purchase quantities
   - system pre-fills purchased quantity from vehicle allocation
   - system resolves gatepass date from `order_paper.sale_date` and brand gatepass policy
   - system looks up purchase rate using distributor + product + gatepass date
   - system calculates purchase amount
   - saved `purchase_entry` stores allocated_qty, purchased_qty, purchase_rate, purchase_amount, gatepass_date
5. Complete cash settlement
   - route expenses
   - route denominations
   - direct collections
   - bank deposits
6. Click MORNING_SUBMITTED

After MORNING_SUBMITTED:
1. Admin completes admin-side collection fields if applicable
2. Admin reviews paper
3. Admin finalizes paper

If paper is REOPENED:
1. Purchases can be corrected
2. Collections and trays can be corrected according to reopen rules
3. Vehicle allocations still cannot be changed
4. Cash settlement remains partially editable according to reopen rules
5. Admin finalizes again

  ```

  ---

  ## Relationship with Delivery Summary

Vehicle Allocation and Purchase modules operate using
Night Group Summary data.

Night Group Summary:
- Uses delivery_group_id
- Uses ordered_qty
- Used for vehicle allocation planning
- Used for purchase planning

Delivery Summary module operates independently.

Billing Group Summary

Grouping:
- Uses master_client.billing_group_id

Quantity Source:
- Uses order_sheet_items.delivered_qty

Billing Group Summary:
- Used for billing reconciliation
- Not used for vehicle allocation
- Not used for purchase generation

Reason:
Purchases are planned before delivery occurs, therefore
purchase quantities must be based on ordered quantities
grouped by delivery routes, not billing groups.

  ## Summary

  ### Vehicle Allocation Module
  - **Purpose**: Daily load planning
  - **Edit Rule**: DRAFT only (PERMANENTLY LOCKED after)
  - **Constraints**: Cannot modify after NIGHT_SUBMITTED
  - **Uses**: Purchase orders, tray expectations, distribution routes


### Purchase Module
- **Purpose**: Procurement order management
- **Edit Rules**: NIGHT_SUBMITTED, REOPENED
- **Auto-calculated**: purchase_rate, purchase_amount, allocated_qty, gatepass_date
- **Lookup**: distributor_product_rate table
- **Dependencies**: vehicle_allocation, order_paper, workflow_state

  ---

  **Last Updated**: 2026-06-16
