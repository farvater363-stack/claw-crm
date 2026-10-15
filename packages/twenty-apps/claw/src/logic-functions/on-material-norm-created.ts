import {
  defineLogicFunction,
  type DatabaseEventBatchPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { resyncAfterNormChange } from 'src/warehouse/resync-after-norm-change';

const handler = async (
  batch: DatabaseEventBatchPayload<ObjectRecordCreateEvent>,
): Promise<void> => resyncAfterNormChange(createRecalcClient(), batch.events);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialNormCreated,
  name: 'on-material-norm-created',
  description:
    'Re-plans measured orders after a composition row is added, and names the row',
  timeoutSeconds: 120,
  databaseEventTriggerSettings: {
    eventName: 'materialNorm.created',
    batchMode: true,
  },
  handler,
});
