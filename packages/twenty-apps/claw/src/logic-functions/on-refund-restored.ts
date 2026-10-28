import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordRestoreEvent<{ kind: string | null; orderId: string | null }>
  >,
): Promise<void> => {
  const entry = payload.properties.after;

  if (entry?.kind === 'REFUND' && entry.orderId) {
    await recalcOrder(createRecalcClient(), entry.orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onRefundRestored,
  name: 'on-refund-restored',
  description: 'Recalculates the order of a refund restored in «Деньги»',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'moneyEntry.restored' },
  handler,
});
