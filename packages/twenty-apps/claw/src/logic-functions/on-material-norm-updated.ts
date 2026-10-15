import {
  defineLogicFunction,
  type DatabaseEventBatchPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { changesNoCompositionField } from 'src/warehouse/changes-no-composition-field';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { resyncAfterNormChange } from 'src/warehouse/resync-after-norm-change';

const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordUpdateEvent>,
): Promise<void> => {
  const client = createRecalcClient();

  // The recalc renames the row after every edit; resyncing the orders again for that rename would only spend the request budget.
  if (changesNoCompositionField(batch.events)) {
    await recalcWarehouse(client);

    return;
  }

  await resyncAfterNormChange(client, batch.events);
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormUpdated,
  name: 'on-material-norm-updated',
  description:
    'Re-plans measured orders after a composition row changes, and restores a typed-over row name',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.updated',
    // `name` is watched so that a typed-over name is restored.
    updatedFields: [
      'name',
      'materialId',
      'designId',
      'extraServiceId',
      'orderId',
      'quantityPerUnit',
    ],
    batchMode: true,
  },
  handler,
});
