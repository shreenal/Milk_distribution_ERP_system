export const COLLECTION_FIELDS = {
  EMPLOYEE: [
    'cashCollection',

    'officeAmountGiven',

    'chequeCollection',

    'employeeRemarks',
  ],

  ADMIN: ['onlineCollection', 'bankDeposit', 'adminRemarks'],
} as const;

export const COLLECTION_SUCCESS_MESSAGES = {
  SAVED: 'Collections saved successfully',
} as const;

export const COLLECTION_ERROR_MESSAGES = {
  SHEET_NOT_FOUND: 'Order sheet not found',

  PAPER_NOT_EDITABLE: 'Collections cannot be modified',
} as const;
