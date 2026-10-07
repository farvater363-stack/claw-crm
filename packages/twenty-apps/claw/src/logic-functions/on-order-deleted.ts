import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

type DeletedOrder = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordDeleteEvent<DeletedOrder>>,
): Promise<void> => {
  const order = payload.properties.before;

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
  universalIdentifier: IDS.logicFunction.onOrderDeleted,
  name: 'on-order-deleted',
  description:
    "Recalculates the client's totals after one of their orders is deleted",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.deleted' },
  handler,
});
