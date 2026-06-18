export const COLLECTION_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Order sheet not found',

  NIGHT_EDIT_NOT_ALLOWED:
  'Night collections cannot be edited in the current workflow state',

  MORNING_EDIT_NOT_ALLOWED:
    'Morning collections can only be edited after night submission',

  ADMIN_EDIT_NOT_ALLOWED:
    'Admin collections cannot be edited in current workflow state',

  NEGATIVE_OFFICE_AMOUNT: 'Office amount given cannot be negative',

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

export const COLLECTION_FIELDS = {
  EMPLOYEE: [
    'cashCollection',
    'officeAmountGiven',
    'chequeCollection',
    'employeeRemarks',
  ],

  ADMIN: ['onlineCollection', 'bankDeposit', 'adminRemarks'],
} as const;
