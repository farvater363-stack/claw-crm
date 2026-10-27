import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const PRICE_KEY_FIELDS = ['extraServiceId'];

// What the recalc writes on the line, and the author stamp every write
// changes. A price typed by hand changes the line's total, so that run is
// never a no-op.
const RECALC_PRICE_FIELDS = [
  'name',
  'price',
  'cost',
  'lineTotal',
  'lineCost',
  'updatedBy',
];

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
      refreshPriceExtraServiceLineIds: shouldRefreshPrice
        ? [payload.recordId]
        : [],
      stopIfUnchanged: updatedFields.every((field) =>
        RECALC_PRICE_FIELDS.includes(field),
      ),
    });
  }

  if (before.orderId && before.orderId !== after.orderId) {
    await recalcOrder(client, before.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderExtraServiceUpdated,
  name: 'on-order-extra-service-updated',
  description:
    'Recalculates an order when one of its extra service lines changes',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'orderExtraService.updated',
    // An upsert that brings a deleted line back arrives as an update.
    updatedFields: [
      'extraServiceId',
      'quantity',
      'price',
      'cost',
      'orderId',
      'deletedAt',
    ],
  },
  handler,
});
