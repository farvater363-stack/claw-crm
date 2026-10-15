import {
  defineLogicFunction,
  type DatabaseEventBatchPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncAfterNormChange } from 'src/warehouse/resync-after-norm-change';

const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordRestoreEvent>,
): Promise<void> => resyncAfterNormChange(createRecalcClient(), batch.events);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormRestored,
  name: 'on-material-norm-restored',
  description: 'Re-plans measured orders after a norm is restored',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.restored',
    batchMode: true,
  },
  handler,
});
