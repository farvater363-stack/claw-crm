import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { todayInTashkent } from 'src/pricing/dates';
import { orderNameToRestore } from 'src/recalc/assign-order-number';
import { recalcOrder } from 'src/recalc/recalc-order';

type UpdatedOrder = {
  status: string | null;
  installedAt: string | null;
  name: string | null;
  number: number | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<UpdatedOrder>>,
): Promise<void> => {
  const client = createRecalcClient();
  const { after, updatedFields } = payload.properties;

  const restoredName = orderNameToRestore({
    name: after.name ?? null,
    number: after.number ?? null,
  });

  if (restoredName !== null) {
    await client.mutation({
      updateOrder: {
        __args: { id: payload.recordId, data: { name: restoredName } },
        id: true,
      },
    });
  }

  if (
    updatedFields.includes('status') &&
    after.status === 'INSTALLED' &&
    (after.installedAt ?? null) === null
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
  description:
    'Restores an emptied order name, sets the installation date and recalculates the order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'order.updated',
    updatedFields: [
      'name',
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
