import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { followPaymentsOfRefundedOrder } from 'src/orders/paid-money-on-cancel';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordDeleteEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.before?.orderId;

  if (orderId) {
    const client = createRecalcClient();

    await recalcOrder(client, orderId);
    await followPaymentsOfRefundedOrder(client, orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentDeleted,
  name: 'on-order-payment-deleted',
  description: 'Recalculates an order after one of its payments is deleted',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderPayment.deleted' },
  handler,
});
