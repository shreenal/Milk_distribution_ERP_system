export const DEPENDENCY_MODULES = {
  PAPER: 'PAPER',
  ORDERS: 'ORDERS',
  VEHICLE_ALLOCATION: 'VEHICLE_ALLOCATION',
  PURCHASE: 'PURCHASE',
  COLLECTIONS: 'COLLECTIONS',
  CLIENT_TRAYS: 'CLIENT_TRAYS',
  DAIRY_TRAYS: 'DAIRY_TRAYS',
  CASH_SETTLEMENT: 'CASH_SETTLEMENT',
  DISTRIBUTOR_TRANSFER: 'DISTRIBUTOR_TRANSFER',
} as const;

export type DependencyModule =
  (typeof DEPENDENCY_MODULES)[keyof typeof DEPENDENCY_MODULES];

/**
 * Business dependency semantics.
 *
 * CONSUMPTION:
 * Target reads source data to construct its own result.
 *
 * PROPAGATION:
 * An operation in the source explicitly causes downstream
 * state to be recalculated or regenerated.
 *
 * VALIDATION:
 * Target operation is gated by source state.
 */
export const DEPENDENCY_TYPES = {
  CONSUMPTION: 'CONSUMPTION',
  PROPAGATION: 'PROPAGATION',
  VALIDATION: 'VALIDATION',
} as const;

export type DependencyType =
  (typeof DEPENDENCY_TYPES)[keyof typeof DEPENDENCY_TYPES];

/**
 * Trigger at which the dependency becomes relevant.
 */
export const DEPENDENCY_TRIGGERS = {
  ON_READ: 'ON_READ',
  ON_SAVE: 'ON_SAVE',
  ON_FINALIZE: 'ON_FINALIZE',
  ON_SUBMIT: 'ON_SUBMIT',
} as const;

export type DependencyTrigger =
  (typeof DEPENDENCY_TRIGGERS)[keyof typeof DEPENDENCY_TRIGGERS];

/**
 * Canonical business dependency IDs.
 *
 * These IDs correspond to the audited business dependency register.
 */
export const DEPENDENCY_IDS = {
  ORDERS_TO_VEHICLE_ALLOCATION: 'DEP-001',

  ORDERS_TO_CLIENT_TRAYS_PROPAGATION: 'DEP-002',
  ORDERS_TO_CLIENT_TRAYS_CONSUMPTION: 'DEP-003',

  PAPER_TO_CLIENT_TRAYS_PROPAGATION: 'DEP-004',

  ORDERS_TO_DISTRIBUTOR_TRANSFER_CONSUMPTION: 'DEP-005',
  PAPER_TO_DISTRIBUTOR_TRANSFER_PROPAGATION: 'DEP-006',

  VEHICLE_ALLOCATION_TO_PURCHASE: 'DEP-007',

  PURCHASE_TO_DAIRY_TRAYS_CONSUMPTION: 'DEP-008',
  PURCHASE_TO_DAIRY_TRAYS_PROPAGATION: 'DEP-009',

  PAPER_TO_DAIRY_TRAYS_PROPAGATION: 'DEP-010',

  COLLECTIONS_TO_CASH_SETTLEMENT: 'DEP-011',

  PAPER_TO_ORDERS_VALIDATION: 'DEP-012',
  PAPER_TO_COLLECTIONS_VALIDATION: 'DEP-013',
  PAPER_TO_CLIENT_TRAYS_VALIDATION: 'DEP-014',
  PAPER_TO_VEHICLE_ALLOCATION_VALIDATION: 'DEP-015',
  PAPER_TO_PURCHASE_VALIDATION: 'DEP-016',
  PAPER_TO_DAIRY_TRAYS_VALIDATION: 'DEP-017',
  PAPER_TO_CASH_SETTLEMENT_ON_SAVE_VALIDATION: 'DEP-018',
  PAPER_TO_CASH_SETTLEMENT_ON_SUBMIT_VALIDATION: 'DEP-019',
} as const;

export type DependencyId = (typeof DEPENDENCY_IDS)[keyof typeof DEPENDENCY_IDS];

export interface BusinessDependency {
  id: DependencyId;

  source: DependencyModule;
  target: DependencyModule;

  type: DependencyType;
  trigger: DependencyTrigger;
  scope: DependencyScope;

  /**
   * Whether the dependency preserves delivery-session
   * semantics.
   *
   * This is metadata only. The actual session filtering/keying
   * remains the responsibility of the implementation.
   */
  sessionAware: boolean;
}

export const DEPENDENCY_SCOPES = {
  CURRENT: 'CURRENT',
  FORWARD: 'FORWARD',
} as const;

export type DependencyScope =
  (typeof DEPENDENCY_SCOPES)[keyof typeof DEPENDENCY_SCOPES];
