import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  applyPaymentFix,
  type PaymentEventRecord,
} from 'src/payments/apply-payment-fix';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<PaymentEventRecord>>,
): Promise<void> => {
  const client = createRecalcClient();
  const { before, after } = payload.properties;

  await applyPaymentFix(client, payload.recordId, after);

  if (after.orderId) {
    await recalcOrder(client, after.orderId);
  }

  if (before.orderId && before.orderId !== after.orderId) {
    await recalcOrder(client, before.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentUpdated,
  name: 'on-order-payment-updated',
  description:
    'Renames a changed payment and recalculates its order, and the order it was moved from',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'orderPayment.updated',
    // `name` is left out: the rename this function writes must not start it again.
    // `deletedAt` is in: an upsert that brings a deleted payment back arrives
    // as an update, not as a restore.
    updatedFields: ['amount', 'method', 'paidOn', 'orderId', 'deletedAt'],
  },
  handler,
});
