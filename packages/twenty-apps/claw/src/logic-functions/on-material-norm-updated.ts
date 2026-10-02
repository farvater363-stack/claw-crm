import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormUpdated,
  name: 'on-material-norm-updated',
  description:
    'Renames a consumption norm after its material or amount changes',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.updated',
    updatedFields: ['materialId', 'quantityPerUnit'],
  },
  handler,
});
