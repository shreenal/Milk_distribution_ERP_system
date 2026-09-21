import { describe, expect, it } from 'vitest';

import { PurchaseVarianceCalculator } from './purchase-variance.calculator.js';

import { PurchaseVarianceSeverity } from '../../types/purchase.types.js';

describe('PurchaseVarianceCalculator', () => {
  const calculator = new PurchaseVarianceCalculator();

  it('returns no variance when purchased quantity equals allocated quantity', () => {
    expect(calculator.calculate(100, 100)).toEqual({
      hasVariance: false,
      variance: 0,
      variancePercentage: 0,
      severity: PurchaseVarianceSeverity.NONE,
    });
  });

  it('calculates positive variance correctly', () => {
    expect(calculator.calculate(100, 105)).toEqual({
      hasVariance: true,
      variance: 5,
      variancePercentage: 5,
      severity: PurchaseVarianceSeverity.LOW,
    });
  });

  it('calculates negative variance using absolute percentage', () => {
    expect(calculator.calculate(100, 95)).toEqual({
      hasVariance: true,
      variance: -5,
      variancePercentage: 5,
      severity: PurchaseVarianceSeverity.LOW,
    });
  });

  it('uses the correct severity at each threshold', () => {
    expect(calculator.calculate(100, 105).severity).toBe(
      PurchaseVarianceSeverity.LOW,
    );

    expect(calculator.calculate(100, 110).severity).toBe(
      PurchaseVarianceSeverity.MEDIUM,
    );

    expect(calculator.calculate(100, 120).severity).toBe(
      PurchaseVarianceSeverity.HIGH,
    );

    expect(calculator.calculate(100, 121).severity).toBe(
      PurchaseVarianceSeverity.CRITICAL,
    );
  });

  it('rounds variance percentage to two decimal places', () => {
    expect(calculator.calculate(300, 310).variancePercentage).toBe(3.33);
  });

  it('treats zero allocation and zero purchase as no variance', () => {
    expect(calculator.calculate(0, 0)).toEqual({
      hasVariance: false,
      variance: 0,
      variancePercentage: 0,
      severity: PurchaseVarianceSeverity.NONE,
    });
  });

  it('treats a purchase against zero allocation as 100 percent critical variance', () => {
    expect(calculator.calculate(0, 10)).toEqual({
      hasVariance: true,
      variance: 10,
      variancePercentage: 100,
      severity: PurchaseVarianceSeverity.CRITICAL,
    });
  });
});
