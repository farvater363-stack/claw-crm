import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialCreated,
  name: 'on-material-created',
  description: 'Computes stock levels for a new material',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: { eventName: 'material.created' },
  handler,
});
