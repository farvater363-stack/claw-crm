import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { deletePaymentsOfOrder } from 'src/payments/follow-order';
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
  const client = createRecalcClient();

  await deletePaymentsOfOrder(client, payload.recordId);

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
  universalIdentifier: IDS.logicFunction.onOrderDeleted,
  name: 'on-order-deleted',
  description:
    "Deletes the payments of a deleted order and recalculates its client's totals",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.deleted' },
  handler,
});
