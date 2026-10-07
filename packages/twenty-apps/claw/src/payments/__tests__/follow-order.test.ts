import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  deletePaymentsOfOrder,
  restorePaymentsOfOrder,
} from 'src/payments/follow-order';

const fakeClient = () => {
  const mutation = vi.fn().mockResolvedValue({});

  return { client: { mutation } as unknown as CoreApiClient, mutation };
};

describe('payments follow their order', () => {
  it('deletes every payment of a deleted order', async () => {
    const { client, mutation } = fakeClient();

    await deletePaymentsOfOrder(client, 'order-1');

    expect(mutation).toHaveBeenCalledWith({
      deleteOrderPayments: {
        __args: { filter: { orderId: { eq: 'order-1' } } },
        id: true,
      },
    });
  });

  it('restores the payments deleted with the order, not ones removed before it', async () => {
    const { client, mutation } = fakeClient();

    await restorePaymentsOfOrder(client, 'order-1', '2026-10-05T16:12:00Z');

    expect(mutation).toHaveBeenCalledWith({
      restoreOrderPayments: {
        __args: {
          filter: {
            orderId: { eq: 'order-1' },
            deletedAt: { gte: '2026-10-05T16:12:00Z' },
          },
        },
        id: true,
      },
    });
  });

  it('restores nothing when the time the order was deleted is unknown', async () => {
    const { client, mutation } = fakeClient();

    await restorePaymentsOfOrder(client, 'order-1', null);

    expect(mutation).not.toHaveBeenCalled();
  });
});
