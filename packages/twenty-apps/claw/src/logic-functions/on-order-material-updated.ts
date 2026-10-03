import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const handler = async (
  payload: DatabaseEventPayload<
    ObjectRecordUpdateEvent<{ orderId: string | null }>
  >,
): Promise<void> => {
  const orderId = payload.properties.after?.orderId;

  if (orderId) {
    await recalcOrder(createRecalcClient(), orderId);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderMaterialUpdated,
  name: 'on-order-material-updated',
  description:
    'Books the difference when the actual consumption of an order changes',
  timeoutSeconds: 60,
  databaseEventTriggerSettings: {
    eventName: 'orderMaterial.updated',
    updatedFields: ['actualQuantity'],
  },
  handler,
});
