import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { RESERVING_STATUSES } from 'src/warehouse/plan-order-materials';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

const handler = async (): Promise<void> =>
  resyncOrdersHoldingMaterial(createRecalcClient(), RESERVING_STATUSES);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormUpdated,
  name: 'on-material-norm-updated',
  description:
    'Renames a consumption norm after its material or amount changes',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.updated',
    updatedFields: [
      'materialId',
      'priceListItemId',
      'extraServiceId',
      'quantityPerUnit',
    ],
    batchMode: true,
  },
  handler,
});
