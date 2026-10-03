import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const PRICE_KEY_FIELDS = ['designId'];

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordUpdateEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const client = createRecalcClient();
  const { before, after, updatedFields } = payload.properties;
  const shouldRefreshPrice = updatedFields.some((field) =>
    PRICE_KEY_FIELDS.includes(field),
  );

  if (after.orderId) {
    await recalcOrder(client, after.orderId, {
      refreshPriceItemIds: shouldRefreshPrice ? [payload.recordId] : [],
    });
  }

  if (before.orderId && before.orderId !== after.orderId) {
    await recalcOrder(client, before.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderItemUpdated,
  name: 'on-order-item-updated',
  description: 'Recalculates an order when one of its items changes',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'orderItem.updated',
    updatedFields: [
      'designId',
      'widthCm',
      'heightCm',
      'projectionCm',
      'quantity',
      'pricePerSquareMeter',
      'costPerSquareMeter',
      'orderId',
    ],
  },
  handler,
});
