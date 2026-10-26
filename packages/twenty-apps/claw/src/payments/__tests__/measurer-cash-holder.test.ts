import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { measurerCashHolder } from 'src/payments/measurer-cash-holder';

type Request = Record<string, { __args?: unknown }>;

const fakeClient = ({
  measurerId = 'member-measurer',
  masters = [{ id: 'worker-measurer' }] as { id: string }[],
} = {}) => {
  const queries: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        orders: { edges: [{ node: { measurerId } }] },
        masters: { edges: masters.map((node) => ({ node })) },
      };
    },
  } as unknown as CoreApiClient;

  return { client, queries };
};

const CASH_PAYMENT = {
  orderId: 'order-1',
  method: 'CASH',
  receivedById: null,
};

describe('measurerCashHolder', () => {
  it("gives the order's measurer the cash they took", async () => {
    const { client, queries } = fakeClient();

    expect(
      await measurerCashHolder(client, CASH_PAYMENT, 'member-measurer'),
    ).toBe('worker-measurer');
    expect(queries[1].masters.__args).toMatchObject({
      filter: { loginId: { eq: 'member-measurer' } },
    });
  });

  it('leaves it empty when the measurer has no worker', async () => {
    const { client } = fakeClient({ masters: [] });

    expect(
      await measurerCashHolder(client, CASH_PAYMENT, 'member-measurer'),
    ).toBeNull();
  });

  it('leaves a payment somebody other than the measurer added', async () => {
    const { client } = fakeClient();

    expect(
      await measurerCashHolder(client, CASH_PAYMENT, 'member-manager'),
    ).toBeNull();
  });

  it('leaves a card or a transfer, which goes straight to the business', async () => {
    const { client, queries } = fakeClient();

    expect(
      await measurerCashHolder(
        client,
        { ...CASH_PAYMENT, method: 'CARD' },
        'member-measurer',
      ),
    ).toBeNull();
    expect(queries).toHaveLength(0);
  });

  it('keeps who was already chosen', async () => {
    const { client } = fakeClient();

    expect(
      await measurerCashHolder(
        client,
        { ...CASH_PAYMENT, receivedById: 'worker-other' },
        'member-measurer',
      ),
    ).toBeNull();
  });

  it('leaves a payment made by the application itself', async () => {
    const { client } = fakeClient();

    expect(
      await measurerCashHolder(client, CASH_PAYMENT, undefined),
    ).toBeNull();
  });
});
