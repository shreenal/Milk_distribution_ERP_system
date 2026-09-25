import { describe, expect, it, beforeEach } from 'vitest';

import { NightBillingService } from './night-billing.service.js';

describe('NightBillingService', () => {
  let service: NightBillingService;

  beforeEach(() => {
    service = new NightBillingService();
  });

  describe('calculate', () => {
    it('calculates a 10-tray order of 500ml pouches at ₹100/litre', () => {
      const result = service.calculate(10, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 10000,
      });
    });

    it('calculates using litre packaging directly', () => {
      const result = service.calculate(10, 100, 2, 1, 'L');

      expect(result).toEqual({
        nightBillAmount: 2000,
      });
    });

    it('handles decimal order quantities', () => {
      const result = service.calculate(10.5, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 10500,
      });
    });

    it('handles decimal selling rates', () => {
      const result = service.calculate(10, 12.5, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 1250,
      });
    });

    it('handles decimal order quantities and order-unit conversion together', () => {
      const result = service.calculate(10.5, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 10500,
      });
    });

    it('calculates a half-tray correctly', () => {
      const result = service.calculate(0.5, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 500,
      });
    });

    it('rounds the final bill to two decimal places', () => {
      const result = service.calculate(3, 10.123, 1, 1, 'L');

      expect(result).toEqual({
        nightBillAmount: 30.37,
      });
    });

    it('rounds values below the second decimal place correctly', () => {
      const result = service.calculate(1, 10.124, 1, 1, 'L');

      expect(result).toEqual({
        nightBillAmount: 10.12,
      });
    });

    it('rounds values at the half-cent boundary correctly', () => {
      const result = service.calculate(1, 10.125, 1, 1, 'L');

      expect(result).toEqual({
        nightBillAmount: 10.13,
      });
    });

    it('returns zero when ordered quantity is zero', () => {
      const result = service.calculate(0, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 0,
      });
    });

    it('returns zero when selling rate is zero', () => {
      const result = service.calculate(10, 0, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: 0,
      });
    });

    it('preserves negative values because this service does not perform validation', () => {
      const result = service.calculate(-10, 100, 20, 500, 'ML');

      expect(result).toEqual({
        nightBillAmount: -10000,
      });
    });

    it('throws for an unsupported packaging unit', () => {
      expect(() => service.calculate(10, 100, 20, 500, 'KG')).toThrow(
        'Unsupported packaging unit for litre billing: KG',
      );
    });

    it('returns exactly the NightBillingResult shape', () => {
      const result = service.calculate(2, 12.5, 4, 500, 'ML');

      expect(Object.keys(result)).toEqual(['nightBillAmount']);
      expect(typeof result.nightBillAmount).toBe('number');
    });
  });
});
