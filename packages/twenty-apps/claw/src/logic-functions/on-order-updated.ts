import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { todayInTashkent } from 'src/pricing/dates';
import { recalcOrder } from 'src/recalc/recalc-order';

type UpdatedOrder = { status: string | null; installedAt: string | null };

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<UpdatedOrder>>,
): Promise<void> => {
  const client = createRecalcClient();
  const { after, updatedFields } = payload.properties;

  if (
    updatedFields.includes('status') &&
    after.status === 'INSTALLED' &&
    after.installedAt === null
  ) {
    await client.mutation({
      updateOrder: {
        __args: {
          id: payload.recordId,
          data: { installedAt: todayInTashkent() },
        },
        id: true,
      },
    });
  }

  await recalcOrder(client, payload.recordId);
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderUpdated,
  name: 'on-order-updated',
  description: 'Sets the installation date and recalculates the order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'order.updated',
    updatedFields: [
      'status',
      'prepayment',
      'productionStartDate',
      'installationDeadline',
      'installedAt',
      'masterId',
      'masterBonus',
      'areaSquareMeters',
      'total',
      'costTotal',
    ],
  },
  handler,
});
