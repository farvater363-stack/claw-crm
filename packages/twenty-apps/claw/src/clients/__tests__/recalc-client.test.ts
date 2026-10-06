import { describe, expect, it } from 'vitest';

import { clientChanges } from 'src/clients/recalc-client';

const stored = {
  clientStatus: 'NEW',
  ordersCount: 0,
  totalSpent: 0,
  owes: 0,
  quoted: null,
  firstOrderAt: null,
  lastOrderAt: null,
  lastInstalledAt: null,
  refusalReason: null,
  source: null,
  district: null,
  addressLine: 'Чиланзар 5',
};

const installed = {
  status: 'INSTALLED',
  total: 3_000_000,
  balance: 0,
  createdAt: '2026-09-01T08:00:00.000Z',
  installedAt: '2026-09-20',
  cancelReason: null,
  source: 'OLX',
  district: 'CHILANZAR',
  addressLine: 'Чиланзар 9',
};

describe('clientChanges', () => {
  it('writes only what changed and fills empty contacts from the order', () => {
    expect(clientChanges(stored, [installed])).toEqual({
      clientStatus: 'BOUGHT',
      ordersCount: 1,
      firstOrderAt: '2026-09-01',
      lastOrderAt: '2026-09-01',
      lastInstalledAt: '2026-09-20',
      totalSpent: { amountMicros: 3_000_000_000_000, currencyCode: 'UZS' },
      source: 'OLX',
      district: 'CHILANZAR',
    });
  });

  it('writes nothing when the client is already up to date', () => {
    expect(
      clientChanges(
        {
          ...stored,
          clientStatus: 'BOUGHT',
          ordersCount: 1,
          totalSpent: 3_000_000,
          firstOrderAt: '2026-09-01',
          lastOrderAt: '2026-09-01',
          lastInstalledAt: '2026-09-20',
          source: 'OLX',
          district: 'CHILANZAR',
        },
        [installed],
      ),
    ).toEqual({});
  });

  it('clears the price once a client who was thinking buys', () => {
    expect(
      clientChanges(
        { ...stored, clientStatus: 'THINKING', quoted: 3_000_000 },
        [{ ...installed, installedAt: null, status: 'PRODUCTION' }],
      ),
    ).toMatchObject({
      clientStatus: 'BOUGHT',
      quoted: { amountMicros: null, currencyCode: 'UZS' },
    });
  });
});
