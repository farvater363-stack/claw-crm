import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { restorePaymentsOfOrder } from 'src/payments/follow-order';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

type RestoredOrder = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
  deletedAt: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordRestoreEvent<RestoredOrder>>,
): Promise<void> => {
  const order = payload.properties.after;
  const client = createRecalcClient();

  await restorePaymentsOfOrder(
    client,
    payload.recordId,
    payload.properties.before?.deletedAt,
  );

  if (!order?.clientId) return;

  // The same side twice: the client's totals change, the next call does not.
  const side = {
    clientId: order.clientId,
    status: order.status ?? null,
    cancelReason: order.cancelReason ?? null,
  };

  await syncOrderClient(client, { before: side, after: side });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderRestored,
  name: 'on-order-restored',
  description:
    "Restores the payments of a restored order and recalculates its client's totals",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.restored' },
  handler,
});
