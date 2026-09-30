import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordCreateEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const { orderId } = payload.properties.after;

  if (orderId) {
    await recalcOrder(createRecalcClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderItemCreated,
  name: 'on-order-item-created',
  description: 'Prices a new order item and recalculates its order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderItem.created' },
  handler,
});
