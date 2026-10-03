import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onStockMovementRestored,
  name: 'on-stock-movement-restored',
  description: 'Recomputes stock after a deleted movement is restored',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'stockMovement.restored',
    batchMode: true,
  },
  handler,
});
