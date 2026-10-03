import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { RESERVING_STATUSES } from 'src/warehouse/plan-order-materials';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

const handler = async (): Promise<void> =>
  resyncOrdersHoldingMaterial(createRecalcClient(), RESERVING_STATUSES);

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
