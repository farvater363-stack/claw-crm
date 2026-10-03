import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncReservingOrders } from 'src/warehouse/resync-reserving-orders';

const handler = async (): Promise<void> =>
  resyncReservingOrders(createRecalcClient());

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
