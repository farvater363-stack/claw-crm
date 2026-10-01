import { describe, expect, it } from 'vitest';

import { computeItemAreaSquareMeters } from 'src/pricing/compute-item-area';
import {
  computeMasterBasePay,
  computeMasterPay,
} from 'src/pricing/compute-master-pay';
import {
  addDays,
  computeDaysLate,
  readyAtOnStatusChange,
  todayInTashkent,
} from 'src/pricing/dates';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';
import {
  type PriceListEntry,
  resolvePriceListEntry,
} from 'src/pricing/resolve-price-list-entry';

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

describe('computeMasterPay', () => {
  it('pays area times rate when on time', () => {
    expect(
      computeMasterPay({
        areaSquareMeters: 10,
        ratePerSquareMeter: 10_000,
        penaltyPercentPerDay: 4,
        daysLate: 0,
      }),
    ).toBe(100_000);
  });

  it('removes 4% per late day', () => {
    expect(
      computeMasterPay({
        areaSquareMeters: 10,
        ratePerSquareMeter: 10_000,
        penaltyPercentPerDay: 4,
        daysLate: 3,
      }),
    ).toBe(88_000);
  });

  it('never goes below zero', () => {
    expect(
      computeMasterPay({
        areaSquareMeters: 10,
        ratePerSquareMeter: 10_000,
        penaltyPercentPerDay: 4,
        daysLate: 25,
      }),
    ).toBe(0);
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

describe('resolvePriceListEntry', () => {
  const entry = (overrides: Partial<PriceListEntry>): PriceListEntry => ({
    designId: null,
    metal: 'ROD',
    metalSize: null,
    pricePerSquareMeter: 180_000,
    costPerSquareMeter: 90_000,
    ...overrides,
  });

  it('prefers the entry for the exact design', () => {
    const generic = entry({});
    const specific = entry({
      designId: 'design-1',
      pricePerSquareMeter: 260_000,
    });

    expect(
      resolvePriceListEntry([generic, specific], {
        designId: 'design-1',
        metal: 'ROD',
        metalSize: 'SIZE_10',
      }),
    ).toBe(specific);
  });

  it('falls back to the metal-only entry', () => {
    const generic = entry({});

    expect(
      resolvePriceListEntry([generic], {
        designId: 'design-2',
        metal: 'ROD',
        metalSize: null,
      }),
    ).toBe(generic);
  });

  it('never matches another metal or another design', () => {
    expect(
      resolvePriceListEntry(
        [entry({ metal: 'PROFILE' }), entry({ designId: 'design-1' })],
        { designId: 'design-2', metal: 'ROD', metalSize: null },
      ),
    ).toBeNull();
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
    ['READY', 'QUALITY_CHECK', null, today],
    ['INSTALLED', 'PRODUCTION', null, today],
    ['CLOSED', 'PRODUCTION', null, today],
    ['INSTALLED', null, null, today],
    ['INSTALLED', 'READY', null, null],
    ['CLOSED', 'INSTALLED', null, null],
    ['INSTALLED', 'CLOSED', null, null],
    ['READY', 'PRODUCTION', '2026-09-20', null],
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

describe('computeMasterBasePay', () => {
  it('is area times rate, rounded like the pay', () => {
    expect(
      computeMasterBasePay({
        areaSquareMeters: 3.84,
        ratePerSquareMeter: 10_000,
      }),
    ).toBe(38_400);
  });
});
