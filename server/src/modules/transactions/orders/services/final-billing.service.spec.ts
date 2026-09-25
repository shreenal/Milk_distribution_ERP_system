import { beforeEach, describe, expect, it } from 'vitest';

import { FinalBillingService } from './final-billing.service.js';

describe('FinalBillingService', () => {
  let service: FinalBillingService;

  beforeEach(() => {
    service = new FinalBillingService();
  });

  describe('calculate', () => {
    describe('GST-inclusive', () => {
      it('calculates an inclusive GST bill using order-unit conversion', () => {
        // 10 trays × 20 pouches × 500ml = 100 litres
        // ₹118/litre inclusive = ₹11,800
        const result = service.calculate(10, 118, 18, true, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10000,
          gstAmount: 1800,
          finalBillAmount: 11800,
        });
      });

      it('supports litre packaging directly', () => {
        // 10 × 2 × 1L = 20 litres
        const result = service.calculate(10, 118, 18, true, 2, 1, 'L');

        expect(result).toEqual({
          taxableAmount: 2000,
          gstAmount: 360,
          finalBillAmount: 2360,
        });
      });

      it('keeps the selling rate as the final bill when GST is inclusive', () => {
        const result = service.calculate(5, 118, 18, true, 20, 500, 'ML');

        expect(result.finalBillAmount).toBe(5900);
      });

      it('calculates the taxable amount by removing GST from the inclusive price', () => {
        const result = service.calculate(1, 118, 18, true, 2, 1, 'L');

        expect(result.taxableAmount).toBe(200);
        expect(result.gstAmount).toBe(36);
        expect(result.finalBillAmount).toBe(236);
      });

      it('handles zero GST in the inclusive branch', () => {
        const result = service.calculate(10, 100, 0, true, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10000,
          gstAmount: 0,
          finalBillAmount: 10000,
        });
      });

      it('rounds inclusive GST results to two decimal places', () => {
        const result = service.calculate(1, 99.99, 18, true, 1, 1, 'L');

        expect(result.taxableAmount).toBe(84.74);
        expect(result.gstAmount).toBe(15.25);
        expect(result.finalBillAmount).toBe(99.99);
      });
    });

    describe('GST-exclusive', () => {
      it('calculates an exclusive GST bill using order-unit conversion', () => {
        // 10 trays × 20 pouches × 500ml = 100 litres
        const result = service.calculate(10, 100, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10000,
          gstAmount: 1800,
          finalBillAmount: 11800,
        });
      });

      it('supports litre packaging directly', () => {
        const result = service.calculate(10, 100, 18, false, 2, 1, 'L');

        expect(result).toEqual({
          taxableAmount: 2000,
          gstAmount: 360,
          finalBillAmount: 2360,
        });
      });

      it('adds GST to the taxable amount for the final bill', () => {
        const result = service.calculate(5, 100, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 5000,
          gstAmount: 900,
          finalBillAmount: 5900,
        });
      });

      it('handles zero GST in the exclusive branch', () => {
        const result = service.calculate(10, 100, 0, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10000,
          gstAmount: 0,
          finalBillAmount: 10000,
        });
      });

      it('rounds exclusive GST results to two decimal places', () => {
        const result = service.calculate(3, 10.123, 18, false, 1, 1, 'L');

        expect(result.taxableAmount).toBe(30.37);
        expect(result.gstAmount).toBe(5.47);
        expect(result.finalBillAmount).toBe(35.84);
      });
    });

    describe('quantity and edge cases', () => {
      it('returns zero for zero delivered quantity', () => {
        const result = service.calculate(0, 100, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 0,
          gstAmount: 0,
          finalBillAmount: 0,
        });
      });

      it('returns zero for zero selling rate', () => {
        const result = service.calculate(10, 0, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 0,
          gstAmount: 0,
          finalBillAmount: 0,
        });
      });

      it('handles decimal delivered quantities', () => {
        const result = service.calculate(10.5, 100, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10500,
          gstAmount: 1890,
          finalBillAmount: 12390,
        });
      });

      it('handles fractional order-unit quantities', () => {
        const result = service.calculate(0.5, 100, 18, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 500,
          gstAmount: 90,
          finalBillAmount: 590,
        });
      });

      it('handles decimal GST percentages', () => {
        const result = service.calculate(10, 100, 5.5, false, 20, 500, 'ML');

        expect(result).toEqual({
          taxableAmount: 10000,
          gstAmount: 550,
          finalBillAmount: 10550,
        });
      });

      it('throws for an unsupported packaging unit', () => {
        expect(() =>
          service.calculate(10, 100, 18, false, 20, 500, 'KG'),
        ).toThrow('Unsupported packaging unit for litre billing: KG');
      });

      it('returns the exact expected result shape', () => {
        const result = service.calculate(2, 50, 18, true, 4, 500, 'ML');

        expect(Object.keys(result)).toEqual([
          'taxableAmount',
          'gstAmount',
          'finalBillAmount',
        ]);

        expect(typeof result.taxableAmount).toBe('number');
        expect(typeof result.gstAmount).toBe('number');
        expect(typeof result.finalBillAmount).toBe('number');
      });
    });
  });
});
