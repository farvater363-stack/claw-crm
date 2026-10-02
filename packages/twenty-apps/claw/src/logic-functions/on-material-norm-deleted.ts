import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncReservingOrders } from 'src/warehouse/resync-reserving-orders';

const handler = async (): Promise<void> =>
  resyncReservingOrders(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormDeleted,
  name: 'on-material-norm-deleted',
  description: 'Re-plans orders awaiting approval after a norm is deleted',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.deleted',
    batchMode: true,
  },
  handler,
});
