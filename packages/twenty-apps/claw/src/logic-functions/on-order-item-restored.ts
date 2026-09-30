import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordRestoreEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.after?.orderId;

  if (orderId) {
    await recalcOrder(new CoreApiClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderItemRestored,
  name: 'on-order-item-restored',
  description: 'Recalculates an order after one of its items is restored',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderItem.restored' },
  handler,
});
