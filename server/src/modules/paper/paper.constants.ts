import { OrderPaperStatus } from '../../generated/prisma/client.js';

export const DATE_CONFIG = {
  MAX_FUTURE_DAYS: 30,
  TIMEZONE: 'Asia/Kolkata',
  DAY_START_HOURS: 0,
  DAY_START_MINUTES: 0,
  DAY_START_SECONDS: 0,
} as const;

export const ERROR_MESSAGES = {
  INVALID_PAPER_ID: 'Invalid paper ID provided',
  PAPER_NOT_FOUND: 'Order paper not found',

  NO_PAPERS_FOUND: 'No papers found in system',

  NO_ACTIVE_GROUPS: 'No active groups found to generate sheets',
  INVALID_STATUS_TRANSITION: (
    current: OrderPaperStatus,
    target: OrderPaperStatus,
  ) => `Cannot transition from ${current} to ${target}`,
  MUST_RESUBMIT_MORNING: (previousStatus: OrderPaperStatus) =>
    `After reopening from ${previousStatus}, ` +
    `you must resubmit morning entry before finalizing`,

  INVALID_DATE_FORMAT: 'Invalid date format',
  PAST_DATE_NOT_ALLOWED: 'Cannot perform operations on past dates',
  FUTURE_DATE_TOO_FAR: (maxDays: number) =>
    `Cannot generate paper more than ${maxDays} days ahead`,
  MISSING_REQUIRED_FIELD: (fieldName: string) =>
    `Required field "${fieldName}" is missing`,
  PAPER_NOT_IN_DRAFT_STATUS: 'Paper not in DRAFT status',
} as const;

export const SUCCESS_MESSAGES = {
  PAPER_GENERATED: (date: string) =>
    `Order paper generated successfully for ${date}`,
  NIGHT_ENTRIES_SUBMITTED: 'Night entries submitted successfully',
  MORNING_ENTRIES_SUBMITTED: 'Morning entries submitted successfully',
  PAPER_FINALIZED: 'Order paper finalized successfully',
  PAPER_REOPENED: 'Order paper reopened successfully',
} as const;
