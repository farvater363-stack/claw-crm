import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordDeleteEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.before?.orderId;

  if (orderId) {
    await recalcOrder(createRecalcClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderExtraServiceDeleted,
  name: 'on-order-extra-service-deleted',
  description:
    'Recalculates an order after one of its extra service lines is deleted',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'orderExtraService.deleted' },
  handler,
});
