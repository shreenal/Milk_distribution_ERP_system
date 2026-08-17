export const CASH_SETTLEMENT_ERRORS = {
  PAPER_NOT_FOUND: 'Paper not found',

  EDITING_NOT_ALLOWED: 'Cash settlement editing not allowed',
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
};
