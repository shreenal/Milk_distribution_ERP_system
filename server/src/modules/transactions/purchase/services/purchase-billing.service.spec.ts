import { beforeEach, describe, expect, it } from 'vitest';
import { PurchaseBillingService } from './purchase-billing.service.js';

describe('PurchaseBillingService', () => {
  let service: PurchaseBillingService;

  beforeEach(() => {
    service = new PurchaseBillingService();
  });

  describe('calculate', () => {
    it('calculates the purchase amount with unit multiplier 1', () => {
      const result = service.calculate(10, 25, 1);

      expect(result).toEqual({
        purchaseAmount: 250,
      });
    });

    it('applies a unit multiplier greater than 1', () => {
      const result = service.calculate(10, 25, 2);

      expect(result).toEqual({
        purchaseAmount: 500,
      });
    });

    it('returns zero when purchased quantity is zero', () => {
      const result = service.calculate(0, 25, 2);

      expect(result).toEqual({
        purchaseAmount: 0,
      });
    });

    it('returns zero when purchase rate is zero', () => {
      const result = service.calculate(10, 0, 2);

      expect(result).toEqual({
        purchaseAmount: 0,
      });
    });

    it('rounds the purchase amount to two decimal places', () => {
      const result = service.calculate(3, 10.125, 1);

      expect(result).toEqual({
        purchaseAmount: 30.38,
      });
    });

    it('rounds a value down when the third decimal is below five', () => {
      const result = service.calculate(1, 10.124, 1);

      expect(result).toEqual({
        purchaseAmount: 10.12,
      });
    });

    it('rounds a value up when the third decimal is five or greater', () => {
      const result = service.calculate(1, 10.125, 1);

      expect(result).toEqual({
        purchaseAmount: 10.13,
      });
    });

    it('handles fractional purchased quantities', () => {
      const result = service.calculate(2.5, 10, 1);

      expect(result).toEqual({
        purchaseAmount: 25,
      });
    });

    it('handles fractional unit multipliers', () => {
      const result = service.calculate(10, 12.5, 0.5);

      expect(result).toEqual({
        purchaseAmount: 62.5,
      });
    });

    it('rounds floating-point arithmetic to two decimal places', () => {
      const result = service.calculate(0.1, 0.2, 1);

      expect(result).toEqual({
        purchaseAmount: 0.02,
      });
    });
  });
});