import { describe, expect, it } from 'vitest';

import {
  currentMonthInTashkent,
  formatMonthLabel,
  monthOf,
  shiftMonth,
} from 'src/payroll/payroll-month';

describe('payroll month helpers', () => {
  it('takes the month in Tashkent time', () => {
    // 2026-09-30 20:30 UTC is already 1 October in Tashkent (UTC+5).
    expect(currentMonthInTashkent(new Date('2026-09-30T20:30:00Z'))).toBe(
      '2026-10',
    );
  });

  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
  ])('shifts %s by %i to %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('labels the month in Russian', () => {
    expect(formatMonthLabel('2026-10')).toBe('Октябрь 2026');
  });

  it('reads the month of a date', () => {
    expect(monthOf('2026-10-15')).toBe('2026-10');
  });
});
