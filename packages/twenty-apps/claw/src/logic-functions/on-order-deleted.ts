import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import {
  cancelInsteadOfDelete,
  deleteRefundsOfOrder,
  loadOrderMoney,
  netPaid,
  refundEntryIdOf,
} from 'src/orders/paid-money-on-cancel';
import { deletePaymentsOfOrder } from 'src/payments/follow-order';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

type DeletedOrder = {
  clientId: string | null;
  status: string | null;
  cancelReason: string | null;
  refundEntryId: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordDeleteEvent<DeletedOrder>>,
): Promise<void> => {
  const order = payload.properties.before;
  const client = createRecalcClient();

  // Twenty's own delete cannot be stopped or asked about: the order comes
  // back cancelled and its money question waits on «Сегодня». The payments
  // are read again rather than the stored «Оплачено»: «Удалить вместе с
  // оплатами» removes them just before, and their recalc may not have run.
  const { payments, refunds } = await loadOrderMoney(client, payload.recordId);
  const paid = netPaid(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
    refunds,
    refundEntryIdOf({
      id: payload.recordId,
      refundEntryId: order?.refundEntryId ?? null,
    }),
  );

  if (paid > 0) {
    await cancelInsteadOfDelete(
      client,
      payload.recordId,
      order?.status ?? null,
    );

    return;
  }

  await deletePaymentsOfOrder(client, payload.recordId);
  await deleteRefundsOfOrder(client, payload.recordId);

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
    "Brings back a deleted order the client paid for as cancelled; otherwise deletes its payments and refunds and recalculates its client's totals",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.deleted' },
  handler,
});
