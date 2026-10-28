import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  cancelInsteadOfDelete,
  deleteRefundsOfOrder,
  followRefundAnswer,
  followRefundDeleted,
  followRefundEntry,
  netPaid,
  paidMoneyAnswerData,
  parseRefundAmount,
  refundEntryIdOf,
  refundOf,
  restoreRefundsOfOrder,
} from 'src/orders/paid-money-on-cancel';

const uzs = (amount: number) => ({ amountMicros: amount * 1_000_000 });

const fakeClient = (
  payments: { amount: number; method: string | null }[],
  refunds: { id: string; amount: number }[] = [],
) => {
  const mutation = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({
    orderPayments: {
      edges: payments.map(({ amount, method }) => ({
        node: { amount: uzs(amount), method },
      })),
    },
    moneyEntries: {
      edges: refunds.map(({ id, amount }) => ({
        node: { id, amount: uzs(amount) },
      })),
    },
  });

  return {
    client: { mutation, query } as unknown as CoreApiClient,
    mutation,
  };
};

const NO_ANSWER = { amount: null, wallet: null };

const ORDER = {
  id: 'order-1',
  name: '№12',
  status: 'CANCELLED',
  answer: 'REFUNDED',
  refundAmount: null,
  refundWallet: null,
  refundEntryId: null,
};

const createdEntry = (mutation: ReturnType<typeof vi.fn>) =>
  mutation.mock.calls[mutation.mock.calls.length - 1]?.[0].createMoneyEntry
    .__args;

describe('refundOf', () => {
  it('returns the whole sum from the wallet most of it came into', () => {
    expect(
      refundOf(
        [
          { amount: 300_000, method: 'CASH' },
          { amount: 500_000, method: 'CARD' },
          { amount: 100_000, method: null },
        ],
        0,
        NO_ANSWER,
      ),
    ).toEqual({ amount: 900_000, wallet: 'CARD' });
  });

  it('puts a transfer back from the account', () => {
    expect(
      refundOf([{ amount: 200_000, method: 'TRANSFER' }], 0, NO_ANSWER),
    ).toEqual({ amount: 200_000, wallet: 'ACCOUNT' });
  });

  it('has nothing to return when nothing was paid', () => {
    expect(refundOf([], 0, NO_ANSWER)).toBeNull();
  });

  it('takes the answered sum and wallet', () => {
    expect(
      refundOf([{ amount: 500_000, method: 'CASH' }], 0, {
        amount: 200_000,
        wallet: 'CARD',
      }),
    ).toEqual({ amount: 200_000, wallet: 'CARD' });
  });

  it('never returns more than was paid and not yet returned', () => {
    expect(
      refundOf([{ amount: 500_000, method: 'CASH' }], 100_000, {
        amount: 900_000,
        wallet: null,
      }),
    ).toEqual({ amount: 400_000, wallet: 'CASH' });
  });

  it('has nothing to return once an earlier refund took it all', () => {
    expect(
      refundOf([{ amount: 500_000, method: 'CASH' }], 500_000, NO_ANSWER),
    ).toBeNull();
  });
});

describe('netPaid', () => {
  const REFUNDS = [
    { id: 'order-1', amount: 300_000 },
    { id: 'refund-2', amount: 100_000 },
  ];

  it('counts off the refunds of earlier cancels, not the current one', () => {
    expect(netPaid(1_000_000, REFUNDS, 'refund-2')).toBe(700_000);
  });

  it('counts off every refund of a reopened order', () => {
    expect(netPaid(1_000_000, REFUNDS, 'refund-3')).toBe(600_000);
  });

  it('never goes below nothing', () => {
    expect(netPaid(0, REFUNDS, 'refund-3')).toBe(0);
  });
});

describe('refundEntryIdOf', () => {
  it('is the order id until the order is reopened', () => {
    expect(refundEntryIdOf({ id: 'order-1', refundEntryId: null })).toBe(
      'order-1',
    );
    expect(refundEntryIdOf({ id: 'order-1', refundEntryId: 'refund-2' })).toBe(
      'refund-2',
    );
  });
});

describe('parseRefundAmount', () => {
  it('reads a grouped whole sum', () => {
    expect(parseRefundAmount('300 000', 500_000)).toEqual({
      ok: true,
      amount: 300_000,
    });
  });

  it.each(['', '0', 'много'])('refuses %j', (typed) => {
    expect(parseRefundAmount(typed, 500_000).ok).toBe(false);
  });

  it('refuses more than was paid', () => {
    expect(parseRefundAmount('600 000', 500_000)).toMatchObject({ ok: false });
  });
});

describe('paidMoneyAnswerData', () => {
  it('sends the sum and the wallet with «Вернули»', () => {
    expect(
      paidMoneyAnswerData('REFUNDED', { amount: 100_000, wallet: 'CARD' }),
    ).toEqual({
      paidMoneyOnCancel: 'REFUNDED',
      refundAmount: { amountMicros: 100_000_000_000, currencyCode: 'UZS' },
      refundWallet: 'CARD',
    });
  });

  it('clears them with «Остаются»', () => {
    expect(
      paidMoneyAnswerData('KEPT', { amount: 100_000, wallet: 'CARD' }),
    ).toEqual({
      paidMoneyOnCancel: 'KEPT',
      refundAmount: { amountMicros: null, currencyCode: 'UZS' },
      refundWallet: null,
    });
  });
});

describe('followRefundAnswer', () => {
  it('removes the refund of an order that is not cancelled', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    await followRefundAnswer(client, { ...ORDER, status: 'PRODUCTION' });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0]?.[0]).toHaveProperty('deleteMoneyEntries');
  });

  it('keeps the day of a refund already written', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    vi.mocked(client.query)
      .mockResolvedValueOnce({
        orderPayments: {
          edges: [{ node: { amount: uzs(400_000), method: 'CASH' } }],
        },
        moneyEntries: { edges: [] },
      })
      .mockResolvedValueOnce({
        moneyEntries: { edges: [{ node: { date: '2026-10-03' } }] },
      });

    await followRefundAnswer(client, ORDER);

    expect(createdEntry(mutation).data.date).toBe('2026-10-03');
  });

  it('writes one refund under the order id when the money went back', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    await followRefundAnswer(client, ORDER);

    const created = createdEntry(mutation);

    expect(created.upsert).toBe(true);
    expect(created.data).toMatchObject({
      id: 'order-1',
      kind: 'REFUND',
      name: 'Возврат клиенту · №12',
      wallet: 'CASH',
      orderId: 'order-1',
      amount: { amountMicros: 400_000_000_000 },
    });
  });

  it('writes the answered sum and wallet, capped at what was paid', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    await followRefundAnswer(client, {
      ...ORDER,
      refundAmount: 900_000,
      refundWallet: 'CARD',
    });

    expect(createdEntry(mutation).data).toMatchObject({
      wallet: 'CARD',
      amount: { amountMicros: 400_000_000_000 },
    });
  });

  it('writes a second cancel under its own id, net of the first refund', async () => {
    const { client, mutation } = fakeClient(
      [
        { amount: 400_000, method: 'CASH' },
        { amount: 1_000_000, method: 'CARD' },
      ],
      [{ id: 'order-1', amount: 400_000 }],
    );

    await followRefundAnswer(client, { ...ORDER, refundEntryId: 'refund-2' });

    expect(mutation).not.toHaveBeenCalledWith(
      expect.objectContaining({ deleteMoneyEntries: expect.anything() }),
    );
    expect(createdEntry(mutation).data).toMatchObject({
      id: 'refund-2',
      wallet: 'CARD',
      amount: { amountMicros: 1_000_000_000_000 },
    });
  });

  it('removes the refund when the money stays', async () => {
    const { client, mutation } = fakeClient([]);

    await followRefundAnswer(client, { ...ORDER, answer: 'KEPT' });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith({
      deleteMoneyEntries: {
        __args: { filter: { id: { in: ['order-1'] } } },
        id: true,
      },
    });
  });

  it('touches only the refund of the current cancel when an answer is cleared', async () => {
    const { client, mutation } = fakeClient([]);

    await followRefundAnswer(client, {
      ...ORDER,
      status: 'PRODUCTION',
      answer: null,
      refundEntryId: 'refund-2',
    });

    expect(mutation).toHaveBeenCalledWith({
      deleteMoneyEntries: {
        __args: { filter: { id: { in: ['refund-2'] } } },
        id: true,
      },
    });
  });
});

describe('followRefundEntry', () => {
  const ENTRY = {
    id: 'order-1',
    orderId: 'order-1',
    amount: 300_000,
    wallet: 'CARD' as const,
  };

  const orderClient = (
    order: Record<string, unknown>,
    stored: { amount: number; wallet: string } = ENTRY,
    paid = 800_000,
  ) => {
    const mutation = vi.fn().mockResolvedValue({});
    const query = vi.fn().mockResolvedValue({
      orders: {
        edges: [
          {
            node: {
              name: '№12',
              status: 'CANCELLED',
              paidMoneyOnCancel: 'REFUNDED',
              refundAmount: uzs(500_000),
              refundWallet: 'CASH',
              refundEntryId: null,
              ...order,
            },
          },
        ],
      },
      moneyEntries: {
        edges: [
          {
            node: {
              id: 'order-1',
              amount: uzs(stored.amount),
              wallet: stored.wallet,
            },
          },
        ],
      },
      orderPayments: {
        edges: [{ node: { amount: uzs(paid), method: 'CASH' } }],
      },
    });

    return {
      client: { mutation, query } as unknown as CoreApiClient,
      mutation,
    };
  };

  const answeredWith = (mutation: ReturnType<typeof vi.fn>) =>
    mutation.mock.calls[0]?.[0].updateOrder.__args.data;

  it('carries a sum changed in «Деньги» into the answer of the current cancel', async () => {
    const { client, mutation } = orderClient({});

    await followRefundEntry(client, ENTRY);

    expect(answeredWith(mutation)).toEqual({
      refundAmount: { amountMicros: 300_000_000_000, currencyCode: 'UZS' },
      refundWallet: 'CARD',
    });
  });

  it('answers no more than the client paid', async () => {
    const { client, mutation } = orderClient({}, ENTRY, 200_000);

    await followRefundEntry(client, ENTRY);

    expect(answeredWith(mutation).refundAmount.amountMicros).toBe(
      200_000_000_000,
    );
  });

  it('leaves the answer when the refund is what the answer gives', async () => {
    const { client, mutation } = orderClient({
      refundAmount: uzs(300_000),
      refundWallet: 'CARD',
    });

    await followRefundEntry(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('keeps the answer when the app cut the refund to fewer payments', async () => {
    const { client, mutation } = orderClient(
      { refundAmount: uzs(500_000), refundWallet: 'CARD' },
      ENTRY,
      300_000,
    );

    await followRefundEntry(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('skips an event a later change has already overtaken', async () => {
    const { client, mutation } = orderClient(
      {},
      { amount: 60_000, wallet: 'CARD' },
    );

    await followRefundEntry(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('leaves the answer alone for a refund of an earlier cancel', async () => {
    const { client, mutation } = orderClient({ refundEntryId: 'refund-2' });

    await followRefundEntry(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('leaves an order no longer answered «Вернули»', async () => {
    const { client, mutation } = orderClient({ paidMoneyOnCancel: 'KEPT' });

    await followRefundEntry(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });
});

describe('followRefundDeleted', () => {
  const ENTRY = { id: 'order-1', orderId: 'order-1' };

  const deletedClient = (
    order: Record<string, unknown>,
    { paid = 800_000, stillThere = false } = {},
  ) => {
    const mutation = vi.fn().mockResolvedValue({});
    const query = vi.fn().mockResolvedValue({
      orders: {
        edges: [
          {
            node: {
              name: '№12',
              status: 'CANCELLED',
              paidMoneyOnCancel: 'REFUNDED',
              refundAmount: uzs(500_000),
              refundWallet: 'CASH',
              refundEntryId: null,
              ...order,
            },
          },
        ],
      },
      moneyEntries: {
        edges: stillThere
          ? [{ node: { id: 'order-1', amount: uzs(500_000) } }]
          : [],
      },
      orderPayments: {
        edges: [{ node: { amount: uzs(paid), method: 'CASH' } }],
      },
    });

    return {
      client: { mutation, query } as unknown as CoreApiClient,
      mutation,
    };
  };

  it('takes back the answer when the refund of the current cancel is removed by hand', async () => {
    const { client, mutation } = deletedClient({});

    await followRefundDeleted(client, ENTRY);

    expect(mutation.mock.calls[0]?.[0].updateOrder.__args.data).toEqual({
      paidMoneyOnCancel: null,
      refundAmount: { amountMicros: null, currencyCode: 'UZS' },
      refundWallet: null,
    });
  });

  it('keeps the answer when the app removed the refund for want of payments', async () => {
    const { client, mutation } = deletedClient({}, { paid: 0 });

    await followRefundDeleted(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('keeps the answer when the refund is already back', async () => {
    const { client, mutation } = deletedClient({}, { stillThere: true });

    await followRefundDeleted(client, ENTRY);

    expect(mutation).not.toHaveBeenCalled();
  });

  it('leaves a reopened order and a refund of an earlier cancel alone', async () => {
    for (const order of [
      { status: 'PRODUCTION' },
      { refundEntryId: 'refund-2' },
      { paidMoneyOnCancel: 'KEPT' },
    ]) {
      const { client, mutation } = deletedClient(order);

      await followRefundDeleted(client, ENTRY);

      expect(mutation).not.toHaveBeenCalled();
    }
  });
});

describe('refunds of a deleted order', () => {
  it('go with the order', async () => {
    const { client, mutation } = fakeClient([]);

    await deleteRefundsOfOrder(client, 'order-1');

    expect(mutation).toHaveBeenCalledWith({
      deleteMoneyEntries: {
        __args: {
          filter: { orderId: { eq: 'order-1' }, kind: { eq: 'REFUND' } },
        },
        id: true,
      },
    });
  });

  it('come back only if they left with it', async () => {
    const { client, mutation } = fakeClient([]);

    await restoreRefundsOfOrder(client, 'order-1', '2026-10-20T10:00:00Z');
    await restoreRefundsOfOrder(client, 'order-1', null);

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(
      mutation.mock.calls[0]?.[0].restoreMoneyEntries.__args.filter,
    ).toEqual({
      orderId: { eq: 'order-1' },
      kind: { eq: 'REFUND' },
      deletedAt: { gte: '2026-10-20T10:00:00Z' },
    });
  });
});

describe('cancelInsteadOfDelete', () => {
  it('brings the order back cancelled', async () => {
    const { client, mutation } = fakeClient([]);

    await cancelInsteadOfDelete(client, 'order-1', 'IN_PRODUCTION');

    expect(mutation).toHaveBeenCalledWith({
      restoreOrders: {
        __args: { filter: { id: { eq: 'order-1' } } },
        id: true,
      },
    });
    expect(mutation).toHaveBeenLastCalledWith({
      updateOrder: {
        __args: { id: 'order-1', data: { status: 'CANCELLED' } },
        id: true,
      },
    });
  });

  it('leaves an order that was already cancelled as it was', async () => {
    const { client, mutation } = fakeClient([]);

    await cancelInsteadOfDelete(client, 'order-1', 'CANCELLED');

    expect(mutation).toHaveBeenCalledTimes(1);
  });
});
