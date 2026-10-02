import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormCreated,
  name: 'on-material-norm-created',
  description: 'Names a new consumption norm',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: { eventName: 'materialNorm.created' },
  handler,
});
