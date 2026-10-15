import {
  defineLogicFunction,
  type DatabaseEventBatchPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncAfterNormChange } from 'src/warehouse/resync-after-norm-change';

const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordDeleteEvent>,
): Promise<void> => resyncAfterNormChange(createRecalcClient(), batch.events);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormDeleted,
  name: 'on-material-norm-deleted',
  description: 'Re-plans measured orders after a norm is deleted',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.deleted',
    batchMode: true,
  },
  handler,
});
