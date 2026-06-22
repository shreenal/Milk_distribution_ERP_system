# Milk Distribution Server - Complete Documentation

## Quick Navigation
- **[0-README.md](0-README.md)** - Project overview, setup, quick start (you are here)
- **[1-ARCHITECTURE.md](1-ARCHITECTURE.md)** - System design patterns, workflow state machine, key decisions
- **[2-DATABASE.md](2-DATABASE.md)** - Database schema, entity relationships, 39 models overview
- **[3-MODULES_OVERVIEW.md](3-MODULES_OVERVIEW.md)** - All 12 feature modules summary
- **[4-AUTH_MODULE.md](4-AUTH_MODULE.md)** - Authentication, JWT, role-based access control
- **[5-ORDERS_PAPER_MODULES.md](5-ORDERS_PAPER_MODULES.md)** - Orders & Paper workflow modules
- **[6-COLLECTIONS_TRAYS_MODULES.md](6-COLLECTIONS_TRAYS_MODULES.md)** - Collections & Trays modules
- **[7-VEHICLE_PURCHASE_MODULES.md](7-VEHICLE_PURCHASE_MODULES.md)** - Vehicle allocation & Purchase modules
- **[8-API_ENDPOINTS.md](8-API_ENDPOINTS.md)** - Complete REST API reference with cURL examples
- **[9-WORKFLOWS.md](9-WORKFLOWS.md)** - End-to-end user workflows with Mermaid diagrams
- **[10-COMMON_UTILITIES.md](10-COMMON_UTILITIES.md)** - Guards, decorators, builders, middleware, utilities
- **[11-CASH_SETTLEMENT.md](11-CASH_SETTLEMENT.md)** - Cash settlement, denominations, expenses and bank deposits

---

## Project Overview

**Milk Distribution Server** is a NestJS-based REST API for managing daily milk distribution operations. It handles order entry, paper workflow management,
payment collection tracking, tray inventory management,
vehicle allocation, procurement operations,
cash settlement management, and delivery summary reporting.

### Key Characteristics
- **Framework**: NestJS 11 with TypeScript (ES2023)
- **Database**: PostgreSQL with Prisma ORM (39 data models)
- **Authentication**: JWT-based with role-based access control (EMPLOYEE, ADMIN)
- **API Type**: RESTful JSON API
- **Default Port**: 3000
- **Version**: 0.0.1

---

## Tech Stack

### Core Dependencies
| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/common` | ^11.0.1 | Common decorators and utilities |
| `@nestjs/platform-express` | ^11.0.1 | Express adapter for NestJS |
| `@nestjs/jwt` | ^11.0.2 | JWT token generation and validation |
| `@nestjs/passport` | ^11.0.5 | Authentication middleware |
| `@prisma/client` | ^7.8.0 | Database ORM client |
| `@prisma/adapter-pg` | ^7.8.0 | PostgreSQL adapter for Prisma |
| `pg` | ^8.21.0 | PostgreSQL driver |
| `passport-jwt` | ^4.0.1 | JWT strategy for Passport |
| `bcrypt` | ^6.0.0 | Password hashing |
| `class-validator` | ^0.15.1 | DTO validation |
| `class-transformer` | ^0.5.1 | DTO transformation |

### Development Dependencies
- TypeScript 5.7.3
- ESLint 9.18.0 with Prettier 3.4.2
- Vitest (testing framework)
- @nestjs/testing 11.0.0

---

## Project Structure

```
server/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Root controller
│   ├── app.service.ts          # Root service
│   ├── common/                 # Shared utilities
│   │   ├── builders/           # Data builders (ProductColumnsBuilder, etc.)
│   │   ├── decorators/         # Custom decorators (Roles)
│   │   ├── guards/             # Auth guards (JwtAuthGuard, RolesGuard)
│   │   ├── interceptors/       # HTTP interceptors
│   │   ├── filters/            # Exception filters
│   │   ├── middleware/         # Request middleware
│   │   ├── pipes/              # Validation pipes
│   │   └── utils/              # Utility functions
│   ├── config/                 # Configuration files (environment-based)
│   ├── generated/              # Auto-generated Prisma types
│   ├── lib/                    # Library files (Prisma module)
│   ├── modules/                # Feature modules
│   │   ├── auth/               # Authentication & RBAC
│   │   ├── orders/             # Order entry (night/morning)
│   │   ├── paper/              # Daily paper workflow
│   │   ├── collections/        # Payment collection tracking
│   │   ├── trays/              # Tray inventory management
│   │   ├── vehicle-allocation/ # Vehicle load planning
│   │   ├── purchase/           # Procurement management
│   │   ├── workflow/           # Workflow state machine
│   │   ├── clients/            # Client master data (stub)
│   │   ├── products/           # Product master data (stub)
│   │   ├── delivery-summary/
│   │   └── cash-settlement/
│   ├── prisma/                 # Database configuration
│   │   ├── schema.prisma       # Database schema (39 models)
│   │   └── migrations/         # Schema migration history
│   └── types/                  # TypeScript type definitions
├── test/                       # Test files
│   ├── app.e2e-spec.ts        # End-to-end tests
│   ├── helper/                # Test helpers
│   └── integration/           # Integration tests
├── package.json               # Dependencies and scripts
├── nest-cli.json              # NestJS CLI configuration
├── tsconfig.json              # TypeScript configuration
├── vitest.config.ts           # Vitest configuration
└── README.md                  # Original README (deprecated)
```

---

## Installation & Setup

### Prerequisites
- Node.js 18+ (compatible with NestJS 11)
- PostgreSQL 12+
- npm or yarn

### Step 1: Install Dependencies
```bash
cd server
npm install
```

### Step 2: Configure Environment Variables
Create a `.env` file in the `server/` directory:
```env
# Server Configuration
PORT=3000

# Database Configuration
DATABASE_URL="postgresql://user:password@localhost:5433/milk_distribution_db"

# JWT Configuration (optional - auto-generated if not set)
JWT_SECRET="your-secret-key-here"
JWT_EXPIRATION="1d"
```

### Step 3: Initialize Database
```bash
# Generate Prisma client from schema
npx prisma generate

# Run migrations to create tables
npx prisma migrate deploy

# (Optional) Seed database with initial data
npx prisma db seed
```

### Step 4: Run Development Server
```bash
npm run start:dev
```

Server will start on `http://localhost:3000`

---

## Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run start` | Start production server |
| `npm run start:dev` | Start development server with file watch |
| `npm run start:debug` | Start with Node debugger attached |
| `npm run start:prod` | Run compiled production code |
| `npm run build` | Compile TypeScript to dist/ |
| `npm run lint` | Check code style with ESLint |
| `npm run format` | Format code with Prettier |
| `npm test` | Run all tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:cov` | Generate test coverage report |
| `npm run test:ui` | View tests in browser UI |

---

## Key Concepts

### 1. Daily Paper Workflow
All operations in the system are tied to a daily **order paper**:

- **DRAFT**
  - Night Entries enabled
  - Night Collections (`office_amount_given`) enabled
  - Vehicle Allocations enabled

- **NIGHT_SUBMITTED**
  - Night entries locked
  - Morning Entries enabled
  - Morning Collections enabled
  - Purchases enabled
  - Trays enabled
  - Cash Settlement enabled
    - Route Expenses
    - Route Denominations
    - Direct Collections
    - Bank Deposits
  - Vehicle Allocations permanently locked (cannot be modified even in REOPENED)
  - Purchases use paper workflow state, but purchase accounting date is stored per `purchase_entry.gatepass_date`

- **MORNING_SUBMITTED**
  - Morning Entries locked
  - Morning Collections locked
  - Purchases locked
  - Trays locked
  - Night Collections locked
  - Admin Collections enabled

- **FINALIZED**
  - Business day closed and locked

- **REOPENED** (from FINALIZED)
  Allows:
  - Morning Entries
  - Purchases
  - Trays
  - Night Collections
  - Morning Collections
  - Admin Collections
  - Route Expenses only
  - Finalization

  Does NOT allow:
  - Night Entries
  - Vehicle Allocations
  - Route Denominations
  - Direct Collections
  - Bank Deposits


### Paper Date Model

Each order paper stores both:
- `order_date`
- `sale_date`

`sale_date` is the business day for delivery, billing, collections, trays, and
most day-level operational logic.

`order_date` represents the night ordering date that leads into that sale day.
In the normal workflow, `order_date` is the previous calendar day of the
paper's `sale_date`.

When a paper is generated for a requested sale date:
- `sale_date = requested date`
- `order_date = sale_date - 1 day`

### 2. Authentication & Authorization
- Uses JWT tokens for stateless authentication
- Passwords hashed with bcrypt
- Two roles: `EMPLOYEE` and `ADMIN`
- Role-based decorators for endpoint protection

### 3. Data Models
The system manages **39 database models** across:
- **Master Data**: Dairy, Brand, Distributor, Client, Product,Vehicle, Driver, Group, Employee, Bank, Expense Type
- **Transaction Data**: Order entries, Collections, Tray transactions, Purchases
- **Configuration Data**: Rates, Rules, Allocations, Summaries
- **Auth Data**: Users, Roles

### 4. State Machine
Workflow transitions are strictly validated through `WorkflowStateService`:
- Prevents invalid state transitions
- Controls what operations are allowed in each state
- Ensures data consistency and business rule compliance

### 5. Purchase Gatepass Date Resolution

Purchase dates are resolved per purchase row, not per paper.

Each brand defines a `gatepass_date_policy` in `master_brand`.
When a purchase row is saved, the system calculates `purchase_entry.gatepass_date`
from:

- the paper `sale_date`
- the purchased product's brand policy

Rules:
- `SAME_DAY` → `gatepass_date = sale_date`
- `PREVIOUS_DAY` → `gatepass_date = sale_date - 1 day`

This allows different brands in the same paper to follow different dairy gatepass
date rules.

`order_paper.sale_date` is the business date for the paper workflow, but purchase
accounting and outstanding logic should use the persisted
`purchase_entry.gatepass_date`.
---

## File Organization by Module

Each feature module follows this structure:
```
module-name/
├── {module}.controller.ts      # HTTP endpoints
├── {module}.service.ts         # Business logic
├── {module}.repository.ts      # Data access
├── {module}.module.ts          # Module configuration
├── dto/
│   └── *.dto.ts               # Data Transfer Objects
├── {module}.constants.ts       # Constants and config
└── {module}-validation.service.ts  # Custom validation logic
Optional:
├── transformer/
├── {module}.builder.ts         # AG grid generation + response structure
```

---

## API Authentication

All endpoints (except login) require JWT token in Authorization header:

```bash
curl -H "Authorization: Bearer <JWT_TOKEN>" http://localhost:3000/api/endpoint
```

**Get JWT Token:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"password123"}'
```

See [8-API_ENDPOINTS.md](8-API_ENDPOINTS.md) for complete API reference with examples.

---

## Database Overview

PostgreSQL database with **39 models** managed by Prisma ORM:

- **10+ migrations** tracking schema evolution
- **Decimal precision** for currency (12,2) and quantities (10,2)
- **Relationships**: Foreign keys, unique constraints, indexes for performance
- **Enums**: `OrderPaperStatus`, `GatepassDatePolicy`, `PaymentMode`
- `GatepassDatePolicy` controls how each brand's purchase gatepass date is resolved
- Purchase rows persist the resolved date in `purchase_entry.gatepass_date`
- `order_paper.sale_date` is the business date of the paper workflow
- purchase rows do not directly use `sale_date` as their persisted accounting date
- instead, each purchase row stores a resolved `purchase_entry.gatepass_date`
  derived from the paper `sale_date` and the brand's `GatepassDatePolicy`

See [2-DATABASE.md](2-DATABASE.md) for complete schema documentation.


---

## Workflow Overview

### Order Entry & Paper Submission
1. **DRAFT**
   - Employee enters night orders and vehicle allocations

2. **NIGHT_SUBMITTED**
   - Night entries locked
   - Morning entries enabled
   - Morning collections enabled
   - Purchases enabled
   - Trays enabled
   - Cash settlement enabled
   - Purchase rows are created during the paper workflow, but each saved purchase row stores its own resolved `gatepass_date` based on brand policy

3. **MORNING_SUBMITTED**
   - Morning entries locked
   - Morning collections locked
   - Night collections locked
   - Admin collections enabled
   - Purchases locked
   - Trays locked
   - Cash settlement locked

4. **FINALIZED**
   - Paper finalized and locked

5. **REOPENED** (optional)
   Enabled:
   - Morning Entries
   - Purchases
   - Trays
   - Night Collections
   - Morning Collections
   - Admin Collections
   - Route Expenses
   - Finalization

   Not enabled:
   - Night Entries
   - Vehicle Allocations
   - Route Denominations
   - Direct Collections
   - Bank Deposits

### Order Selling Rate Resolution

Night and morning order billing rates are resolved using the paper `sale_date`,
not `order_date`.

Reason:
- order rows belong to the business sale day
- `order_date` represents the previous night’s ordering session
- rate lookup should follow the sale/billing day, not the entry-night date

### Collections Tracking
- **Night Collections**: Employee records cash received by the office during night collections
- **Morning Collections**: Employee records `cash_collection`, `cheque_collection`, and `employee_remarks`
- **Admin Collections**: Admin records `online_collection`, `bank_deposit`, and `admin_remarks`

### Tray Management
- **Tray Exchange**: Track opening balance, trays taken, trays returned, closing balance
- **Tray Types**: Different container types (cans, bottles, etc.)
- **Billing Integration**: Calculated in tray summary rows

### Delivery Summary

- Uses billing_group_id
- Uses delivered_qty
- Generates billing-group summaries
- Used for billing reconciliation
- Used for purchase vs delivered comparison
- Read-only reporting module

See [9-WORKFLOWS.md](9-WORKFLOWS.md) for detailed end-to-end workflows with diagrams.

### Cash Settlement

- Tracks physical cash received from routes
- Records route-level expenses
- Tracks route denomination counts
- Records direct collections by office staff
- Records office bank deposits


- Route Net Cash = Route Total Cash - Route Expenses
- Available Office Cash = Sum of all night collections office_amount_given
- Validation enforced at: MORNING_SUBMITTED transition

Normal first-time cash close:
- Route Net Cash must equal route denomination total for each route
- Total bank deposits cannot exceed available office cash
- Cash Settlement validation is enforced during the normal first-time morning submit / close flow

Editability:
- In NIGHT_SUBMITTED:
  - Route Expenses editable
  - Route Denominations editable
  - Direct Collections editable
  - Bank Deposits editable

REOPENED does NOT allow NEW/EDIT actions on:
- Route Denominations (frozen, read-only)
- Direct Collections (frozen, read-only)
- Bank Deposits (frozen, read-only)
But historical records remain VISIBLE (read-only)

If collections or route expenses are corrected after reopen, route cash and route
net cash may change. Historical route denominations, direct collections, and bank
deposit records remain frozen and are shown read-only, so reopened cash figures
may no longer reconcile exactly to the original denomination/deposit records.

---

## Development Workflow

1. **Start Dev Server**: `npm run start:dev`
2. **Make Changes**: Edit files in `src/`
3. **Test**: `npm test` or `npm run test:watch`
4. **Check Errors**: `npm run lint`
5. **Format Code**: `npm run format`
6. **Database Changes**: Update `schema.prisma` then run `npx prisma migrate dev`

---

## Common Tasks

### Add New Endpoint
1. Create route in `{module}.controller.ts`
2. Add handler method in `{module}.service.ts`
3. Create DTO in `dto/` folder if needed
4. Add guards/decorators for auth and roles
5. Test with cURL or API client

### Add Database Model
1. Update `schema.prisma`
2. Run: `npx prisma migrate dev --name descriptive_name`
3. Update repository methods to handle new model
4. Create DTOs for input/output

### Add Custom Validation
1. Create validation method in service
2. Use `class-validator` decorators in DTO
3. NestJS automatically validates before route handler runs

---

## Debugging

### Enable Debug Mode
```bash
npm run start:debug
# Opens Node debugger on port 9229
```

### View Generated Types
```bash
# Prisma types auto-generated in src/generated/prisma/
cat src/generated/prisma/client.d.ts
```

### Database Inspection
```bash
# Open Prisma Studio GUI
npx prisma studio
```

---

## Next Steps

For detailed information, visit the specific documentation:
- **Architecture & Design**: [1-ARCHITECTURE.md](1-ARCHITECTURE.md)
- **Database Schema**: [2-DATABASE.md](2-DATABASE.md)
- **Module Documentation**: [3-MODULES_OVERVIEW.md](3-MODULES_OVERVIEW.md) → [4-11]
- **API Reference**: [8-API_ENDPOINTS.md](8-API_ENDPOINTS.md)
- **User Workflows**: [9-WORKFLOWS.md](9-WORKFLOWS.md)


---

## Support & Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
kill -9 $(lsof -ti:3000)  # macOS/Linux
netstat -ano | findstr :3000  # Windows
```

### Database Connection Issues
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Test connection: `psql postgresql://user:password@localhost:5433/milk_distribution_db`

### Migration Errors
```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Check migration status
npx prisma migrate status
```

### Test Failures
1. Clear node_modules cache: `npm install`
2. Reset test database: `npx prisma migrate reset`
3. Run tests in watch mode: `npm run test:watch`

---

**Last Updated**: 2026-06-21 
**Version**: 0.0.1
