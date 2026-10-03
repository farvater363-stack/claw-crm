import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onStockMovementCreated,
  name: 'on-stock-movement-created',
  description: 'Recomputes stock after a receipt, stocktake or correction',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'stockMovement.created',
    batchMode: true,
  },
  handler,
});
