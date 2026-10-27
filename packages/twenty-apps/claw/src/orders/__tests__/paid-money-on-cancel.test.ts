import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  cancelInsteadOfDelete,
  followRefundAnswer,
  refundOf,
} from 'src/orders/paid-money-on-cancel';

const fakeClient = (payments: { amount: number; method: string | null }[]) => {
  const mutation = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({
    orderPayments: {
      edges: payments.map(({ amount, method }) => ({
        node: { amount: { amountMicros: amount * 1_000_000 }, method },
      })),
    },
  });

  return {
    client: { mutation, query } as unknown as CoreApiClient,
    mutation,
  };
};

describe('refundOf', () => {
  it('returns the whole sum from the wallet most of it came into', () => {
    expect(
      refundOf([
        { amount: 300_000, method: 'CASH' },
        { amount: 500_000, method: 'CARD' },
        { amount: 100_000, method: null },
      ]),
    ).toEqual({ amount: 900_000, wallet: 'CARD' });
  });

  it('puts a transfer back from the account', () => {
    expect(refundOf([{ amount: 200_000, method: 'TRANSFER' }])).toEqual({
      amount: 200_000,
      wallet: 'ACCOUNT',
    });
  });

  it('has nothing to return when nothing was paid', () => {
    expect(refundOf([])).toBeNull();
  });
});

describe('followRefundAnswer', () => {
  it('removes the refund of an order that is not cancelled', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    await followRefundAnswer(client, {
      id: 'order-1',
      name: '№12',
      status: 'PRODUCTION',
      answer: 'REFUNDED',
    });

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
          edges: [
            {
              node: {
                amount: { amountMicros: 400_000_000_000 },
                method: 'CASH',
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        moneyEntries: { edges: [{ node: { date: '2026-10-03' } }] },
      });

    await followRefundAnswer(client, {
      id: 'order-1',
      name: '№12',
      status: 'CANCELLED',
      answer: 'REFUNDED',
    });

    const created =
      mutation.mock.calls[mutation.mock.calls.length - 1]?.[0].createMoneyEntry
        .__args;

    expect(created.data.date).toBe('2026-10-03');
  });

  it('writes one refund under the order id when the money went back', async () => {
    const { client, mutation } = fakeClient([
      { amount: 400_000, method: 'CASH' },
    ]);

    await followRefundAnswer(client, {
      id: 'order-1',
      name: '№12',
      status: 'CANCELLED',
      answer: 'REFUNDED',
    });

    const created =
      mutation.mock.calls[mutation.mock.calls.length - 1]?.[0].createMoneyEntry
        .__args;

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

  it('removes the refund when the money stays', async () => {
    const { client, mutation } = fakeClient([]);

    await followRefundAnswer(client, {
      id: 'order-1',
      name: '№12',
      status: 'CANCELLED',
      answer: 'KEPT',
    });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith({
      deleteMoneyEntries: {
        __args: { filter: { id: { in: ['order-1'] } } },
        id: true,
      },
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
