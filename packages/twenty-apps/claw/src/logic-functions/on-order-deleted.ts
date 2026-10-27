import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { cancelInsteadOfDelete } from 'src/orders/paid-money-on-cancel';
import { deletePaymentsOfOrder } from 'src/payments/follow-order';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { fromCurrency } from 'src/recalc/money';

type DeletedOrder = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
  paid: { amountMicros?: number | string | null } | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordDeleteEvent<DeletedOrder>>,
): Promise<void> => {
  const order = payload.properties.before;
  const client = createRecalcClient();

  // Twenty's own delete cannot be stopped or asked about: the order comes
  // back cancelled and its money question waits on «Сегодня».
  if ((fromCurrency(order?.paid ?? null) ?? 0) > 0) {
    await cancelInsteadOfDelete(
      client,
      payload.recordId,
      order?.status ?? null,
    );

    return;
  }

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
    "Brings back a deleted order the client paid for as cancelled; otherwise deletes its payments and recalculates its client's totals",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.deleted' },
  handler,
});
