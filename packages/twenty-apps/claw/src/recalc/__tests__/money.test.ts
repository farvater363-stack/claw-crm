import { describe, expect, it } from 'vitest';

import { fromCurrency, toCurrency } from 'src/recalc/money';

describe('money', () => {
  it('converts micros to whole sums and back', () => {
    expect(fromCurrency({ amountMicros: 180_000_000_000 })).toBe(180_000);
    expect(fromCurrency({ amountMicros: '180000000000' })).toBe(180_000);
    expect(toCurrency(180_000)).toEqual({
      amountMicros: 180_000_000_000,
      currencyCode: 'UZS',
    });
  });

  it('keeps empty values empty', () => {
    expect(fromCurrency(null)).toBeNull();
    expect(fromCurrency({ amountMicros: null })).toBeNull();
    expect(toCurrency(null)).toBeNull();
  });

  it('reads an amount that is not a number as empty', () => {
    expect(fromCurrency({ amountMicros: 'много' })).toBeNull();
  });
});
