import { type CoreApiClient } from 'twenty-client-sdk/core';

import { planCallBackOnOrderChange } from 'src/clients/client-summary';
import {
  loadCallBack,
  recalcClient,
  saveCallBack,
} from 'src/clients/recalc-client';
import { todayInTashkent } from 'src/pricing/dates';

type OrderSide = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
};

// After any change of an order: the totals of its client (and of the client
// it was moved away from), then the client's next call for the order's step.
export const syncOrderClient = async (
  client: CoreApiClient,
  { before, after }: { before: OrderSide | null; after: OrderSide | null },
): Promise<void> => {
  const clientIds = new Set(
    [before?.clientId, after?.clientId].filter(
      (id): id is string => typeof id === 'string' && id !== '',
    ),
  );

  for (const clientId of clientIds) {
    await recalcClient(client, clientId);
  }

  if (after === null || after.clientId === null) return;

  const current = await loadCallBack(client, after.clientId);

  if (current === null) return;

  const callBack = planCallBackOnOrderChange({
    status: after.status,
    previousStatus: before?.status ?? null,
    cancelReason: after.cancelReason,
    previousCancelReason: before?.cancelReason ?? null,
    current,
    today: todayInTashkent(),
  });

  if (callBack !== null) {
    await saveCallBack(client, after.clientId, callBack);
  }
};
