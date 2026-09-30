import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDestroyEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordDestroyEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.before?.orderId;

  if (orderId) {
    await recalcOrder(new CoreApiClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderExtraServiceDestroyed,
  name: 'on-order-extra-service-destroyed',
  description: 'Recalculates an order after one of its extra service lines is destroyed',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderExtraService.destroyed' },
  handler,
});
