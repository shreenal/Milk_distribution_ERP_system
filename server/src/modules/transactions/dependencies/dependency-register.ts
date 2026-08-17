import {
  BusinessDependency,
  DEPENDENCY_SCOPES,
  DEPENDENCY_IDS,
  DEPENDENCY_MODULES,
  DEPENDENCY_TRIGGERS,
  DEPENDENCY_TYPES,
} from './dependency.constant.js';

/**
 * Canonical business dependency register.
 *
 * This register contains only business-module dependencies.
 * Internal implementation relationships such as:
 *
 *   PURCHASE -> PurchaseBillingService
 *   ORDERS -> OrderBillingService
 *
 * are intentionally excluded.
 */

export const BUSINESS_DEPENDENCY_REGISTER: readonly BusinessDependency[] = [
  // ---------------------------------------------------------------------------
  // ORDERS
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.ORDERS_TO_VEHICLE_ALLOCATION,
    source: DEPENDENCY_MODULES.ORDERS,
    target: DEPENDENCY_MODULES.VEHICLE_ALLOCATION,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.ORDERS_TO_CLIENT_TRAYS_PROPAGATION,
    source: DEPENDENCY_MODULES.ORDERS,
    target: DEPENDENCY_MODULES.CLIENT_TRAYS,
    type: DEPENDENCY_TYPES.PROPAGATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.ORDERS_TO_CLIENT_TRAYS_CONSUMPTION,
    source: DEPENDENCY_MODULES.ORDERS,
    target: DEPENDENCY_MODULES.CLIENT_TRAYS,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    scope: DEPENDENCY_SCOPES.CURRENT,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.ORDERS_TO_DISTRIBUTOR_TRANSFER_CONSUMPTION,
    source: DEPENDENCY_MODULES.ORDERS,
    target: DEPENDENCY_MODULES.DISTRIBUTOR_TRANSFER,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  // ---------------------------------------------------------------------------
  // PAPER LIFECYCLE PROPAGATION
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.PAPER_TO_CLIENT_TRAYS_PROPAGATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.CLIENT_TRAYS,
    type: DEPENDENCY_TYPES.PROPAGATION,
    trigger: DEPENDENCY_TRIGGERS.ON_FINALIZE,
    scope: DEPENDENCY_SCOPES.FORWARD,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_DISTRIBUTOR_TRANSFER_PROPAGATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.DISTRIBUTOR_TRANSFER,
    type: DEPENDENCY_TYPES.PROPAGATION,
    trigger: DEPENDENCY_TRIGGERS.ON_FINALIZE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_DAIRY_TRAYS_PROPAGATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.DAIRY_TRAYS,
    type: DEPENDENCY_TYPES.PROPAGATION,
    trigger: DEPENDENCY_TRIGGERS.ON_FINALIZE,
    scope: DEPENDENCY_SCOPES.FORWARD,
    sessionAware: true,
  },

  // ---------------------------------------------------------------------------
  // VEHICLE ALLOCATION -> PURCHASE
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.VEHICLE_ALLOCATION_TO_PURCHASE,
    source: DEPENDENCY_MODULES.VEHICLE_ALLOCATION,
    target: DEPENDENCY_MODULES.PURCHASE,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  // ---------------------------------------------------------------------------
  // PURCHASE -> DAIRY TRAYS
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.PURCHASE_TO_DAIRY_TRAYS_CONSUMPTION,
    source: DEPENDENCY_MODULES.PURCHASE,
    target: DEPENDENCY_MODULES.DAIRY_TRAYS,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PURCHASE_TO_DAIRY_TRAYS_PROPAGATION,
    source: DEPENDENCY_MODULES.PURCHASE,
    target: DEPENDENCY_MODULES.DAIRY_TRAYS,
    type: DEPENDENCY_TYPES.PROPAGATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  // ---------------------------------------------------------------------------
  // COLLECTIONS -> CASH SETTLEMENT
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.COLLECTIONS_TO_CASH_SETTLEMENT,
    source: DEPENDENCY_MODULES.COLLECTIONS,
    target: DEPENDENCY_MODULES.CASH_SETTLEMENT,
    type: DEPENDENCY_TYPES.CONSUMPTION,
    trigger: DEPENDENCY_TRIGGERS.ON_READ,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  // ---------------------------------------------------------------------------
  // PAPER -> MODULE VALIDATION
  //
  // Paper workflow state is consumed by the target module to determine
  // whether the target operation is allowed.
  // ---------------------------------------------------------------------------

  {
    id: DEPENDENCY_IDS.PAPER_TO_ORDERS_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.ORDERS,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_COLLECTIONS_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.COLLECTIONS,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_CLIENT_TRAYS_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.CLIENT_TRAYS,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: false,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_VEHICLE_ALLOCATION_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.VEHICLE_ALLOCATION,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_PURCHASE_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.PURCHASE,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_DAIRY_TRAYS_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.DAIRY_TRAYS,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_CASH_SETTLEMENT_ON_SAVE_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.CASH_SETTLEMENT,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SAVE,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },

  {
    id: DEPENDENCY_IDS.PAPER_TO_CASH_SETTLEMENT_ON_SUBMIT_VALIDATION,
    source: DEPENDENCY_MODULES.PAPER,
    target: DEPENDENCY_MODULES.CASH_SETTLEMENT,
    type: DEPENDENCY_TYPES.VALIDATION,
    trigger: DEPENDENCY_TRIGGERS.ON_SUBMIT,
    scope: DEPENDENCY_SCOPES.CURRENT,
    sessionAware: true,
  },
] as const;
