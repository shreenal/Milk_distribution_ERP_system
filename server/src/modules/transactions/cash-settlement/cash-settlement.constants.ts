// CS-5: business limits for every financial input. All four numbers are
// PLACEHOLDERS (open item CS-16.1), the same situation as COLLECTION_AMOUNT.MAX
// (CD-14.1). They live here so they can be changed in one place.
export const CASH_SETTLEMENT_LIMITS = {
  MAX_NOTE_COUNT: 100000,
  MAX_COIN_AMOUNT: 100000,
  MIN_EXPENSE_AMOUNT: 0.01,
  MAX_EXPENSE_AMOUNT: 10000000,
  MAX_ENTRIES: 1000,
} as const;

export const STALE_DATA_MESSAGE =
  'Cash Settlement data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';

export const CASH_SETTLEMENT_ERRORS = {
  PAPER_NOT_FOUND: 'Paper not found',

  EDITING_NOT_ALLOWED: 'Cash settlement editing not allowed',

  INVALID_EXPECTED_UPDATED_AT: 'Invalid expectedUpdatedAt',

  INVALID_ENTRIES: 'Invalid cash settlement entries',

  NOT_READY_FOR_SUBMISSION: 'Cash settlement is not ready for submission',

  NOT_RECONCILED_AFTER_REOPEN:
    'Cash settlement no longer reconciles after reopening. Route denominations must be re-entered before finalizing.',
};

export const CASH_SETTLEMENT_VALIDATION_ERRORS = {
  ROUTE_CASH_MISMATCH: (
    routeName: string,
    expected: number,
    received: number,
  ) =>
    `Route ${routeName} cash mismatch. Expected ${expected}, received ${received}`,

  BANK_DEPOSIT_EXCEEDS_CASH: (officeCash: number, totalDeposits: number) =>
    `Bank deposits exceed available office cash. Available: ${officeCash}, Deposited: ${totalDeposits}`,

  BANK_DEPOSIT_DENOMINATION_EXCEEDS: (
    label: string,
    available: number,
    deposited: number,
  ) =>
    `Bank deposit ${label} count exceeds available cash. Available: ${available}, Deposited: ${deposited}`,

  RECONCILIATION_MISMATCH: (
    revisedCashOnHand: number,
    historicalCashOnHand: number,
    difference: number,
  ) =>
    `Cash settlement reconciliation mismatch. Revised cash on hand: ₹${revisedCashOnHand.toFixed(
      2,
    )}, historical cash on hand: ₹${historicalCashOnHand.toFixed(
      2,
    )}, difference: ₹${difference.toFixed(2)}`,

  DUPLICATE_ROUTES: (ids: number[]) =>
    `Duplicate route entries found: ${ids.join(', ')}. Each route can only appear once per save.`,

  DUPLICATE_RECORD_IDS: (label: string, ids: number[]) =>
    `Duplicate ${label} id(s) found: ${ids.join(', ')}. Each id can only appear once per save.`,

  RECORD_NOT_IN_PAPER: (label: string, ids: number[], paperId: number) =>
    `${label} id(s) ${ids.join(', ')} do not belong to paper ${paperId}`,

  RECORD_ALSO_DELETED: (label: string, ids: number[]) =>
    `${label} id(s) ${ids.join(', ')} cannot be saved and deleted in the same request`,

  EXPENSE_ROUTE_CHANGED: (ids: number[]) =>
    `Route expense id(s) ${ids.join(', ')} belong to a different route. An expense cannot be moved between routes; delete it and add a new one`,

  EMPLOYEE_NOT_FOUND: (ids: number[]) =>
    `Employee(s) not found: ${ids.join(', ')}`,

  EMPLOYEE_INACTIVE: (names: string[]) =>
    `Inactive employee(s) cannot receive a new direct collection: ${names.join(', ')}`,
};
