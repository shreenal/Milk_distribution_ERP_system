import {
  OrderPaperStatus,
  SupplyCategory,
} from '../../../generated/prisma/client.js';

// CD-5.2 / CD-5.3: per-field cap and precision for every money amount.
// MAX is a business limit, not a database limit (the column holds far more).
// OPEN ITEM CD-14.1: confirm this number with the business owner.
export const COLLECTION_AMOUNT = {
  MAX: 10000000,
  MAX_DECIMAL_PLACES: 2,
} as const;

export const COLLECTION_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Order sheet not found',

  CLIENT_NOT_IN_CATEGORY: (clientId: number, category: SupplyCategory) =>
    `Client ${clientId} does not belong to ${category} category.`,

  NIGHT_EDIT_NOT_ALLOWED:
    'Night collections cannot be edited in the current workflow state',

  // CD-2.3: says when editing is closed instead of blaming "after night submission".
  MORNING_EDIT_NOT_ALLOWED: (status: OrderPaperStatus) =>
    `Cannot edit morning collections when paper is ${status}. Allowed statuses: NIGHT_SUBMITTED, REOPENED`,

  ADMIN_EDIT_NOT_ALLOWED:
    'Admin collections cannot be edited in current workflow state',

  NEGATIVE_OFFICE_CASH_COLLECTION: 'Office cash collection cannot be negative',

  NEGATIVE_CASH_COLLECTION: 'Cash collection cannot be negative',

  NEGATIVE_CHEQUE_COLLECTION: 'Cheque collection cannot be negative',

  NEGATIVE_ONLINE_COLLECTION: 'Online collection cannot be negative',

  NEGATIVE_BANK_DEPOSIT: 'Bank deposit cannot be negative',
} as const;

export const COLLECTION_SUCCESS_MESSAGES = {
  NIGHT_SAVED: 'Night collections saved successfully',

  MORNING_SAVED: 'Morning collections saved successfully',

  ADMIN_SAVED: 'Admin collections saved successfully',
} as const;
