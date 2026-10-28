import { type CoreApiClient } from 'twenty-client-sdk/core';

// A payment left on a deleted order still counts in every sum of payments.
export const deletePaymentsOfOrder = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  await client.mutation({
    deleteOrderPayments: {
      __args: { filter: { orderId: { eq: orderId } } },
      id: true,
    },
  });
};

// «Удалить вместе с оплатами» removes the payments a moment before the order.
// ponytail: a minute's window, so a payment removed by hand in that minute
// comes back too; mark the payments with their order's delete if it matters.
const DELETED_WITH_ORDER_MS = 60_000;

export const deletedWithOrderSince = (orderDeletedAt: string): string =>
  new Date(Date.parse(orderDeletedAt) - DELETED_WITH_ORDER_MS).toISOString();

// Only the payments that left with the order come back: one removed by hand
// before that stays removed.
export const restorePaymentsOfOrder = async (
  client: CoreApiClient,
  orderId: string,
  orderDeletedAt: string | null | undefined,
): Promise<void> => {
  if (!orderDeletedAt) return;

  await client.mutation({
    restoreOrderPayments: {
      __args: {
        filter: {
          orderId: { eq: orderId },
          deletedAt: { gte: deletedWithOrderSince(orderDeletedAt) },
        },
      },
      id: true,
    },
  });
};
