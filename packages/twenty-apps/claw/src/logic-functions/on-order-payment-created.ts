import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import {
  applyPaymentFix,
  type PaymentEventRecord,
} from 'src/payments/apply-payment-fix';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<PaymentEventRecord>>,
): Promise<void> => {
  const client = createRecalcClient();
  const payment = payload.properties.after;

  await applyPaymentFix(client, payload.recordId, payment);

  if (payment.orderId) {
    await recalcOrder(client, payment.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentCreated,
  name: 'on-order-payment-created',
  description: 'Names and dates a new payment and recalculates its order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderPayment.created' },
  handler,
});
