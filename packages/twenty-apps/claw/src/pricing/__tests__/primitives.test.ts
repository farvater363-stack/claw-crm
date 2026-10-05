import { describe, expect, it } from 'vitest';

import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import {
  addDays,
  computeDaysLate,
  measuredAtOnStatusChange,
  readyAtOnStatusChange,
  todayInTashkent,
} from 'src/pricing/dates';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';

describe('computeItemAreaSquareMeters', () => {
  it('adds the four sides of a convex grille', () => {
    expect(
      computeItemAreaSquareMeters({
        widthCm: 140,
        heightCm: 150,
        projectionCm: 30,
      }),
    ).toBe(3.84);
  });

  it('is width times height for a flat grille', () => {
    expect(
      computeItemAreaSquareMeters({
        widthCm: 140,
        heightCm: 150,
        projectionCm: 0,
      }),
    ).toBe(2.1);
  });
});

describe('dates', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-06-27', 7)).toBe('2026-07-04');
  });

  it('counts whole days late and never goes negative', () => {
    expect(
      computeDaysLate({ deadline: '2026-06-24', readyAt: '2026-06-27' }),
    ).toBe(3);
    expect(
      computeDaysLate({ deadline: '2026-06-24', readyAt: '2026-06-20' }),
    ).toBe(0);
    expect(
      computeDaysLate({ deadline: null, readyAt: '2026-06-20' }),
    ).toBeNull();
    expect(
      computeDaysLate({ deadline: '2026-06-24', readyAt: null }),
    ).toBeNull();
  });

  it('uses the Tashkent calendar day', () => {
    // 20:30 UTC is already the next day in Tashkent (UTC+5)
    expect(todayInTashkent(new Date('2026-06-24T20:30:00Z'))).toBe(
      '2026-06-25',
    );
  });
});

describe('normalizeUzbekPhone', () => {
  it('accepts the formats used in the Excel sheet and forms', () => {
    expect(normalizeUzbekPhone('998931112233')).toBe('931112233');
    expect(normalizeUzbekPhone('+998 (93) 111-22-33')).toBe('931112233');
    expect(normalizeUzbekPhone('93 111 22 33')).toBe('931112233');
  });

  it('rejects anything that is not an Uzbek number', () => {
    expect(normalizeUzbekPhone('12345')).toBeNull();
    expect(normalizeUzbekPhone('')).toBeNull();
  });
});

describe('toStoredUzbekPhone', () => {
  it.each([
    ['998997776655', '+998997776655'],
    ['+998 90 123 45 67', '+998901234567'],
    ['901234567', '+998901234567'],
    ['200000001', '+998200000001'],
    ['12345', null],
  ])('%s -> %s', (raw, expected) => {
    expect(toStoredUzbekPhone(raw)).toBe(expected);
  });
});

describe('readyAtOnStatusChange', () => {
  const today = '2026-10-01';

  it.each([
    ['QUALITY_CHECK', 'PRODUCTION', null, today],
    ['INSTALLED', 'PRODUCTION', null, today],
    ['INSTALLED', null, null, today],
    ['INSTALLED', 'QUALITY_CHECK', null, null],
    ['QUALITY_CHECK', 'INSTALLED', null, null],
    ['QUALITY_CHECK', 'PRODUCTION', '2026-09-20', null],
    ['PRODUCTION', 'QUALITY_CHECK', null, null],
    ['CANCELLED', 'PRODUCTION', null, null],
    [null, 'PRODUCTION', null, null],
  ] as const)(
    'status %s from %s with readyAt %s writes %s',
    (status, previousStatus, readyAt, expected) => {
      expect(
        readyAtOnStatusChange({ status, previousStatus, readyAt, today }),
      ).toBe(expected);
    },
  );
});

describe('measuredAtOnStatusChange', () => {
  const now = new Date('2026-10-05T09:30:00.000Z');

  it('stamps the moment an order is measured for the first time', () => {
    expect(
      measuredAtOnStatusChange({ status: 'MEASURED', measuredAt: null, now }),
    ).toBe('2026-10-05T09:30:00.000Z');
  });

  it('keeps the first moment when the status is corrected later', () => {
    expect(
      measuredAtOnStatusChange({
        status: 'MEASURED',
        measuredAt: '2026-10-01T05:00:00.000Z',
        now,
      }),
    ).toBeNull();
  });

  it.each(['NEW', 'MEASUREMENT_SCHEDULED', 'PRODUCTION', null])(
    'writes nothing for %s',
    (status) => {
      expect(
        measuredAtOnStatusChange({ status, measuredAt: null, now }),
      ).toBeNull();
    },
  );
});
