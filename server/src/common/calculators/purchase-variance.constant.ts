import { PurchaseVarianceSeverity } from '../../types/purchase.types.js';

export const PURCHASE_VARIANCE_THRESHOLDS = {
  LOW: 5,
  MEDIUM: 10,
  HIGH: 20,
} as const;

export const PURCHASE_VARIANCE_SEVERITY_ORDER = [
  PurchaseVarianceSeverity.NONE,
  PurchaseVarianceSeverity.LOW,
  PurchaseVarianceSeverity.MEDIUM,
  PurchaseVarianceSeverity.HIGH,
  PurchaseVarianceSeverity.CRITICAL,
] as const;
