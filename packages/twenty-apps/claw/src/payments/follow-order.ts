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
          deletedAt: { gte: orderDeletedAt },
        },
      },
      id: true,
    },
  });
};
