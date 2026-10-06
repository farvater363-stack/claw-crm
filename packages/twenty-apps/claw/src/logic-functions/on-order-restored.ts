import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

type RestoredOrder = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordRestoreEvent<RestoredOrder>>,
): Promise<void> => {
  const order = payload.properties.after;

  if (!order?.clientId) return;

  // The same side twice: the client's totals change, the next call does not.
  const side = {
    clientId: order.clientId,
    status: order.status ?? null,
    cancelReason: order.cancelReason ?? null,
  };

  await syncOrderClient(createRecalcClient(), { before: side, after: side });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderRestored,
  name: 'on-order-restored',
  description:
    "Recalculates the client's totals after one of their orders is restored",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.restored' },
  handler,
});
