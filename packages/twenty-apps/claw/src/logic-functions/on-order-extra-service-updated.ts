import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { recalcOrder } from 'src/recalc/recalc-order';

const PRICE_KEY_FIELDS = ['extraServiceId'];

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordUpdateEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const client = new CoreApiClient();
  const { before, after, updatedFields } = payload.properties;
  const shouldRefreshPrice = updatedFields.some((field) =>
    PRICE_KEY_FIELDS.includes(field),
  );

  if (after.orderId) {
    await recalcOrder(client, after.orderId, {
      refreshPriceExtraServiceLineIds: shouldRefreshPrice ? [payload.recordId] : [],
    });
  }

  if (before.orderId && before.orderId !== after.orderId) {
    await recalcOrder(client, before.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderExtraServiceUpdated,
  name: 'on-order-extra-service-updated',
  description: 'Recalculates an order when one of its extra service lines changes',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'orderExtraService.updated',
    updatedFields: ['extraServiceId', 'quantity', 'price', 'cost', 'orderId'],
  },
  handler,
});
