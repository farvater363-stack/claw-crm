import { describe, expect, it } from 'vitest';

import {
  formatOrderName,
  nextOrderNumber,
  orderNameToRestore,
} from 'src/recalc/assign-order-number';

describe('order names', () => {
  it('pads the number to four digits', () => {
    expect(formatOrderName(7)).toBe('№0007');
    expect(formatOrderName(12345)).toBe('№12345');
  });

  it('restores an emptied name on a numbered order only', () => {
    expect(orderNameToRestore({ name: '', number: 30 })).toBe('№0030');
    expect(orderNameToRestore({ name: '  ', number: 30 })).toBe('№0030');
    expect(orderNameToRestore({ name: null, number: 30 })).toBe('№0030');
    expect(orderNameToRestore({ name: 'Срочный', number: 30 })).toBeNull();
    expect(orderNameToRestore({ name: '', number: null })).toBeNull();
  });

  it('numbers new orders from 1001, after the imported ones', () => {
    expect(nextOrderNumber(null)).toBe(1001);
    expect(nextOrderNumber(35)).toBe(1001);
    expect(nextOrderNumber(1001)).toBe(1002);
  });
});
