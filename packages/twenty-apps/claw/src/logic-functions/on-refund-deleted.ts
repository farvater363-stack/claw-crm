import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { followRefundDeleted } from 'src/orders/paid-money-on-cancel';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordDeleteEvent<{ kind: string | null; orderId: string | null }>
  >,
): Promise<void> => {
  const entry = payload.properties.before;

  if (entry?.kind === 'REFUND' && entry.orderId) {
    const client = createRecalcClient();

    await recalcOrder(client, entry.orderId);
    await followRefundDeleted(client, {
      id: payload.recordId,
      orderId: entry.orderId,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onRefundDeleted,
  name: 'on-refund-deleted',
  description:
    'Recalculates the order of a refund deleted in «Деньги», and takes back the answer when it was the refund of the current cancel',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'moneyEntry.deleted' },
  handler,
});
