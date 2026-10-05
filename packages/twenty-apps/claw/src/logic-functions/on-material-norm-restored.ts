import { defineLogicFunction } from 'twenty-sdk/define';

import { RESERVING_STATUSES } from 'src/constants/order-status-sets';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

const handler = async (): Promise<void> =>
  resyncOrdersHoldingMaterial(createRecalcClient(), RESERVING_STATUSES);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormRestored,
  name: 'on-material-norm-restored',
  description: 'Re-plans measured orders after a norm is restored',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.restored',
    batchMode: true,
  },
  handler,
});
