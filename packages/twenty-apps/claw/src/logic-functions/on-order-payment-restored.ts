import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordRestoreEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.after?.orderId;

  if (orderId) {
    await recalcOrder(createRecalcClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderPaymentRestored,
  name: 'on-order-payment-restored',
  description: 'Recalculates an order after one of its payments is restored',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderPayment.restored' },
  handler,
});
