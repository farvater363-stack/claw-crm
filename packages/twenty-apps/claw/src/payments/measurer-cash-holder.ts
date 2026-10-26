import { type CoreApiClient } from 'twenty-client-sdk/core';

import { findWorkerIdByLogin } from 'src/recalc/find-worker-by-login';

// Cash the order's замерщик takes stays with them until it is handed over.
// The замерщик cannot read workers, so Новый замер leaves «Принял» empty and this fills it.
export const measurerCashHolder = async (
  client: CoreApiClient,
  payment: {
    orderId: string | null;
    method: string | null;
    receivedById: string | null;
  },
  workspaceMemberId: string | undefined,
): Promise<string | null> => {
  if (
    !payment.orderId ||
    !workspaceMemberId ||
    payment.receivedById ||
    (payment.method ?? 'CASH') !== 'CASH'
  ) {
    return null;
  }

  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: payment.orderId } }, first: 1 },
      edges: { node: { measurerId: true } },
    },
  });

  if (orders?.edges[0]?.node?.measurerId !== workspaceMemberId) {
    return null;
  }

  return findWorkerIdByLogin(client, workspaceMemberId);
};
