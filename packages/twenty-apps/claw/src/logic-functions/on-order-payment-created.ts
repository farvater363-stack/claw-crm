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
import { measurerCashHolder } from 'src/payments/measurer-cash-holder';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<PaymentEventRecord>>,
): Promise<void> => {
  const client = createRecalcClient();
  const payment = payload.properties.after;

  const receivedById = await measurerCashHolder(
    client,
    {
      orderId: payment.orderId ?? null,
      method: payment.method ?? null,
      receivedById: payment.receivedById ?? null,
    },
    payload.workspaceMemberId,
  );

  await applyPaymentFix(
    client,
    payload.recordId,
    payment,
    receivedById === null ? {} : { receivedById },
  );

  if (payment.orderId) {
    await recalcOrder(client, payment.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentCreated,
  name: 'on-order-payment-created',
  description:
    "Names and dates a new payment, keeps the measurer's cash with them, and recalculates its order",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderPayment.created' },
  handler,
});
