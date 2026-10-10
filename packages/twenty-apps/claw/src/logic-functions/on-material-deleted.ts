import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordDeleteEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { deleteNormsOfMaterial } from 'src/stock/follow-material';

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordDeleteEvent<object>>,
): Promise<void> =>
  deleteNormsOfMaterial(createRecalcClient(), payload.recordId);

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialDeleted,
  name: 'on-material-deleted',
  description: 'Removes a deleted material from every composition',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'material.deleted' },
  handler,
});
