import { beforeEach, describe, expect, it, vi } from 'vitest';

import onOrderDeleted from 'src/logic-functions/on-order-deleted';

const { mutation, query } = vi.hoisted(() => ({
  mutation: vi.fn(),
  query: vi.fn(),
}));

vi.mock('src/recalc/create-recalc-client', () => ({
  createRecalcClient: vi.fn(() => ({ mutation, query })),
}));
vi.mock('src/clients/sync-order-client', () => ({ syncOrderClient: vi.fn() }));

const uzs = (amount: number) => ({ amountMicros: amount * 1_000_000 });

const liveMoney = (payments: number[], refunds: number[]) =>
  query.mockResolvedValue({
    orderPayments: {
      edges: payments.map((amount) => ({
        node: { amount: uzs(amount), method: 'CASH' },
      })),
    },
    moneyEntries: {
      edges: refunds.map((amount, index) => ({
        node: { id: `refund-${index}`, amount: uzs(amount) },
      })),
    },
  });

// The stored «Оплачено» is still the old one: the recalc of the removed
// payments has not run yet.
const deleteOrder = () =>
  onOrderDeleted.config.handler(
    {
      recordId: 'order-1',
      properties: {
        before: {
          clientId: null,
          status: 'PRODUCTION',
          cancelReason: null,
          refundEntryId: 'refund-current',
          paid: uzs(500_000),
        },
      },
    } as never,
    {} as never,
  );

const sent = () => mutation.mock.calls.map(([request]) => request);

describe('on-order-deleted', () => {
  beforeEach(() => {
    mutation.mockReset();
    query.mockReset();
  });

  it('brings back an order whose payments are still there', async () => {
    liveMoney([500_000], []);

    await deleteOrder();

    expect(sent()[0]).toHaveProperty('restoreOrders');
  });

  it('deletes an order removed together with its payments, and its refunds', async () => {
    liveMoney([], [200_000]);

    await deleteOrder();

    expect(sent().some((request) => 'restoreOrders' in request)).toBe(false);
    expect(sent()).toContainEqual({
      deleteMoneyEntries: {
        __args: {
          filter: { orderId: { eq: 'order-1' }, kind: { eq: 'REFUND' } },
        },
        id: true,
      },
    });
  });

  it('deletes an order whose money all went back already', async () => {
    liveMoney([500_000], [500_000]);

    await deleteOrder();

    expect(sent().some((request) => 'restoreOrders' in request)).toBe(false);
  });
});
