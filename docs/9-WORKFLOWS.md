# End-to-End Workflows

## Complete Daily Order Workflow

### Overview

A complete day in the Milk Distribution system involves these phases:

1. **DRAFT Phase** (Early Morning): Night order entry and planning
2. **NIGHT_SUBMITTED Phase** (Morning): Morning delivery and collections
3. **MORNING_SUBMITTED Phase** (Afternoon): Admin review and finalization
4. **FINALIZED Phase** (Evening): Ready for distribution

---

### Phase 1: DRAFT (Early Morning)

**Time**: 4:00 AM - 10:00 AM  
**Status**: DRAFT  
**Editable**: 
- Night entries,
- Vehicle allocations,
- Office amounts / Night collections  

```mermaid
sequenceDiagram
    actor E as Employee
    participant API as API Server
    participant DB as Database
    
    Note over E,DB: 1. Create Daily Paper
    E->>API: POST /papers {date: "2026-06-16"}
    API->>DB: CREATE order_paper (DRAFT status)
    API->>DB: CREATE order_sheet (one per group)
    API-->>E: Paper created {id: 1, status: DRAFT}
    
    Note over E,DB: 2. Enter Night Orders
    E->>API: POST /orders/sheet/1/night-save [entries]
    API->>DB: INSERT order_sheet_items (ordered_qty)
    API-->>E: Orders saved
    
    Note over E,DB: 3. Plan Vehicle Allocations
    E->>API: POST /vehicle-allocations/1/vehicle-allocations {allocations, assignments}
    API->>DB: CREATE vehicle_allocation records
    API->>DB: CREATE vehicle_distribution_assignment
    API-->>E: Allocations saved
    
    Note over E,DB: 4. Enter Office Amounts
    E->>API: POST /collections/sheet/1/night-save [entries]
    API->>DB: UPDATE client_collection (office_amount_given)
    API-->>E: Collections saved
    
    Note over E,DB: 5. Submit Night Entries
    E->>API: POST /papers/1/submit-night
    API->>DB: UPDATE order_paper (status = NIGHT_SUBMITTED)
    API-->>E: Paper transitioned (allocations LOCKED)
```

**Key Activities**:
1. System creates daily paper with one sheet per delivery group
2. Employee enters product quantities for each client
3. Employee allocates products to vehicles for optimal routes
4. Employee records advance amounts given to clients
5. Employee locks night entries

**Restrictions After Step 6**:
- ❌ Cannot modify night orders
- ❌ Cannot modify vehicle allocations (PERMANENT LOCK)
- ✅ Can enter morning data
- ✅ Can enter purchases

---

### Phase 2: NIGHT_SUBMITTED (Morning to Afternoon)

**Time**: 10:00 AM - 2:00 PM  
**Status**: NIGHT_SUBMITTED  
**Editable**: Morning deliveries, Night Collections,Morning Collections, Purchases, Trays  

```mermaid
sequenceDiagram
    actor E as Employee
    participant API as API Server
    participant DB as Database
    
    Note over E,DB: 1. Record Morning Deliveries
    E->>API: POST /orders/sheet/1/morning-save [entries]
    API->>DB: UPDATE order_sheet_items (delivered_qty)
    API-->>E: Deliveries saved
    Note over E,DB: 2. Record Morning Collections
    E->>API: POST /collections/sheet/1/morning-save [entries]
    API->>DB: UPDATE client_collection (cash_collection,cheque_collection,employee_remarks)
    API-->>E: Collections saved
    
    Note over E,DB: 3. Enter Purchase Orders
    E->>API: POST /purchases/1 [entries]
    API->>DB: CREATE purchase_entry (qty, rate, amount)
    API-->>E: Purchases saved
    
    Note over E,DB: 4. Record Tray Returns
    E->>API: POST /trays/sheet/1/save [entries]
    API->>DB: UPDATE client_tray_transaction (trays_returned)
    API-->>E: Trays saved
    
    Note over E,DB: 5. Submit Morning Entries
    E->>API: POST /papers/1/submit-morning
    API->>DB: UPDATE order_paper (status = MORNING_SUBMITTED)
    API-->>E: Paper transitioned
```

**Key Activities**:
1. Morning deliveries recorded (actual vs ordered quantities)
2. Billing group summary generated from delivered quantities
3. Client collections recorded (multiple payment methods)
4. Purchase orders entered
5. Tray exchanges recorded (returns by clients)
6. Morning entries locked for admin review

**Restrictions After Step 5**:
- ❌ Cannot modify morning deliveries
- ❌ Cannot modify purchases
- ❌ Cannot modify trays
- ❌ Cannot modify night collections (UNLESS paper is REOPENED)
- ✅ Admin can add collection remarks

---

### Phase 3: MORNING_SUBMITTED (Afternoon)

**Time**: 2:00 PM - 4:00 PM  
**Status**: MORNING_SUBMITTED  
**Editable**: Admin collections 

```mermaid
sequenceDiagram
    actor A as Admin
    participant API as API Server
    participant DB as Database
    
    Note over A,DB: 1. Review Collections
    A->>API: GET /collections/sheet/1
    API->>DB: SELECT client_collection with all amounts
    API-->>A: Collections grid
    
    Note over A,DB: 2. Add Admin Remarks
    A->>API: POST /collections/sheet/1/admin-save [entries]
    UPDATE client_collection (
  online_collection,
  bank_deposit,
  admin_remarks
)
    
    Note over A,DB: 3. Finalize Paper
    A->>API: POST /papers/1/finalize
    API->>DB: UPDATE order_paper (status = FINALIZED)
    API-->>A: Paper finalized
```

**Key Activities**:
1. Admin reviews all collections from employees
2. Admin records online collections, bank deposits and remarks
3. Admin finalizes paper

**Restrictions After Step 3**:
- ❌ Cannot modify anything
- ✅ Can reopen if needed

---

### Phase 4: FINALIZED (Evening & Beyond)

**Time**: 4:00 PM onwards  
**Status**: FINALIZED  
**Editable**: None (unless reopened)  

```mermaid
graph LR
    FIN["FINALIZED<br/>Ready for Distribution"]
    
    FIN -->|Admin detects error| REOPEN["REOPEN<br/>Enter corrections"]
    REOPEN -->|Re-enter data| FIN2["FINALIZED<br/>Again"]
    
    style FIN fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style REOPEN fill:#ffccbc,stroke:#d84315,stroke-width:2px
    style FIN2 fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

**If Error Detected**:
1. Admin clicks POST /papers/:paperId/reopen
2. Paper transitions to REOPENED status
3. Admin can re-enter morning deliveries
4. Admin can update night collections
5. Admin can update morning collections
6. Admin can update admin collections
7. Admin can update purchases
8. Admin can update trays
9. Vehicle allocations remain LOCKED
10. Admin finalizes again

---

## Detailed User Workflows

### Workflow 1: New Daily Paper Creation

**User**: EMPLOYEE  
**Duration**: 5 minutes  
**Sequence**:

```bash
# 1. Get JWT token
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -d '{"username":"emp1","password":"pass"}' \
  | jq -r '.accessToken')

# 2. Create paper for tomorrow
curl -X POST http://localhost:3000/papers \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-06-17"}'

# Response:
 {
  "id": 1,
  "order_date": "2026-06-17",
  "sale_date": "2026-06-18",
  "status": "DRAFT",
  "night_entry_submitted_at": null,
  "morning_entry_submitted_at": null,
  "finalized_at": null,
  "reopened_at": null,
  "reopen_reason": null,
  "created_at": "2026-06-16T10:00:00Z",
  "updated_at": "2026-06-16T10:00:00Z",
}

echo "Paper created with ID: 1"
```

---

### Workflow 2: Night Order Entry

**User**: EMPLOYEE  
**Duration**: 30 minutes  
**Paper Status**: DRAFT  

```bash
# 1. Fetch order sheet for group 1
curl -X GET http://localhost:3000/orders/sheet/1 \
  -H "Authorization: Bearer $TOKEN"

# 2. Enter orders for 10 clients × 3 products each = 30 items
curl -X POST http://localhost:3000/orders/sheet/1/night-save \
  -H "Authorization: Bearer $TOKEN" \
  -d '  {
  "success": true,
  "message": "Night entries saved successfully"
}
'
```

---

### Workflow 3: Vehicle Allocation Planning

**User**: EMPLOYEE  
**Duration**: 20 minutes  
**Paper Status**: DRAFT  

```bash
# 1. Get group summary to see what products need allocation
curl -X GET http://localhost:3000/vehicle-allocations/group-summary/1 \
  -H "Authorization: Bearer $TOKEN"

# Response shows total quantities per product needed

# 2. Allocate to vehicles and assign distributors
curl -X POST http://localhost:3000/vehicle-allocations/1/vehicle-allocations \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
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
  }'

echo "Vehicle allocations saved (will be LOCKED after night submit)"
```

---

### Workflow 4: Night Submission

**User**: EMPLOYEE  
**Duration**: 2 minutes  
**Paper Status**: DRAFT → NIGHT_SUBMITTED  

```bash
# All night data entered, now lock it
curl -X POST http://localhost:3000/papers/1/submit-night \
  -H "Authorization: Bearer $TOKEN"

# Response:
{
  "id": 1,
  "status": "NIGHT_SUBMITTED",
  "night_entry_submitted_at": "2026-06-16T10:15:00Z",
  "updated_at": "2026-06-16T10:15:00Z"
}

echo "⚠️ CRITICAL: Vehicle allocations are now PERMANENTLY LOCKED"
```

---

### Workflow 5: Morning Deliveries Recording

**User**: EMPLOYEE  
**Duration**: 45 minutes  
**Paper Status**: NIGHT_SUBMITTED  

```bash
# 1. Record actual deliveries for each client-product
curl -X POST http://localhost:3000/orders/sheet/1/morning-save \
  -H "Authorization: Bearer $TOKEN" \
  -d '[
    {"clientId": 10, "productId": 5, "deliveredQty": 95},
    {"clientId": 10, "productId": 6, "deliveredQty": 48},
    {"clientId": 11, "productId": 5, "deliveredQty": 150},
    ...more deliveries...
  ]'

# 2. Record morning collections
curl -X POST http://localhost:3000/collections/sheet/1/morning-save \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "entries": [
      {
        "clientId": 10,
        "cashCollection": 2000,
        "chequeCollection": 1000,
        "employeeRemarks": "Check #123"
      },
      {"clientId": 11, "cashCollection": 3000, ...}
    ]
  }'

# 3. Record tray returns
curl -X POST http://localhost:3000/trays/sheet/1/save \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
  "success": true,
  "message": "Morning entries saved successfully"
}'
```
After deliveries are entered, billing summaries become available.

---




### Workflow 6: Billing Group Summary

Prerequisites:
- Paper exists
- Morning deliveries entered
- delivered_qty populated

User: EMPLOYEE
Duration: Instant
Paper Status: NIGHT_SUBMITTED

# Generate billing summary from delivered quantities

GET /delivery-summary/:paperId

curl -X GET http://localhost:3000/delivery-summary/1 \
  -H "Authorization: Bearer $TOKEN"

System:
- Reads order_sheet_items.delivered_qty
- Reads master_client.billing_group_id
- Groups products by billing group
- Produces billing summary grids

Purpose:
- Billing reconciliation
- Compare purchases against actual delivered quantities
- Reporting

Notes:
- Read-only
- No persistence
- No save endpoint

---

#### Purchase Module Prerequisites

**Before purchases can be generated:**

1. Order paper must exist
2. Vehicle allocation paper must exist
3. Vehicle assignments must exist
4. Vehicle allocations must exist
5. Distributor procurement rules must exist
6. Distributor procurement rates must exist

---

### Workflow 7: Purchase Order Entry

**User**: EMPLOYEE  
**Duration**: 15 minutes  
**Paper Status**: NIGHT_SUBMITTED  

```bash
# Enter purchase orders from distributors
curl -X POST http://localhost:3000/purchases/1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "entries": [
      {
        "distributorId": 10,
        "vehicleId": 5,
        "productId": 5,
        "purchasedQty": 500
      },
      {
        "distributorId": 10,
        "vehicleId": 5,
        "productId": 6,
        "purchasedQty": 300
      },
      {
        "distributorId": 11,
        "vehicleId": 6,
        "productId": 5,
        "purchasedQty": 400
      }
    ]
  }'

# System auto-calculates:
# - purchase_rate from distributor_product_rate
# - purchase_amount = qty × rate
```

---

### Workflow 8: Morning Submission

**User**: EMPLOYEE  
**Duration**: 1 minute  
**Paper Status**: NIGHT_SUBMITTED → MORNING_SUBMITTED  

```bash
# Lock morning data for admin review
curl -X POST http://localhost:3000/papers/1/submit-morning \
  -H "Authorization: Bearer $TOKEN"

# Response:
# {
#   "id": 1,
#   "status": "MORNING_SUBMITTED",
#   "morning_entry_submitted_at": "2026-06-16T14:00:00Z"
# }
```

---

### Workflow 9: Admin Finalization

**User**: ADMIN  
**Duration**: 10 minutes  
**Paper Status**: MORNING_SUBMITTED → FINALIZED  

```bash
# Switch to admin user
ADMIN_TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -d '{"username":"admin1","password":"pass"}' \
  | jq -r '.accessToken')

# 1. Review collections
curl -X GET http://localhost:3000/collections/sheet/1 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Add admin remarks
curl -X POST http://localhost:3000/collections/sheet/1/admin-save \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "entries": [
     {
  "clientId": 10,
  "onlineCollection": 500,
  "bankDeposit": 1000,
  "adminRemarks": "Verified and approved"
}
]
  }'

# 3. Finalize paper
curl -X POST http://localhost:3000/papers/1/finalize \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Response:
# {
#   "id": 1,
#   "status": "FINALIZED",
#   "finalized_at": "2026-06-16T16:00:00Z"
# }

echo "✅ Paper finalized. Ready for distribution."
```

---

### Workflow 10: Correction After Finalization (Reopen)

**User**: ADMIN  
**Scenario**: Client address error discovered after finalization  
**Duration**: 20 minutes  

```bash
# 1. Reopen paper
curl -X POST http://localhost:3000/papers/1/reopen \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason": "Client 10 address correction needed"}'

# Paper now in REOPENED status

# 2. Admin re-enters morning deliveries
curl -X POST http://localhost:3000/orders/sheet/1/morning-save \
 -H "Authorization: Bearer $ADMIN_TOKEN"
  -d '[
    {"clientId": 10, "productId": 5, "deliveredQty": 100},
    ...corrections...
  ]'

# 3. Admin updates collections if needed
curl -X POST http://localhost:3000/collections/sheet/1/morning-save \
  -H "Authorization: Bearer $ADMIN_TOKEN"\
  -d '...'

# 4. Admin re-finalizes
curl -X POST http://localhost:3000/papers/1/finalize \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Paper back to FINALIZED status
```

---

## State Machine Diagram

```mermaid
graph LR
    A["DRAFT<br/>(Early Morning)"]
    B["NIGHT_SUBMITTED<br/>(Morning)"]
    C["MORNING_SUBMITTED<br/>(Afternoon)"]
    D["FINALIZED<br/>(Evening)"]
    E["REOPENED<br/>(Correction)"]
    
    A -->|submit-night| B
    B -->|submit-morning| C
    C -->|finalize| D
    D -->|reopen + reason| E
    E -->|re-enter data| E
    E -->|finalize| D
    
    A -->|night orders| A
    A -->|vehicle allocation| A
    A -->|office amounts| A
    
    B -->|morning deliveries| B
    B -->|collections| B
    B -->|purchases| B
    B -->|trays| B
    
    C -->|admin remarks| C
    
    E -->|morning deliveries| E
    E -->|collections| E
    E -->|purchases| E
    E -->|trays| E
    
    style A fill:#e1f5ff,stroke:#0277bd,stroke-width:2px
    style B fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style C fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style D fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style E fill:#ffccbc,stroke:#d84315,stroke-width:2px
```

---

## Edit Rules Matrix

```
Operation              | DRAFT | NIGHT_SUBMITTED | MORNING_SUBMITTED | FINALIZED | REOPENED
Night Orders           |  ✅   |       ❌        |        ❌          |    ❌     |    ❌
Vehicle Allocations    |  ✅   |    ❌ LOCK      |     ❌ LOCK        |  ❌ LOCK  |  ❌ LOCK
Morning Deliveries     |  ❌   |       ✅        |        ❌          |    ❌     |    ✅
Night Collections      |  ✅   |       ✅        |        ❌          |    ❌     |    ✅
Morning Collections    |  ❌   |       ✅        |        ❌          |    ❌     |    ✅
Admin Collections      |  ❌   |       ❌        |        ✅          |    ❌     |    ✅
Purchases              |  ❌   |       ✅        |        ❌          |    ❌     |    ✅
Trays                  |  ❌   |       ✅        |        ❌          |    ❌     |    ✅
Finalize               |  ❌   |       ❌        |        ✅          |    ❌     |    ✅
Reopen                 |  ❌   |       ❌        |        ❌          |    ✅     |    ❌
```

---

## Performance Metrics

### Typical Duration

| Phase | Duration | Data Volume |
|-------|----------|-------------|
| DRAFT | 4-6 hours | 500-1000 orders |
| NIGHT_SUBMITTED | 3-4 hours | 500-1000 deliveries |
| MORNING_SUBMITTED | 30 min | Collections verified |
| FINALIZED | Ongoing | Ready for delivery |

---

## Summary

The workflow enforces:
1. **Structured Data Entry**: Night → Morning → Admin verification
2. **Locked States**: Once submitted, cannot modify (unless reopened)
3. **Permanent Locks**: Vehicle allocations locked permanently (critical business rule)
4. **Role Separation**:
   - EMPLOYEE enters normal operational data
   - ADMIN can perform everything EMPLOYEE can perform
   - ADMIN additionally performs review, reopen and finalization
5. **Error Recovery**: Reopen capability for corrections

---

**Last Updated**: 2026-06-16
