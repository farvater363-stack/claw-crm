import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onStockMovementDeleted,
  name: 'on-stock-movement-deleted',
  description: 'Recomputes stock after a movement is deleted',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'stockMovement.deleted',
    batchMode: true,
  },
  handler,
});
