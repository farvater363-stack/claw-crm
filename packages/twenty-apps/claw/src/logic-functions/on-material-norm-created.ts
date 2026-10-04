import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { RESERVING_STATUSES } from 'src/warehouse/plan-order-materials';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

const handler = async (): Promise<void> =>
  resyncOrdersHoldingMaterial(createRecalcClient(), RESERVING_STATUSES);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormCreated,
  name: 'on-material-norm-created',
  description:
    'Re-plans orders awaiting approval after a composition row is added, and names the row',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.created',
    batchMode: true,
  },
  handler,
});
