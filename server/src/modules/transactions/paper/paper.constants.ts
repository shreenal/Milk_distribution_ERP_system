import { OrderPaperStatus } from '../../../generated/prisma/client.js';

export const DATE_CONFIG = {
  MAX_FUTURE_DAYS: 30,
  TIMEZONE: 'Asia/Kolkata',

  GENERATION_SALE_DATE_OFFSET_DAYS: 1,
} as const;

// PA-11.3: submit-night, submit-morning and finalize run every other module's
// readiness checks (and finalize also rebuilds distributor transfers) inside one
// serializable transaction. They get their own, longer limit instead of the
// shared TRANSACTION_CONFIG.TIMEOUT_MS. PLACEHOLDER (open item PA-14.1): confirm
// against the largest real paper.
export const PAPER_TRANSACTION_TIMEOUT_MS = 30000;

export const ERROR_MESSAGES = {
  INVALID_PAPER_ID: 'Invalid paper ID provided',
  PAPER_NOT_FOUND: 'Order paper not found',

  NO_PAPERS_FOUND: 'No papers found in system',

  NO_ACTIVE_GROUPS: 'No active groups found to generate sheets',
  INVALID_STATUS_TRANSITION: (
    current: OrderPaperStatus,
    target: OrderPaperStatus,
  ) => `Cannot transition from ${current} to ${target}`,
  INVALID_DATE_FORMAT: 'Invalid date format',
  NIGHT_ALREADY_SUBMITTED: (status: OrderPaperStatus) =>
    `Night entries were already submitted (paper is ${status})`,
  MORNING_ALREADY_SUBMITTED: (status: OrderPaperStatus) =>
    `Morning entries were already submitted (paper is ${status})`,
  ALREADY_FINALIZED: 'Paper is already FINALIZED',
  ALREADY_REOPENED: 'Paper is already REOPENED',
  PREVIOUS_PAPER_NOT_FINALIZED: (saleDate: string, status: OrderPaperStatus) =>
    `Cannot finalize: the previous paper (${saleDate}) is ${status}. Finalize it first.`,
  // PA-8.4
  PREVIOUS_PAPER_PROPAGATION_FAILED: (saleDate: string) =>
    `Cannot finalize: background tray propagation for the previous paper (${saleDate}) has failed. Fix the cause and retry the propagation first.`,
  ONLY_CURRENT_BUSINESS_DAY: (expectedSaleDate: string) =>
    `Papers can only be generated for the current business day (sale date ${expectedSaleDate})`,

  // PA-6.4 / PA-7.4 / PA-8.6: every independent readiness failure is reported
  // together as { message, details[] }.
  NIGHT_NOT_READY: 'Night submission is not ready',
  MORNING_NOT_READY: 'Morning submission is not ready',
  FINALIZE_NOT_READY: 'Finalization is not ready',

  // PA-11.3: a transaction that hit the time limit saved nothing.
  TRANSACTION_TIMED_OUT:
    'The request took too long and nothing was saved. Please retry.',
} as const;

export const SUCCESS_MESSAGES = {
  PAPER_GENERATED: (date: string) =>
    `Order paper generated successfully for ${date}`,
  NIGHT_ENTRIES_SUBMITTED: 'Night entries submitted successfully',
  MORNING_ENTRIES_SUBMITTED: 'Morning entries submitted successfully',
  PAPER_FINALIZED: 'Order paper finalized successfully',
  PAPER_REOPENED: 'Order paper reopened successfully',
} as const;
