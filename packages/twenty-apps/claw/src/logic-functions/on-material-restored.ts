import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordRestoreEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { restoreNormsOfMaterial } from 'src/stock/follow-material';

type RestoredMaterial = { deletedAt: string | null };

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordRestoreEvent<RestoredMaterial>>,
): Promise<void> =>
  restoreNormsOfMaterial(
    createRecalcClient(),
    payload.recordId,
    payload.properties.before?.deletedAt,
  );

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onMaterialRestored,
  name: 'on-material-restored',
  description: 'Puts a restored material back into the compositions it left',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'material.restored' },
  handler,
});
