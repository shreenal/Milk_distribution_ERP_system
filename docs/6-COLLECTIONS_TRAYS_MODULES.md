# Collections & Trays Modules

## Collections Module

### Overview

Tracks payment collections from clients in multiple forms: cash, cheques, online transfers, and bank deposits.

**Location**: `src/modules/collections/`

---

### Files

```
collections/
├── collections.controller.ts
├── collections.service.ts
├── collections.repository.ts
├── collections.module.ts
├── collections.builder.ts
├── collections-validation.service.ts
├── dto/
│   ├── save-night-collection.dto.ts
│   ├── save-morning-collection.dto.ts
│   ├── save-admin-collection.dto.ts
└── collections.constants.ts
```

---

### Controller

**Location**: `src/modules/collections/collections.controller.ts`

```typescript
@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  
  @Get('/sheet/:sheetId')
  @Roles('EMPLOYEE')
  getCollectionGrid(@Param('sheetId', ParseIntPipe) sheetId: number) { }

  @Post('/sheet/:sheetId/night-save')
  @Roles('EMPLOYEE')
  saveNightCollections(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: SaveNightCollectionsDto,
  ) { }

  @Post('/sheet/:sheetId/morning-save')
  @Roles('EMPLOYEE')
  saveMorningCollections(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: SaveMorningCollectionsDto,
  ) { }

  @Post('/sheet/:sheetId/admin-save')
  @Roles('ADMIN')
  saveAdminCollections(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: SaveAdminCollectionsDto,
  ) { }
}
```

---

### Endpoints

#### 1. GET /collections/sheet/:sheetId

**Purpose**: Get all collections for order sheet with client details

**Auth**: EMPLOYEE

**Request**:
```bash
curl -X GET http://localhost:3000/collections/sheet/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200 OK):
```json

 {
  "orderSheetId": 1,
  "groupId": 1,
  "groupName": "Route A",
  "paperStatus": "NIGHT_SUBMITTED",

  "permissions": {
    "canEditNightCollections": true,
    "canEditMorningCollections": true,
    "canEditAdminCollections": false,
    "canFinalize": false
  },

  "columns": [],

  "rows": [
    {
      "clientId": 10,
      "clientCode": "C001",
      "clientName": "ABC Dairy",

      "officeAmountGiven": 500,
      "cashCollection": 200,
      "chequeCollection": 100,

      "employeeTotal": 800,

      "onlineCollection": 0,
      "bankDeposit": 0,

      "adminTotal": 0,

      "grandTotal": 800
    }
  ],

  "totals": {}
}

```

---

#### 2. POST /collections/sheet/:sheetId/night-save

**Purpose**: Save night collections - office amount given to client

**Auth**: EMPLOYEE

**Request**:
```bash
curl -X POST http://localhost:3000/collections/sheet/1/night-save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "clientId": 10,
        "officeAmountGiven": 500.00
      },
      {
        "clientId": 11,
        "officeAmountGiven": 1000.00
      }
    ]
  }'
```

**Request Body (SaveNightCollectionsDto)**:
```typescript
{
  entries: {
    clientId: number;           // @IsInt(), @Min(1), ✓ required
    officeAmountGiven: number;  // @IsNumber(), @Min(0)
  }[]
}
```

**Response** (200 OK):
```json
{
  "message": "Night collections saved successfully"
}
```

**Edit Rule**:DRAFT, NIGHT_SUBMITTED or REOPENED state

---

#### 3. POST /collections/sheet/:sheetId/morning-save

**Purpose**: Save employee collections - cash collections, cheque collections and employee remarks

**Auth**: EMPLOYEE

**Request**:
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
        "employeeRemarks": "Client paid via cheque"
      }
    ]
  }'
```

**Request Body (SaveMorningCollectionsDto)**:
```typescript
{
  entries: {
    clientId: number;           // @IsInt(), @Min(1), ✓ required
    cashCollection: number;     // @IsNumber(), @Min(0), ✓ required
    chequeCollection: number;   // @IsNumber(), @Min(0), ✓ required
    employeeRemarks?: string;   // @IsOptional(), @IsString()
  }[]
}
```

**Response** (200 OK):
```json
{
  "message": "Morning collections saved successfully"
}
```

**Edit Rule**:  NIGHT_SUBMITTED or REOPENED state

---

#### 4. POST /collections/sheet/:sheetId/admin-save

**Purpose**: Admin verification and remarks (final collections)

**Auth**: ADMIN only

**Request**:
```bash
curl -X POST http://localhost:3000/collections/sheet/1/admin-save \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
  "clientId": 10,
  "onlineCollection": 90,
  "bankDeposit": 1000,
  "adminRemarks": "Verified and approved"
}
    ]
  }'
```

**Request Body (SaveAdminCollectionsDto)**:
```typescript
{
  entries: {
    clientId: number;           // @IsInt(), @Min(1), ✓ required
    onlineCollection: number;   // @IsNumber(), @Min(0), ✓ required
    bankDeposit: number;        // @IsNumber(), @Min(0), ✓ required
    adminRemarks?: string;      // @IsOptional(), @IsString()
  }[]
}
```

**Response** (200 OK):
```json
{
  "message": "Admin collections saved successfully"
}
```

**Edit Rule**: MORNING_SUBMITTED or REOPENED state only

---

### DTOs

#### SaveNightCollectionsDto

```typescript
class NightCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  officeAmountGiven!: number;
}

export class SaveNightCollectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NightCollectionEntryDto)
  entries!: NightCollectionEntryDto[];
}
```

---

#### SaveMorningCollectionsDto

```typescript
class MorningCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  cashCollection!: number;

  @IsNumber()
  @Min(0)
  chequeCollection!: number;

  @IsOptional()
  @IsString()
  employeeRemarks?: string;
}

export class SaveMorningCollectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MorningCollectionEntryDto)
  entries!: MorningCollectionEntryDto[];
}
```

---

#### SaveAdminCollectionsDto

```typescript
class AdminCollectionEntryDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  onlineCollection!: number;

  @IsNumber()
  @Min(0)
  bankDeposit!: number;

  @IsOptional()
  @IsString()
  adminRemarks?: string;
}

export class SaveAdminCollectionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminCollectionEntryDto)
  entries!: AdminCollectionEntryDto[];
}
```
---

### Service: CollectionsService

**Public Methods**:

#### `getCollectionGrid(sheetId: number)`

Logic:
1. Load order sheet.
2. Validate sheet exists.
3. Load clients belonging to the sheet group.
4. Load saved collection entries.
5. Build collection grid using CollectionBuilder.
6. Return collection grid.

---

#### `saveNightCollections(sheetId: number, dto: SaveNightCollectionsDto)`

1. Validate order sheet exists
2.Validate workflow state using WorkflowStateService
3. Call repository.replaceNightCollections(...)
4. Return success message
---

#### `saveMorningCollections(sheetId: number, dto: SaveMorningCollectionsDto)`

1. Validate order sheet exists
2.Validate workflow state using WorkflowStateService
3. Call repository.replaceMorningCollections(...)
4. Return success message
---

#### `saveAdminCollections(sheetId: number, dto: SaveAdminCollectionsDto)`

1. Validate order sheet exists
2. Validate workflow state using WorkflowStateService
3. Call repository.replaceAdminCollections(...)
4. Return success message
---

### Builder: CollectionBuilder

Location: src/modules/collections/collections.builder.ts

Purpose:
- Builds collection grid response for UI.
- Creates Night Entry, Morning Entry and Admin Entry column groups.
- Generates workflow permissions using WorkflowStateService.
- Calculates row-level totals.
- Calculates collection summary totals.


### Collection Calculations

Employee Total =
  officeAmountGiven +
  cashCollection +
  chequeCollection

Admin Total =
  onlineCollection +
  bankDeposit

Grand Total =
  Employee Total +
  Admin Total

Public Methods:

buildCollectionGrid(
  sheet,
  clients,
  savedCollections
)

Output:

{
  orderSheetId,
  groupId,
  groupName,
  paperStatus,
  permissions: {
  canEditNightCollections,
  canEditMorningCollections,
  canEditAdminCollections,
  canFinalize
}
  columns,
  rows,
  totals: {
  totalClients,
  cashCollection,
  officeAmountGiven,
  chequeCollection,
  onlineCollection,
  bankDeposit,
  employeeTotal,
  adminTotal,
  grandTotal
}
}


### CollectionsValidationService

**Location**: `src/modules/collections/collections-validation.service.ts`

Used by Paper workflow validation before state transitions.

---

#### `validateNightCollections(sheetId: number)`

Validates night collection entries.

**Checks:**
1. Office amount given is not negative.

**Throws:**
- `BadRequestException` if office amount is negative.

---

#### `validateMorningCollections(sheetId: number)`

Validates morning collection entries.

**Checks:**
1. Cash collection is not negative.
2. Cheque collection is not negative.

**Throws:**
- `BadRequestException` if cash collection is negative.
- `BadRequestException` if cheque collection is negative.

---

#### `validateAdminCollections(sheetId: number)`

Validates admin collection entries.

**Checks:**
1. Online collection is not negative.
2. Bank deposit is not negative.

**Throws:**
- `BadRequestException` if online collection is negative.
- `BadRequestException` if bank deposit is negative.

### Data Model

**client_collection**:
```typescript
{
  id: Int;
  order_sheet_id: Int;
  client_id: Int;
  office_amount_given: Decimal(12,2);    // Night: office amount
  cash_collection: Decimal(12,2);        // Morning: cash received
  cheque_collection: Decimal(12,2);      // Morning: cheque received
  online_collection: Decimal(12,2);      // Admin stage: online payment
  bank_deposit: Decimal(12,2);           // Admin stage: bank deposit
  employee_remarks: String?;              // Employee notes
  admin_remarks: String?;                 // Admin notes
  created_at: DateTime;
  updated_at: DateTime;
}
```

---

---

## Trays Module

### Overview

Manages tray (container) inventory exchange tracking. Tracks trays taken by clients and trays returned.

**Location**: `src/modules/trays/`

---

### Files

```
trays/
├── trays.controller.ts
├── trays.service.ts
├── trays.repository.ts
├── trays.module.ts
├── tray.billing-builder.ts
├── trays-validation.service.ts
└── dto/
    └── save-trays-entries.dto.ts
```

---

### Controller

**Location**: `src/modules/trays/trays.controller.ts`

```typescript
@Controller('trays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TraysController {
  
  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getTraySheet(@Param('sheetId') sheetId: string) { }

  @Post('sheet/:sheetId/save')
  @Roles('EMPLOYEE')
  async saveTrayEntries(
    @Param('sheetId') sheetId: string,
    @Body() entries: SaveTrayReturnDto[],
  ) { }
}
```

---

### Endpoints

#### 1. GET /trays/sheet/:sheetId

**Purpose**: Get tray exchange grid with opening/closing balances

**Auth**: EMPLOYEE

**Request**:
```bash
curl -X GET http://localhost:3000/trays/sheet/1 \
  -H "Authorization: Bearer <TOKEN>"
```

**Response** (200 OK):
```json

{
  "sheet": {},
  "trayBilling": {
    "columns": [],
    "rows": [],
    "totals": {}
  }
}

```

**Calculation**:
```
closing_balance = opening_balance + trays_taken - trays_returned
```

---

#### 2. POST /trays/sheet/:sheetId/save

**Purpose**: Save tray returns (only field operator enters)

**Auth**: EMPLOYEE

**Request**:
```bash
curl -X POST http://localhost:3000/trays/sheet/1/save \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "clientId": 10,
      "trayTypeId": 1,
      "returned": 30
    },
    {
      "clientId": 11,
      "trayTypeId": 1,
      "returned": 25
    }
  ]'
```

**Request Body (SaveTrayReturnDto[])**:
```typescript
{
  clientId: number;     // @IsInt(), @Min(1), ✓ required
  trayTypeId: number;   // @IsInt(), @Min(1), ✓ required
  returned: number;     // @IsInt(), @Min(0), ✓ ONLY operator-entered field
}[]
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Tray returns saved successfully"
}
```

**Edit Rule**: NIGHT_SUBMITTED or REOPENED state only

---

### DTO

#### SaveTrayReturnDto

```typescript
export class SaveTrayReturnDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsInt()
  @Min(1)
  trayTypeId!: number;

  @IsInt()
  @Min(0)
  returned!: number;  // ✓ ONLY operator-entered field
}
```

---

### Service: TraysService

**Public Methods**:

#### `getTraySheetService(sheetId: number)`
1. Load order sheet
2. Load clients in group
3. Load sheet items
4. Load tray rules
5. Load tray types
6. Load existing tray transactions
7. Load previous sheet balances
8. Build openingBalanceMap
9. Build tray billing grid using TrayBillingBuilder
10. Return { sheet, trayBilling }

**How expected_trays_taken is calculated**:
1. Find all matching tray rules
2. Sort by specificity
3. Select most specific rule
4. Calculate expected trays from ordered_qty
5. Calculate actual trays taken from delivered_qty

Tray requirements are determined through tray rules and product attributes.
The calculation is performed by TrayBillingBuilder.

---

#### `saveTrayEntriesService(sheetId: number, entries: SaveTrayReturnDto[])`

1. Validate sheet exists.
2. Validate tray editing is allowed.
3. Load tray billing data.
4. Validate returned trays are non-negative.
5. Validate tray row exists for client.
6. Calculate closing balance.
7. Build transaction entries.
8. Replace tray transactions.
9. Return success response.
---

### Data Model

**client_tray_transaction**:
```typescript
{
  id: Int;
  order_sheet_id: Int;
  client_id: Int;
  tray_type_id: Int;
  opening_balance: Int;                // Trays at start of day
  expected_trays_taken: Int?; // Calculated from tray rules and sheet items
  trays_taken: Int;                    // Trays given to client
  trays_returned: Int;                 // Trays received back
  closing_balance: Int;                 // opening_balance + trays_taken - trays_returned
  remarks: String?;
  created_at: DateTime;
  updated_at: DateTime;
}
```

### TraysValidationService

**Location**: `src/modules/trays/trays-validation.service.ts`

Used by Paper workflow validation before state transitions.

---

#### `validateTrayCalculationExists(sheetId: number)`

Validates that tray calculations were successfully generated.

**Checks:**
1. Tray billing exists.
2. Tray billing contains rows.

**Throws:**
- `BadRequestException` if tray calculations cannot be generated.

---

#### `validateTrayCompleteness(sheetId: number)`

Validates tray return completeness before morning submission.

**Checks:**
1. Load tray billing grid.
2. For each tray type:
   - If opening balance > 0 OR trays taken > 0,
     a returned tray value must exist.

**Throws:**
- `BadRequestException` if required tray return values are missing.
- `BadRequestException` if tray validation fails.

---

### Builder: TrayBillingBuilder

Location: src/modules/trays/tray.billing-builder.ts

Purpose:
- Builds tray tracking grid for UI.
- Calculates expected trays from tray rules.
- Applies most-specific-rule matching.
- Calculates trays taken from delivered quantities.
- Applies opening balances from previous sheet.
- Calculates closing balances.
- Generates tray summary totals.
- Creates dynamic tray columns grouped by brand and tray type.


### Tray Calculations

Expected Trays Taken =
  ordered_qty

Actual Trays Taken =
  round(delivered_qty)

Closing Balance =
  opening_balance +
  trays_taken -
  trays_returned


--- 

### Public Methods:

buildTrayBilling({
  clients,
  trayTypes,
  sheetItems,
  trayRules,
  trayTransactions,
  openingBalanceMap
})


Output:

{
  columns,

  rows: [
    {
      clientId,
      clientName,

      tray_{id}_opening,
      tray_{id}_expected,
      tray_{id}_taken,
      tray_{id}_returned,
      tray_{id}_closing
    }
  ],

  totals = {
  totalClients,

  tray_1: {
    opening,
    taken,
    returned,
    closing,
  },

  tray_2: {
    opening,
    taken,
    returned,
    closing,
  },

  ...
}
}
---

  
## Collections & Trays Workflow Summary

### Edit Rules by State

```
DRAFT:
  ✅ Collections: office_amount_given(editable)
  ❌ Trays: locked

NIGHT_SUBMITTED:
  ✅ Collections: 
- office_amount_given (editable)
- cash_collection (editable)
- cheque_collection (editable)
- employee_remarks (editable)
  ✅ Trays: trays_returned (editable)
  

MORNING_SUBMITTED:
  ✅ Collections: 
  - online_collection
  - bank_deposit
  - admin_remarks
  ❌ Trays: locked


REOPENED:
✅ Collections:
- office_amount_given
- cash_collection
- cheque_collection
- employee_remarks
- online_collection
- bank_deposit
- admin_remarks

✅ Trays:
- trays_returned

✅ Purchases

❌ vehicle_allocations
```

---

## Summary

### Collections Module
- **Purpose**: Payment collection tracking (cash, cheque, online, bank)
- **Editable Fields**:
  - DRAFT: office_amount_given
  - NIGHT_SUBMITTED:
office_amount_given
cash_collection
cheque_collection
employee_remarks
  - MORNING_SUBMITTED:
online_collection
bank_deposit
admin_remarks
REOPENED:
office_amount_given
cash_collection
cheque_collection
employee_remarks
online_collection
bank_deposit
admin_remarks
- **DTOs**: SaveNightCollectionsDto, SaveMorningCollectionsDto, SaveAdminCollectionsDto

### Trays Module
- **Purpose**: Tray/container inventory tracking
- **Operator Input**: trays_returned (only field entered manually)
- **Calculated Fields**: opening_balance, expected_trays_taken, closing_balance
- **DTO**: SaveTrayReturnDto
- **Editable States**: NIGHT_SUBMITTED, REOPENED

---

**Last Updated**: 2026-06-16
