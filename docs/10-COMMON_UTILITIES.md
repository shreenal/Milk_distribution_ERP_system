# Common Utilities, Guards & Decorators

## Overview

Shared infrastructure components used across all modules.

**Location**: `src/common/`

---

## Guards

Guards are middleware that control access to endpoints based on authentication and authorization.

### JwtAuthGuard

**Location**: `src/common/guards/jwt-auth.guard.ts`

Validates JWT tokens and extracts user information.

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    // 1. Extract JWT from Authorization header
    // 2. Verify token signature and expiration
    // 3. Extract user ID from token payload
    // 4. Attach user to request object
    // 5. Allow or deny based on validity
  }
}
```

**Usage**:
```typescript
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  @Get('sheet/:id')
  async getSheet(@Param('id') id: number) { }
  // ✅ Requires valid JWT token
}
```

**Error Response** (401):
```json
{"statusCode": 401, "message": "Unauthorized"}
```

---

### RolesGuard

**Location**: `src/common/guards/roles.guard.ts`

Validates user role against @Roles decorator.

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Extract @Roles metadata from handler
    // 2. Get user from request (set by JwtAuthGuard)
    // 3. Check if user role matches required roles
    // 4. Allow or deny based on role
  }
}
```

**Usage**:
```typescript
@Post('finalize')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
async finalizePaper(@Param('id') id: number) { }
// ✅ Requires JWT AND ADMIN role
```

**Error Response** (403):
```json
{"statusCode": 403, "message": "Forbidden"}
```

---

## Decorators

Decorators add metadata or functionality to classes and methods.

### @Roles

**Location**: `src/common/decorators/roles.decorator.ts`

Specifies required role(s) for endpoint access.

```typescript
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
```

**Single Role**:
```typescript
@Post('papers/:id/finalize')
@Roles('ADMIN')
async finalizePaper() { }
```

**Multiple Roles** (any match = allowed):
```typescript
@Post('papers/:id/finalize')
@Roles('ADMIN', 'MANAGER')
async finalizePaper() { }
```

---

### @Param, @Body, @Query

NestJS built-in decorators for parameter extraction.

**@Param**: Extract URL path parameters
```typescript
@Get(':paperId')
async getPaper(@Param('paperId', ParseIntPipe) paperId: number) { }
// Extracts paperId from /papers/123
```

**@Body**: Extract request body with validation
```typescript
@Post(':id')
async save(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: SaveOrdersDto,
) { }
// DTO auto-validated by ValidationPipe
```

**@Query**: Extract query parameters
```typescript
@Get()
async list(@Query('status') status?: string) { }
// ?status=DRAFT
```

---

## Pipes

Pipes transform and validate data.

### ValidationPipe

**Location**: Global configuration in `main.ts`

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,      // Remove extra properties
    transform: true,      // Auto-cast types
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);
```

**Behavior**:
- Validates incoming DTOs against class-validator rules
- Transforms string input to correct types
- Removes unknown properties
- Returns 400 with validation errors if invalid

**Example**:
```typescript
export class SaveOrdersDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  @Max(10000)
  orderedQty!: number;
}

// Input: {"clientId": "10", "orderedQty": "100.5", "extra": "removed"}
// After ValidationPipe: {clientId: 10, orderedQty: 100.5}
// "extra" removed, strings converted to numbers
```

---

### ParseIntPipe

Built-in pipe for URL parameters.

```typescript
@Get(':paperId')
async getPaper(@Param('paperId', ParseIntPipe) paperId: number) { }
// ?paperId=abc → 400 Bad Request
// ?paperId=123 → paperId = 123 (number)
```

---

## Interceptors

Interceptors process requests and responses.

### Response Formatting

Location: `src/common/interceptors/` (if exists)

Typically applied globally to standardize response format:

```typescript
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    return next.handle().pipe(
      map((data) => ({
        statusCode: context.switchToHttp().getResponse().statusCode,
        message: 'Success',
        data,
      })),
    );
  }
}
```

---

## Filters

Exception filters handle errors.

### HTTP Exception Filter

Location: `src/common/filters/` (if exists)

Catches exceptions and formats error responses:

```typescript
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    response.status(status).json({
      statusCode: status,
      message: exceptionResponse['message'],
      error: exceptionResponse['error'],
    });
  }
}
```

---

## Builders

Builders generate calculated data.

### ProductColumnsBuilder

**Location**: `src/common/builders/product-columns.builder.ts`

Generates dynamic order columns for frontend display.

```typescript
@Injectable()
export class ProductColumnsBuilder {
  async buildProductColumns(): Promise<ProductColumn[]> {
    // 1. Query all active products
    // 2. Build column definition for each
    // 3. Return array of column configurations
    
    // Used by frontend to render dynamic order grid
    // Columns = [Product1Col, Product2Col, ...]
  }
}
```

**Output Example**:
```json
[
  {
    "productId": 5,
    "productCode": "AMUL-1L",
    "productName": "Amul Gold 1L",
    "priority": 1
  },
  {
    "productId": 6,
    "productCode": "AMUL-500ML",
    "productName": "Amul Taaza 500ml",
    "priority": 2
  }
]
```

---

### OrdersBillingBuilder

**Location**: `src/common/builders/orders-billing.builder.ts`

Calculates order-related billing amounts.

```typescript
@Injectable()
export class OrdersBillingBuilder {
  async calculateBilling(sheetId: number): Promise<OrdersBilling> {
    // 1. Fetch all order items for sheet
    // 2. Look up client rates from master_client_rate_product
    // 3. Calculate: amount = ordered_qty × selling_rate
    // 4. Sum by product and client
    // 5. Return billing summary
    
    return {
      items: [
        {
          clientId: 10,
          productId: 5,
          orderedQty: 100,
          sellingRate: 25.00,
          amount: 2500.00,
        },
        ...
      ],
      totalAmount: 10500.00,
    };
  }
}
```

---

### TrayBillingBuilder

**Location**: `src/common/builders/tray-billing.builder.ts`

Calculates tray-related charges.

```typescript
@Injectable()
export class TrayBillingBuilder {
  async calculateTrayBilling(sheetId: number): Promise<TrayBilling> {
    // 1. Fetch all tray transactions
    // 2. Calculate shortage = expected - returned
    // 3. Look up penalty rates
    // 4. Calculate: penalty = shortage × penalty_rate
    // 5. Return tray charges
  }
}
```

---

## Utilities

Shared utility functions.

### Location: `src/common/utils/`

#### DateUtility

Date formatting and calculations:

```typescript
export class DateUtility {
  static formatDate(date: Date): string {
    // Returns: "2026-06-16" format
  }

  static parseDate(dateStr: string): Date {
    // Converts "2026-06-16" to Date object
  }

  static isSameDay(d1: Date, d2: Date): boolean {
    // Checks if two dates are same day
  }
}
```

#### NumberUtility

Number formatting and calculations:

```typescript
export class NumberUtility {
  static roundTo2Decimals(num: number): number {
    return Math.round(num * 100) / 100;
  }

  static formatCurrency(num: number): string {
    return num.toFixed(2);
  }
}
```

---

## Middleware

Middleware processes requests before they reach controllers.

### Location: `src/common/middleware/`

#### Request Logging Middleware

```typescript
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  }
}
```

**Registration**:
```typescript
@Module({})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*');  // Apply to all routes
  }
}
```

---

## Common Patterns

### DTO Validation Pattern

```typescript
export class SaveOrdersDto {
  @IsInt()
  @Min(1)
  clientId!: number;

  @IsNumber()
  @Min(0)
  @Max(10000)
  @Transform(({ value }) => parseFloat(value))
  orderedQty!: number;

  @IsString()
  @IsOptional()
  remarks?: string;
}
```

**Validators Used**:
- `@IsInt()` - Must be integer
- `@IsNumber()` - Must be number
- `@IsString()` - Must be string
- `@Min(n)` - Must be ≥ n
- `@Max(n)` - Must be ≤ n
- `@IsOptional()` - Field optional
- `@Transform()` - Custom transformation

---

### Service Dependency Injection

```typescript
@Injectable()
export class OrdersService {
  constructor(
    private readonly ordersRepository: OrdersRepository,
    private readonly workflowService: WorkflowService,
    private readonly prisma: PrismaService,
  ) {}

  async saveNightEntries(sheetId: number, entries: SaveOrdersDto[]) {
    // Use injected dependencies
    this.workflowService.validateState(sheetId);
    return this.ordersRepository.saveNightEntries(entries);
  }
}
```

---

### Controller-Service Pattern

```typescript
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('sheet/:sheetId')
  @Roles('EMPLOYEE')
  async getSheet(@Param('sheetId', ParseIntPipe) sheetId: number) {
    return this.ordersService.getSheet(sheetId);
  }

  @Post('sheet/:sheetId/night-save')
  @Roles('EMPLOYEE')
  async saveNightEntries(
    @Param('sheetId', ParseIntPipe) sheetId: number,
    @Body() dto: SaveOrdersDto[],
  ) {
    return this.ordersService.saveNightEntries(sheetId, dto);
  }
}
```

---

## Error Handling

### BadRequestException

```typescript
throw new BadRequestException(
  'Vehicle allocations are locked after NIGHT_SUBMITTED'
);
// Response: {statusCode: 400, message: '...', error: 'Bad Request'}
```

### ConflictException

```typescript
throw new ConflictException(
  'Cannot transition from DRAFT to FINALIZED'
);
// Response: {statusCode: 409, message: '...', error: 'Conflict'}
```

### NotFoundException

```typescript
throw new NotFoundException(`Paper ${paperId} not found`);
// Response: {statusCode: 404, message: '...', error: 'Not Found'}
```

### UnauthorizedException

```typescript
throw new UnauthorizedException('Invalid credentials');
// Response: {statusCode: 401, message: '...'}
```

### ForbiddenException

```typescript
throw new ForbiddenException('Insufficient permissions');
// Response: {statusCode: 403, message: '...', error: 'Forbidden'}
```

---

## Summary

### Security Components
- **JwtAuthGuard**: Validates JWT tokens
- **RolesGuard**: Checks user roles
- **@Roles()**: Metadata for required roles

### Data Processing
- **ValidationPipe**: DTO validation & transformation
- **ParseIntPipe**: URL parameter conversion
- **DTOs**: Type-safe data structures

### Business Logic
- **Builders**: Calculate billing amounts
- **Utilities**: Shared functions (dates, numbers)
- **Middleware**: Request logging and tracking

### Error Handling
- **Exception Filters**: Standardized error responses
- **HTTP Exceptions**: Specific error types
- **Validation Errors**: DTO-based validation feedback

---

**Last Updated**: 2026-06-16
