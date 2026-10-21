export const PROPAGATION_QUEUE = 'propagation-queue';

export const PROPAGATION_OUTBOX_TYPES = {
  CLIENT_TRAYS_FORWARD: 'CLIENT_TRAYS_FORWARD',
  CLIENT_TRAYS_CASCADE_FROM_SHEET: 'CLIENT_TRAYS_CASCADE_FROM_SHEET',
  DAIRY_TRAYS_FORWARD: 'DAIRY_TRAYS_FORWARD',
} as const;

export type PropagationOutboxType =
  (typeof PROPAGATION_OUTBOX_TYPES)[keyof typeof PROPAGATION_OUTBOX_TYPES];

export const PROPAGATION_OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
  FAILED: 'FAILED',
} as const;

export type PropagationOutboxStatus =
  (typeof PROPAGATION_OUTBOX_STATUS)[keyof typeof PROPAGATION_OUTBOX_STATUS];

export const PROPAGATION_OUTBOX_RELAY_INTERVAL_MS = 5000;

export const PROPAGATION_OUTBOX_RELAY_BATCH_SIZE = 20;

export const PROPAGATION_OUTBOX_MAX_ATTEMPTS = 5;

export const PROPAGATION_OUTBOX_STUCK_AFTER_MS = 2 * 60 * 1000;

// A PENDING/PROCESSING row untouched for this long is reported as a problem.
export const PROPAGATION_OUTBOX_PROBLEM_AFTER_MS = 10 * 60 * 1000;

// Redis being down makes queue.add hang rather than fail; bound it so the
// relay records an attempt instead of stalling every later tick.
export const PROPAGATION_OUTBOX_DISPATCH_TIMEOUT_MS = 10 * 1000;
