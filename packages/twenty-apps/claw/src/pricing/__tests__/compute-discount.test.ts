import { describe, expect, it } from 'vitest';

import { computeDiscount } from 'src/pricing/compute-discount';

describe('computeDiscount', () => {
  it('takes a percent of the sum', () => {
    expect(
      computeDiscount({ subtotal: 1_410_000, kind: 'PERCENT', value: 5 }),
    ).toBe(70_500);
  });

  it('takes an amount in сум as it is', () => {
    expect(
      computeDiscount({ subtotal: 1_410_000, kind: 'AMOUNT', value: 70_500 }),
    ).toBe(70_500);
  });

  it.each([
    ['no value', 'PERCENT', null],
    ['no kind', null, 5],
    ['zero', 'AMOUNT', 0],
    ['a negative value', 'PERCENT', -5],
  ] as const)('is zero for %s', (_, kind, value) => {
    expect(computeDiscount({ subtotal: 1_410_000, kind, value })).toBe(0);
  });

  it('is never more than the sum', () => {
    expect(
      computeDiscount({ subtotal: 1_410_000, kind: 'PERCENT', value: 150 }),
    ).toBe(1_410_000);
    expect(
      computeDiscount({ subtotal: 1_410_000, kind: 'AMOUNT', value: 2_000_000 }),
    ).toBe(1_410_000);
  });

  it('is zero when there is nothing to discount', () => {
    expect(computeDiscount({ subtotal: 0, kind: 'PERCENT', value: 5 })).toBe(0);
    expect(computeDiscount({ subtotal: 0, kind: 'AMOUNT', value: 500 })).toBe(0);
  });

  it.each([
    ['a value that is not a number', 1_410_000, Number.NaN],
    ['an endless value', 1_410_000, Number.POSITIVE_INFINITY],
    ['a sum that is not a number', Number.NaN, 5],
  ])('is zero for %s', (_, subtotal, value) => {
    expect(computeDiscount({ subtotal, kind: 'PERCENT', value })).toBe(0);
    expect(computeDiscount({ subtotal, kind: 'AMOUNT', value })).toBe(0);
  });

  it('rounds to whole sums', () => {
    // 333 333 × 2.5 % = 8 333.325
    expect(
      computeDiscount({ subtotal: 333_333, kind: 'PERCENT', value: 2.5 }),
    ).toBe(8_333);
    expect(
      computeDiscount({ subtotal: 333_333, kind: 'AMOUNT', value: 100.6 }),
    ).toBe(101);
  });
});
