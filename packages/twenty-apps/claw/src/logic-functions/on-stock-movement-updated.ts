import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';

const handler = async (): Promise<void> =>
  recalcWarehouse(createRecalcClient());

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onStockMovementUpdated,
  name: 'on-stock-movement-updated',
  description: 'Recomputes stock after a movement is edited',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'stockMovement.updated',
    // The recalc's own quantity (stocktake) and date (when empty) writes cost one extra no-op run; both stay for user edits.
    updatedFields: [
      'kind',
      'materialId',
      'quantity',
      'countedQuantity',
      'unitPrice',
      'date',
    ],
    batchMode: true,
  },
  handler,
});
