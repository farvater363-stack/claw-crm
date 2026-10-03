import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncReservingOrders } from 'src/warehouse/resync-reserving-orders';

const handler = async (): Promise<void> =>
  resyncReservingOrders(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormRestored,
  name: 'on-material-norm-restored',
  description: 'Re-plans orders awaiting approval after a norm is restored',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.restored',
    batchMode: true,
  },
  handler,
});
