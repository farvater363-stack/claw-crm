import {
  defineLogicFunction,
  type DatabaseEventBatchPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { isNameOnlyChange } from 'src/warehouse/is-name-only-change';
import { RESERVING_STATUSES } from 'src/warehouse/plan-order-materials';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';

const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent>,
): Promise<void> => {
  const client = createRecalcClient();

  // The recalc renames the row after every edit; resyncing the orders again for that rename would only spend the request budget.
  if (isNameOnlyChange(batch.events)) {
    await recalcWarehouse(client);

    return;
  }

  await resyncOrdersHoldingMaterial(client, RESERVING_STATUSES);
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormUpdated,
  name: 'on-material-norm-updated',
  description:
    'Re-plans orders awaiting approval after a composition row changes, and restores a typed-over row name',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.updated',
    // `name` is watched so that a typed-over name is restored.
    updatedFields: [
      'name',
      'materialId',
      'designId',
      'extraServiceId',
      'quantityPerUnit',
    ],
    batchMode: true,
  },
  handler,
});
