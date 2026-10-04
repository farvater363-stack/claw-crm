import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialUpdated,
  name: 'on-material-updated',
  description:
    'Recomputes stock when a material setting changes, and renames its norms and movements',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'material.updated',
    // Only inputs: the recalc writes the computed fields and must not retrigger itself.
    updatedFields: ['name', 'unit', 'minimumStock'],
    batchMode: true,
  },
  handler,
});
