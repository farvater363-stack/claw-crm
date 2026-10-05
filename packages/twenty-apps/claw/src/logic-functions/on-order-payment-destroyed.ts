import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDestroyEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordDestroyEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.before?.orderId;

  if (orderId) {
    await recalcOrder(createRecalcClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentDestroyed,
  name: 'on-order-payment-destroyed',
  description: 'Recalculates an order after one of its payments is destroyed',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderPayment.destroyed' },
  handler,
});
