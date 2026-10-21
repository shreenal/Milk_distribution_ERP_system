import { OrderPaperStatus } from '../../../generated/prisma/client.js';

export const QUANTITY_PRECISION = {
  MAX_ORDERED_QTY: 10000,
  MAX_DELIVERED_QTY: 10000,

  QTY_DECIMAL_PLACES: 2,
} as const;

export const ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Order sheet not found',
  PRODUCT_NOT_FOUND: (id: number) => `Product with ID ${id} not found`,
  PRODUCT_INACTIVE: (id: number) =>
    `Product ${id} is inactive and cannot be ordered`,
  NO_ORDERS_IN_SHEET: (groupName: string) =>
    `No orders entered for sheet "${groupName}". Please enter at least one order before submitting.`,
  CLIENT_NOT_FOUND: (id: number) => `Client with ID ${id} not found`,
  CLIENT_INACTIVE: (name: string) =>
    `Client "${name}" is inactive and cannot be ordered`,
  CLIENT_NOT_IN_GROUP: (clientId: number, groupId: number) =>
    `Client ${clientId} does not belong to group ${groupId}`,

  CANNOT_EDIT_NIGHT: (status: OrderPaperStatus) =>
    `Cannot edit night entries when paper is ${status}. Allowed status: DRAFT`,
  CANNOT_EDIT_MORNING: (status: OrderPaperStatus) =>
    `Cannot edit morning entries when paper is ${status}. ` +
    `Allowed statuses: NIGHT_SUBMITTED, REOPENED`,
  INVALID_QUANTITY_PRECISION: (qty: number) =>
    `Invalid quantity: ${qty}. ` +
    `Quantity must be specified to at most 2 decimal places.`,
  QUANTITY_NEGATIVE: (fieldName: string, value: number) =>
    `${fieldName} cannot be negative: ${value}`,

  DUPLICATE_ENTRIES: (keys: string[]) =>
    `Duplicate entries found: ${keys.join(', ')}. ` +
    `Each client-product combination can only appear once per sheet.`,
  NO_APPLICABLE_RATE: (productId: number, date: string) =>
    `No active rate found for product ${productId} on date ${date}`,
  PRODUCT_NOT_ON_SHEET: (productId: number) =>
    `Product ${productId} is not available on this sheet. Add it to the sheet before ordering it.`,
  NO_ORDER_LINES_IN_SHEET: (groupName: string) =>
    `No order lines exist for sheet "${groupName}". A sheet with no orders cannot be submitted.`,
  NEW_LINE_NOT_ALLOWED_WHEN_REOPENED:
    'New order lines cannot be created while the paper is REOPENED. Reopened sheets allow delivery corrections to existing lines only.',
} as const;

export const SUCCESS_MESSAGES = {
  NIGHT_ENTRIES_SAVED: 'Night entries saved successfully',
  MORNING_ENTRIES_SAVED: 'Morning entries saved successfully',
} as const;
