import { OrderPaperStatus } from '../../generated/prisma/client.js';

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

export const DATE_CONFIG = {
  MAX_FUTURE_DAYS: 30,

  TIMEZONE: 'Asia/Kolkata',

  DAY_START_HOURS: 0,
  DAY_START_MINUTES: 0,
  DAY_START_SECONDS: 0,
} as const;

export const ERROR_MESSAGES = {
  // Sheet/Paper errors
  INVALID_SHEET_ID: 'Invalid sheet ID provided',
  SHEET_NOT_FOUND: 'Order sheet not found',
  INVALID_PAPER_ID: 'Invalid paper ID provided',
  PAPER_NOT_FOUND: 'Order paper not found',

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

  CANNOT_EDIT_NIGHT: (status: OrderPaperStatus) =>
    `Cannot edit night entries when paper is ${status}. ` +
    `Allowed statuses: DRAFT, REOPENED`,
  CANNOT_EDIT_MORNING: (status: OrderPaperStatus) =>
    `Cannot edit morning entries when paper is ${status}. ` +
    `Allowed statuses: NIGHT_SUBMITTED, REOPENED`,
  NIGHT_ENTRY_INCOMPLETE: (groupName: string) =>
    `Night entry incomplete for sheet "${groupName}"`,

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

  DUPLICATE_ENTRIES: (keys: string[]) =>
    `Duplicate entries found: ${keys.join(', ')}. ` +
    `Each client-product combination can only appear once per sheet.`,
  CONFLICTING_DELIVERY_QTY: (clientId: number, productId: number) =>
    `Conflicting delivered quantities for Client ${clientId}, Product ${productId}`,

  NO_APPLICABLE_RATE: (productId: number, date: string) =>
    `No active rate found for product ${productId} on date ${date}`,

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
