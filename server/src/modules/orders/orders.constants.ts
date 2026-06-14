export const TRANSACTION_CONFIG = {
  TIMEOUT_MS: 10000,
  ISOLATION_LEVEL: 'Serializable' as const,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 100,
} as const;

export const QUANTITY_PRECISION = {
  OPERATIONAL_UNIT_LITRES: 10,

  MIN_UNIT_PRECISION: 0.5,

  MAX_ORDERED_QTY: 10000,
  MAX_DELIVERED_QTY: 10000,

  RATE_DECIMAL_PLACES: 2,
  QTY_DECIMAL_PLACES: 2,
  AMOUNT_DECIMAL_PLACES: 2,
} as const;

export const PAPER_STATUS = {
  DRAFT: 'DRAFT' as const,
  NIGHT_SUBMITTED: 'NIGHT_SUBMITTED' as const,
  MORNING_SUBMITTED: 'MORNING_SUBMITTED' as const,
  FINALIZED: 'FINALIZED' as const,
  REOPENED: 'REOPENED' as const,
} as const;

export type PaperStatus = (typeof PAPER_STATUS)[keyof typeof PAPER_STATUS];

/**
 * Editable Statuses
 * Which statuses allow night vs morning edits
 */
export const EDITABLE_STATUSES = {
  // Can edit night entries in these statuses
  NIGHT_EDITABLE: [PAPER_STATUS.DRAFT, PAPER_STATUS.REOPENED] as const,

  // Can edit morning entries in these statuses
  MORNING_EDITABLE: [
    PAPER_STATUS.NIGHT_SUBMITTED,
    PAPER_STATUS.REOPENED,
  ] as const,

  // Can finalize in these statuses
  FINALIZABLE: [PAPER_STATUS.MORNING_SUBMITTED, PAPER_STATUS.REOPENED] as const,
} as const;

/**
 * Date & Time Configuration
 * Temporal constraints for operations
 */
export const DATE_CONFIG = {
  // Maximum days in the future for generating new order papers
  // Prevents accidental far-future date entries
  MAX_FUTURE_DAYS: 30,

  // Timezone for date calculations
  // India Standard Time
  TIMEZONE: 'Asia/Kolkata',

  // Start of day time for date boundary
  DAY_START_HOURS: 0,
  DAY_START_MINUTES: 0,
  DAY_START_SECONDS: 0,
} as const;

/**
 * Deduplication Strategy
 * How duplicate entries are handled
 */
export const DEDUPLICATION = {
  // Night entries: SUM quantities if duplicate
  // Rationale: Operator may accidentally submit same order twice
  // Solution: Combine into single order with total quantity
  NIGHT_STRATEGY: 'sum' as const,

  // Morning entries: ERROR if duplicate
  // Rationale: Delivered quantity must be singular
  // Conflicting values indicate data corruption
  MORNING_STRATEGY: 'error' as const,
} as const;

/**
 * Error Messages
 * Centralized user-facing error messages
 *
 * Benefits:
 * - Consistent messaging across app
 * - Easy to update copy
 * - Testable error messages
 * - i18n ready
 */
export const ERROR_MESSAGES = {
  // Sheet/Paper errors
  INVALID_SHEET_ID: 'Invalid sheet ID provided',
  SHEET_NOT_FOUND: 'Order sheet not found',
  INVALID_PAPER_ID: 'Invalid paper ID provided',
  PAPER_NOT_FOUND: 'Order paper not found',

  // Group/Product/Client errors
  NO_ACTIVE_GROUPS: 'No active groups found to generate sheets',
  PRODUCT_NOT_FOUND: (id: number) => `Product with ID ${id} not found`,
  PRODUCT_INACTIVE: (name: string) =>
    `Product "${name}" is inactive and cannot be ordered`,
  NO_ORDERS_IN_SHEET: (groupName: string) =>
    `No orders entered for sheet "${groupName}". Please enter at least one order before submitting.`,
  CLIENT_NOT_FOUND: (id: number) => `Client with ID ${id} not found`,
  CLIENT_INACTIVE: (name: string) =>
    `Client "${name}" is inactive and cannot be ordered`,
  PRODUCT_NOT_IN_GROUP: (productId: number, groupId: number) =>
    `Product ${productId} does not belong to group ${groupId}`,
  CLIENT_NOT_IN_GROUP: (clientId: number, groupId: number) =>
    `Client ${clientId} does not belong to group ${groupId}`,

  // Status/Workflow errors
  CANNOT_EDIT_NIGHT: (status: PaperStatus) =>
    `Cannot edit night entries when paper is ${status}. ` +
    `Allowed statuses: DRAFT, REOPENED`,
  CANNOT_EDIT_MORNING: (status: PaperStatus) =>
    `Cannot edit morning entries when paper is ${status}. ` +
    `Allowed statuses: NIGHT_SUBMITTED, REOPENED`,
  NIGHT_ENTRY_INCOMPLETE: (groupName: string) =>
    `Night entry incomplete for sheet "${groupName}"`,

  // Quantity/Amount errors
  INVALID_QUANTITY_PRECISION: (qty: number, precision: number) =>
    `Invalid quantity: ${qty}. ` +
    `Quantities must be in increments of ${precision} ` +
    `(e.g., 10, 10.5, 11, 11.5, etc.)`,
  QUANTITY_NEGATIVE: (fieldName: string, value: number) =>
    `${fieldName} cannot be negative: ${value}`,
  QUANTITY_EXCEEDS_MAX: (fieldName: string, value: number, max: number) =>
    `${fieldName} (${value}) exceeds maximum of ${max}`,
  DELIVERED_EXCEEDS_ORDERED: (delivered: number, ordered: number) =>
    `Delivered quantity (${delivered}) ` +
    `cannot exceed ordered quantity (${ordered})`,
  NO_ORDERED_QUANTITY: (clientId: number, productId: number) =>
    `No ordered quantity found for Client ${clientId}, Product ${productId}`,

  // Duplicate/Conflict errors
  DUPLICATE_ENTRIES: (keys: string[]) =>
    `Duplicate entries found: ${keys.join(', ')}. ` +
    `Each client-product combination can only appear once per sheet.`,
  CONFLICTING_DELIVERY_QTY: (clientId: number, productId: number) =>
    `Conflicting delivered quantities for Client ${clientId}, Product ${productId}`,

  // Rate/Billing errors
  NO_APPLICABLE_RATE: (productId: number, date: string) =>
    `No active rate found for product ${productId} on date ${date}`,

  // General validation errors
  INVALID_DATE_FORMAT: 'Invalid date format',
  PAST_DATE_NOT_ALLOWED: 'Cannot perform operations on past dates',
  FUTURE_DATE_TOO_FAR: (maxDays: number) =>
    `Cannot generate paper more than ${maxDays} days ahead`,
  MISSING_REQUIRED_FIELD: (fieldName: string) =>
    `Required field "${fieldName}" is missing`,
} as const;

export const SUCCESS_MESSAGES = {
  NIGHT_ENTRIES_SAVED: 'Night entries saved successfully',
  MORNING_ENTRIES_SAVED: 'Morning entries saved successfully',

  ENTRIES_DEDUPLICATED: (removed: number) =>
    `Saved successfully (${removed} duplicate(s) merged)`,
} as const;

export const OPERATION_TYPES = {
  NIGHT_ENTRY: 'night_entry' as const,
  MORNING_ENTRY: 'morning_entry' as const,
  FINALIZE: 'finalize' as const,
  REOPEN: 'reopen' as const,
  SUBMIT: 'submit' as const,
} as const;

export const RATE_TYPES = {
  CLIENT_SPECIFIC: 'client_specific' as const,
  GROUP_SPECIFIC: 'group_specific' as const,
  MASTER: 'master' as const,
} as const;

export const AUDIT_FIELDS = {
  CREATED_AT: 'created_at' as const,
  CREATED_BY: 'created_by' as const,
  UPDATED_AT: 'updated_at' as const,
  UPDATED_BY: 'updated_by' as const,
  FINALIZED_AT: 'finalized_at' as const,
  FINALIZED_BY: 'finalized_by' as const,
  REOPENED_AT: 'reopened_at' as const,
  REOPENED_BY: 'reopened_by' as const,
} as const;

export const FEATURE_FLAGS = {
  ENABLE_DUPLICATE_COMPRESSION: true,
  ENABLE_QUANTITY_PRECISION_VALIDATION: true,
  ENABLE_PRODUCT_VALIDATION: true,
  ENABLE_WORKFLOW_VALIDATION: true,
  ENABLE_AUDIT_TRAIL: false, // Not yet implemented
} as const;
