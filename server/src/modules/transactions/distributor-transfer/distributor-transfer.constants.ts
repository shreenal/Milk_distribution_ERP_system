// distributor-transfer.constants.ts
export const DISTRIBUTOR_TRANSFER_ERRORS = {
  ORDER_PAPER_NOT_FOUND: 'Order paper not found',
  GENERATE_NOT_ALLOWED:
    'Distributor transfers can only be manually regenerated while the paper is REOPENED',
} as const;

export const STALE_DATA_MESSAGE =
  'distributor transfer data has changed since you last loaded it. Please refresh and re-apply your changes before saving again.';
