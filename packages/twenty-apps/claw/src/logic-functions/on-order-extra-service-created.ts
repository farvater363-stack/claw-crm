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
  universalIdentifier: IDS.logicFunction.onOrderExtraServiceCreated,
  name: 'on-order-extra-service-created',
  description: 'Prices a new extra service line and recalculates its order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderExtraService.created' },
  handler,
});
