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
    ObjectRecordDeleteEvent<{ kind: string | null; orderId: string | null }>
  >,
): Promise<void> => {
  const entry = payload.properties.before;

  if (entry?.kind === 'REFUND' && entry.orderId) {
    await recalcOrder(createRecalcClient(), entry.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onRefundDeleted,
  name: 'on-refund-deleted',
  description: 'Recalculates the order of a refund deleted in «Деньги»',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'moneyEntry.deleted' },
  handler,
});
