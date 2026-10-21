import { PurchaseVarianceCalculator } from './purchase-variance.calculator.js';
import {
  PurchaseVarianceSeverity as Sev,
  PurchaseVarianceStatus as St,
} from '../../types/purchase.types.js';
import { describe, expect, it } from 'vitest';

describe('PurchaseVarianceCalculator (PD-43, PD-44, PD-41)', () => {
  const calc = new PurchaseVarianceCalculator();

  it('38 of 40 is a LOW shortfall with a signed percentage', () => {
    const r = calc.calculate(40, 38);
    expect(r).toMatchObject({
      status: St.SHORTFALL,
      severity: Sev.LOW,
      variance: -2,
      variancePercentage: 5,
      signedVariancePercentage: -5,
      fulfillmentPercentage: 95,
      shortfallWarning: false,
    });
  });
  it('0 of 40 is a CRITICAL shortfall that raises the warning', () => {
    const r = calc.calculate(40, 0);
    expect(r).toMatchObject({
      status: St.SHORTFALL,
      severity: Sev.CRITICAL,
      signedVariancePercentage: -100,
      shortfallWarning: true,
    });
  });
  it('a surplus is flagged SURPLUS and never warns', () => {
    const r = calc.calculate(35, 38);
    expect(r).toMatchObject({
      status: St.SURPLUS,
      severity: Sev.MEDIUM,
      variancePercentage: 8.57,
      shortfallWarning: false,
    });
  });
  it('exact match', () =>
    expect(calc.calculate(40, 40)).toMatchObject({
      status: St.MATCHED,
      severity: Sev.NONE,
    }));
  it('purchase with no allocation is UNPLANNED_ALLOCATION with a null percentage', () =>
    expect(calc.calculate(0, 5)).toMatchObject({
      status: St.UNPLANNED_ALLOCATION,
      severity: Sev.CRITICAL,
      variancePercentage: null,
      signedVariancePercentage: null,
    }));
  it('zero against zero is matched', () =>
    expect(calc.calculate(0, 0).status).toBe(St.MATCHED));
  it('tier boundaries: 10% MEDIUM, 10.01% HIGH, 20% HIGH, 20.01% CRITICAL', () => {
    expect(calc.calculate(100, 90).severity).toBe(Sev.MEDIUM);
    expect(calc.calculate(10000, 8999).severity).toBe(Sev.HIGH);
    expect(calc.calculate(100, 80).severity).toBe(Sev.HIGH);
    expect(calc.calculate(10000, 7999).severity).toBe(Sev.CRITICAL);
  });
});
