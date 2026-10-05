import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { loadRecalcInput } from 'src/recalc/load-recalc-input';

type Request = Record<string, { __args?: unknown }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
});

const uzs = (amount: number) => ({
  amountMicros: amount * 1_000_000,
  currencyCode: 'UZS',
});

const fakeClient = (payments: Record<string, unknown>[]) => {
  const queries: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        orders: page([{ id: 'order-1', status: 'MEASURED' }]),
        orderItems: page([]),
        orderExtraServices: page([]),
        designs: page([]),
        extraServices: page([]),
        orderPayments: page(payments),
      };
    },
  } as unknown as CoreApiClient;

  return { client, queries };
};

const NO_REFRESH = {
  refreshPriceItemIds: [],
  refreshPriceExtraServiceLineIds: [],
};

describe('loadRecalcInput', () => {
  it('sums the payments of this order only', async () => {
    const { client, queries } = fakeClient([
      { amount: uzs(500_000) },
      { amount: uzs(200_000) },
      { amount: null },
    ]);

    const input = await loadRecalcInput(client, 'order-1', NO_REFRESH);

    expect(input?.paymentsTotal).toBe(700_000);
    expect(queries[0].orderPayments.__args).toMatchObject({
      filter: { orderId: { eq: 'order-1' } },
    });
  });

  it('counts no payments as zero', async () => {
    const { client } = fakeClient([]);

    expect(
      (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.paymentsTotal,
    ).toBe(0);
  });

  it('counts an amount that is not a number as zero', async () => {
    const { client } = fakeClient([
      { amount: uzs(500_000) },
      { amount: { amountMicros: 'много', currencyCode: 'UZS' } },
      { amount: { currencyCode: 'UZS' } },
    ]);

    expect(
      (await loadRecalcInput(client, 'order-1', NO_REFRESH))?.paymentsTotal,
    ).toBe(500_000);
  });
});
