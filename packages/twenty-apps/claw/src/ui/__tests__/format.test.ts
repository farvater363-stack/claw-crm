import { describe, expect, it } from 'vitest';

import {
  formatDayMonth,
  formatMoney,
  formatQuantity,
  formatWhole,
  groupThousands,
} from 'src/ui/format';

// ru-RU groups thousands with a no-break space; compare with plain spaces.
const plain = (value: string) => value.replace(/\s/g, ' ');

describe('format', () => {
  it('shows money with thousands groups, no decimals and the currency', () => {
    expect(plain(formatMoney(1234567.4))).toBe('1,234,567 сум');
    expect(plain(formatMoney(0))).toBe('0 сум');
  });

  it('shows a quantity with a comma, no trailing zeros and its unit', () => {
    expect(plain(formatQuantity(5.5, 'м'))).toBe('5,5 м');
    expect(plain(formatQuantity(12, 'м²'))).toBe('12 м²');
    expect(plain(formatQuantity(0.256, 'л'))).toBe('0,26 л');
  });

  it('shows a date as day and month in Russian', () => {
    expect(formatDayMonth('2026-10-03')).toBe('3 октября');
  });
});

describe('groupThousands', () => {
  it('groups a typed sum and leaves anything else as typed', () => {
    expect(groupThousands('1250000')).toBe('1,250,000');
    expect(groupThousands('1,250,000')).toBe('1,250,000');
    expect(groupThousands('12,5')).toBe('12,5');
    expect(groupThousands('1,2500')).toBe('1,2500');
    expect(groupThousands('1 250 000')).toBe('1,250,000');
    expect(groupThousands('999')).toBe('999');
    expect(groupThousands('')).toBe('');
    expect(groupThousands('12.5')).toBe('12.5');
    expect(groupThousands('12a')).toBe('12a');
  });
});

describe('formatWhole', () => {
  it('groups thousands and drops the fraction, without a unit', () => {
    expect(plain(formatWhole(1_410_000))).toBe('1,410,000');
    expect(plain(formatWhole(57_600.4))).toBe('57,600');
  });
});
