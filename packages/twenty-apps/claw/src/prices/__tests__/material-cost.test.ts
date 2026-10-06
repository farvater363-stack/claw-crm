import { describe, expect, it } from 'vitest';

import { computeMaterialCost } from 'src/prices/material-cost';

describe('computeMaterialCost', () => {
  it('adds up amount times price', () => {
    expect(
      computeMaterialCost([
        { quantity: 9.5, unitPrice: 9_000 },
        { quantity: 4.2, unitPrice: 14_000 },
        { quantity: 0.25, unitPrice: 60_000 },
        { quantity: 0.3, unitPrice: 32_000 },
      ]),
    ).toEqual({ cost: 168_900, isComplete: true });
  });

  it('says when a line has no purchase price', () => {
    expect(
      computeMaterialCost([
        { quantity: 2, unitPrice: 10_000 },
        { quantity: 1, unitPrice: null },
      ]),
    ).toEqual({ cost: 20_000, isComplete: false });
  });

  it('has no cost while nothing is priced', () => {
    expect(computeMaterialCost([{ quantity: 1, unitPrice: null }])).toEqual({
      cost: null,
      isComplete: false,
    });
    expect(computeMaterialCost([])).toEqual({ cost: null, isComplete: true });
  });
});
