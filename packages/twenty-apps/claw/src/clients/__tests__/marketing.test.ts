import { describe, expect, it } from 'vitest';

import {
  type MarketingClient,
  type MarketingOrder,
} from 'src/clients/load-clients';
import { clientTotals, periodStart, sourceRows } from 'src/clients/marketing';

const TODAY = '2026-10-06';

const order = (overrides: Partial<MarketingOrder>): MarketingOrder => ({
  source: 'INSTAGRAM',
  status: 'NEW',
  createdOn: '2026-10-01',
  measuredOn: null,
  total: 3_000_000,
  cancelReason: null,
  ...overrides,
});

describe('periodStart', () => {
  it.each([
    ['month', '2026-10-01'],
    ['quarter', '2026-08-01'],
    ['year', '2025-11-01'],
    ['all', null],
  ] as const)('starts «%s» on %s', (period, start) => {
    expect(periodStart(period, TODAY)).toBe(start);
  });
});

describe('sourceRows', () => {
  it('follows each source from lead to sale and names its commonest refusal', () => {
    const [instagram] = sourceRows(
      [
        order({ status: 'INSTALLED', total: 4_000_000 }),
        order({ status: 'PRODUCTION', total: 2_000_000 }),
        order({ status: 'MEASURED', measuredOn: '2026-10-02' }),
        order({ status: 'CANCELLED', cancelReason: 'TOO_EXPENSIVE' }),
      ],
      'month',
      TODAY,
    );

    expect(instagram).toEqual({
      source: 'INSTAGRAM',
      label: 'Instagram',
      leads: 4,
      measured: 3,
      sold: 2,
      conversionPercent: 50,
      revenue: 6_000_000,
      averageOrder: 3_000_000,
      topRefusal: 'Дорого',
    });
  });

  it('leaves out orders before the period and sources with none', () => {
    const rows = sourceRows(
      [
        order({ source: 'OLX', createdOn: '2026-09-30' }),
        order({ source: null }),
      ],
      'month',
      TODAY,
    );

    expect(rows.map((row) => row.label)).toEqual(['Не указан']);
  });
});

describe('clientTotals', () => {
  const buyer = (
    id: string,
    overrides: Partial<MarketingClient>,
  ): MarketingClient => ({
    id,
    name: id,
    clientStatus: 'BOUGHT',
    totalSpent: 1_000_000,
    referredById: null,
    ...overrides,
  });

  it('counts buyers, repeat buyers and who brings friends', () => {
    const totals = clientTotals([
      buyer('aziza', { clientStatus: 'REPEAT', totalSpent: 6_000_000 }),
      buyer('bobur', { referredById: 'aziza' }),
      buyer('dilnoza', {
        clientStatus: 'REFUSED',
        totalSpent: 0,
        referredById: 'aziza',
      }),
    ]);

    expect(totals.buyers).toBe(2);
    expect(totals.repeat).toBe(1);
    expect(totals.topClients.map(({ id }) => id)).toEqual(['aziza', 'bobur']);
    expect(
      totals.topReferrers.map(({ client, count }) => [client.id, count]),
    ).toEqual([['aziza', 2]]);
  });
});
