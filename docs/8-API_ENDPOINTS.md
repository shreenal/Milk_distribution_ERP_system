# Complete API Endpoints Reference

## Authentication

### POST /auth/login

Login and receive JWT token.

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "user1",
    "password": "password123"
  }'
```

**Response** (200):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "user1",
    "role": "EMPLOYEE"
  }
}
```

**Error** (401):
```json
{"statusCode": 401, "message": "Invalid credentials"}
```

---

### GET /auth/me

Get current authenticated user.

```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "id": 1,
  "username": "user1",
  "role": "EMPLOYEE"
}
```

---

## Paper Management

### POST /papers

Generate daily order paper.

```bash
curl -X POST http://localhost:3000/papers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"date": "2026-06-17"}'
```

**Response** (200):
```json
{
  "id": 1,
  "order_date": "2026-06-17",
  "status": "DRAFT",
  "order_sheets": [
    {"id": 1, "group_id": 1}
  ]
}
```

---

### GET /papers/today

Get today's paper or latest.

```bash
curl -X GET http://localhost:3000/papers/today \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "type": "TODAY",
  "paper": {
    "id": 1,
    "order_date": "2026-06-16",
    "status": "DRAFT"
  }
}
```

---

### POST /papers/:paperId/submit-night

Submit night entries.

```bash
curl -X POST http://localhost:3000/papers/1/submit-night \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "id": 1,
  "status": "NIGHT_SUBMITTED",
  "night_entry_submitted_at": "2026-06-16T10:15:00Z"
}
```

---

### POST /papers/:paperId/submit-morning

Submit morning entries.

```bash
curl -X POST http://localhost:3000/papers/1/submit-morning \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "id": 1,
  "status": "MORNING_SUBMITTED",
  "morning_entry_submitted_at": "2026-06-16T14:00:00Z"
}
```

---

### POST /papers/:paperId/finalize

Finalize paper (ADMIN only).

```bash
curl -X POST http://localhost:3000/papers/1/finalize \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Response** (200):
```json
{
  "id": 1,
  "status": "FINALIZED",
  "finalized_at": "2026-06-16T16:00:00Z"
}
```

---

### POST /papers/:paperId/reopen

Reopen paper (ADMIN only).

```bash
curl -X POST http://localhost:3000/papers/1/reopen \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Client address correction"}'
```

**Response** (200):
```json
{
  "id": 1,
  "status": "REOPENED",
  "reopen_reason": "Client address correction"
}
```

---

## Orders

### GET /orders/sheet/:sheetId

Get order sheet with items.

```bash
curl -X GET http://localhost:3000/orders/sheet/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "id": 1,
  "order_paper_id": 1,
  "items": [
    {
      "id": 1,
      "client_id": 10,
      "product_id": 5,
      "ordered_qty": 100
    }
  ]
}
```

---

### POST /orders/sheet/:sheetId/night-save

Save night orders.

```bash
curl -X POST http://localhost:3000/orders/sheet/1/night-save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "clientId": 10,
      "productId": 5,
      "orderedQty": 100
    }
  ]'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "client_id": 10,
    "product_id": 5,
    "ordered_qty": 100
  }
]
```

---

### POST /orders/sheet/:sheetId/morning-save

Save morning deliveries.

```bash
curl -X POST http://localhost:3000/orders/sheet/1/morning-save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "clientId": 10,
      "productId": 5,
      "deliveredQty": 95
    }
  ]'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "delivered_qty": 95
  }
]
```

---

## Collections

### GET /collections/sheet/:sheetId

Get collections grid.

```bash
curl -X GET http://localhost:3000/collections/sheet/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
[
  {
    "id": 1,
    "client_id": 10,
    "cash_collection": 500.00,
    "cheque_collection": 1000.00
  }
]
```

---

### POST /collections/sheet/:sheetId/night-save

Save night collections.

```bash
curl -X POST http://localhost:3000/collections/sheet/1/night-save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "clientId": 10,
        "officeAmountGiven": 500.00
      }
    ]
  }'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "office_amount_given": 500.00
  }
]
```

---

### POST /collections/sheet/:sheetId/morning-save

Save morning collections.

```bash
curl -X POST http://localhost:3000/collections/sheet/1/morning-save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "clientId": 10,
        "cashCollection": 500.00,
        "chequeCollection": 1000.00,
        "onlineCollection": 250.00,
        "bankDeposit": 0.00
      }
    ]
  }'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "cash_collection": 500.00,
    "cheque_collection": 1000.00
  }
]
```

---

### POST /collections/sheet/:sheetId/admin-save

Admin collections (ADMIN only).

```bash
curl -X POST http://localhost:3000/collections/sheet/1/admin-save \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "clientId": 10,
        "adminRemarks": "Verified"
      }
    ]
  }'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "admin_remarks": "Verified"
  }
]
```

---

## Trays

### GET /trays/sheet/:sheetId

Get tray grid.

```bash
curl -X GET http://localhost:3000/trays/sheet/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
[
  {
    "id": 1,
    "client_id": 10,
    "tray_type_id": 1,
    "opening_balance": 50,
    "trays_taken": 45,
    "trays_returned": 30,
    "closing_balance": 65
  }
]
```

---

### POST /trays/sheet/:sheetId/save

Save tray returns.

```bash
curl -X POST http://localhost:3000/trays/sheet/1/save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "clientId": 10,
      "trayTypeId": 1,
      "returned": 30
    }
  ]'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "trays_returned": 30,
    "closing_balance": 65
  }
]
```

---

## Vehicle Allocation

### GET /vehicle-allocations/group-summary/:paperId

Get group summary.

```bash
curl -X GET http://localhost:3000/vehicle-allocations/group-summary/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
[
  {
    "group_id": 1,
    "group_name": "Bangalore Group 1",
    "total_items": 250,
    "products": [
      {
        "product_id": 10,
        "total_qty": 100
      }
    ]
  }
]
```

---

### GET /vehicle-allocations/:paperId/vehicle-allocations

Get allocations.

```bash
curl -X GET http://localhost:3000/vehicle-allocations/1/vehicle-allocations \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
{
  "allocations": [
    {
      "id": 1,
      "vehicle_id": 5,
      "product_id": 10,
      "allocated_qty": 100
    }
  ],
  "assignments": [
    {
      "id": 1,
      "vehicle_id": 5,
      "distributor_id": 10
    }
  ]
}
```

---

### POST /vehicle-allocations/:paperId/vehicle-allocations

Save allocations.

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

**Response** (200):
```json
{
  "allocations": [
    {"id": 1, "allocated_qty": 100}
  ],
  "assignments": [
    {"id": 1, "vehicle_id": 5}
  ]
}
```

---

## Purchases

### GET /purchases/:paperId

Get purchases.

```bash
curl -X GET http://localhost:3000/purchases/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200):
```json
[
  {
    "id": 1,
    "distributor_id": 10,
    "vehicle_id": 5,
    "product_id": 10,
    "purchased_qty": 100,
    "purchase_rate": 20.00,
    "purchase_amount": 2000.00
  }
]
```

---

### POST /purchases/:paperId

Save purchases.

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
      }
    ]
  }'
```

**Response** (200):
```json
[
  {
    "id": 1,
    "purchased_qty": 100,
    "purchase_rate": 20.00,
    "purchase_amount": 2000.00
  }
]
```

---

## HTTP Status Codes

| Code | Meaning | Typical Causes |
|------|---------|----------------|
| **200** | OK | Request successful |
| **201** | Created | Resource created |
| **400** | Bad Request | Invalid input, validation error |
| **401** | Unauthorized | Missing/invalid JWT token |
| **403** | Forbidden | Authenticated but insufficient role |
| **404** | Not Found | Resource not found |
| **409** | Conflict | State violation, invalid transition |
| **500** | Server Error | Unexpected server issue |

---

## Common Error Responses

### Invalid Credentials
```bash
curl -X POST http://localhost:3000/auth/login \
  -d '{"username":"user1","password":"wrong"}'
```

Response (401):
```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

---

### Missing JWT Token
```bash
curl -X GET http://localhost:3000/orders/sheet/1
```

Response (401):
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

### Insufficient Permissions
```bash
curl -X POST http://localhost:3000/papers/1/finalize \
  -H "Authorization: Bearer <EMPLOYEE_TOKEN>"
```

Response (403):
```json
{
  "statusCode": 403,
  "message": "Forbidden"
}
```

---

### Invalid State Transition
```bash
curl -X POST http://localhost:3000/papers/1/submit-morning \
  -H "Authorization: Bearer <TOKEN>"
# Paper is in DRAFT, not NIGHT_SUBMITTED
```

Response (400):
```json
{
  "statusCode": 400,
  "message": "Cannot transition from DRAFT to MORNING_SUBMITTED",
  "error": "Bad Request"
}
```

---

### Validation Error
```bash
curl -X POST http://localhost:3000/orders/sheet/1/night-save \
  -H "Authorization: Bearer <TOKEN>" \
  -d '[{"clientId": 10, "productId": 5}]'
# Missing orderedQty
```

Response (400):
```json
{
  "statusCode": 400,
  "message": [
    {
      "target": {"clientId": 10, "productId": 5},
      "property": "orderedQty",
      "constraints": {
        "isNumber": "orderedQty must be a number",
        "min": "orderedQty must not be less than 0"
      }
    }
  ],
  "error": "Bad Request"
}
```

---

## Authentication Pattern

All protected endpoints require JWT token:

```bash
curl -X GET http://localhost:3000/protected-endpoint \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

**Get token first**:
```bash
TOKEN=$(curl -X POST http://localhost:3000/auth/login \
  -d '{"username":"user1","password":"password123"}' \
  | jq -r '.accessToken')

# Use token
curl -X GET http://localhost:3000/orders/sheet/1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Rate Limiting

Currently **not implemented**. All authenticated requests are allowed.

---

## API Version

**Current**: v0.0.1 (development)

No version prefix in URLs. URLs are subject to change before v1.0 release.

---

## Pagination

Currently **not implemented**. All endpoints return complete result sets.

Future versions may include:
- `?page=1&limit=10` query parameters
- `X-Total-Count` response header

---

## Response Format

All responses are JSON:
- **Success**: `{ data: {...} }`or direct object/array
- **Error**: `{ statusCode: number, message: string, error: string }`

---

## Summary

### Endpoint Count by Module
- Auth: 2
- Paper: 6
- Orders: 4
- Collections: 4
- Trays: 2
- Vehicle Allocation: 3
- Purchases: 2

**Total: 23 endpoints**

All endpoints require authentication except `/auth/login`.

Majority require EMPLOYEE role; `/finalize` and `/reopen` require ADMIN role.

---

**Last Updated**: 2026-06-16
