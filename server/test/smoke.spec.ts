import 'reflect-metadata';
import { it, expect } from 'vitest';
import { OrderCommercialService } from '../src/modules/transactions/orders/services/order-commercial.service.js';
import { BillingService } from '../src/modules/transactions/orders/services/billing.service.js';
import { OrdersValidationService } from '../src/modules/transactions/orders/services/orders-validation.service.js';
it('loads', () => {
  expect(OrderCommercialService).toBeDefined();
  expect(BillingService).toBeDefined();
  expect(OrdersValidationService).toBeDefined();
});
