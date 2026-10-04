import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { isInstalled } from 'src/constants/order-status-sets';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import {
  measuredAtOnStatusChange,
  readyAtOnStatusChange,
  todayInTashkent,
} from 'src/pricing/dates';
import { toStoredUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import { orderNameToRestore } from 'src/recalc/assign-order-number';
import { recalcOrder } from 'src/recalc/recalc-order';
import { isEnteringWrittenOff } from 'src/warehouse/plan-order-materials';

type UpdatedOrder = {
  status: string | null;
  installedAt: string | null;
  readyAt: string | null;
  measuredAt: string | null;
  name: string | null;
  number: number | null;
  clientPhone: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<UpdatedOrder>>,
): Promise<void> => {
  const client = createRecalcClient();
  const { before, after, updatedFields } = payload.properties;

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

  if (updatedFields.includes('clientPhone')) {
    const storedPhone = toStoredUzbekPhone(after.clientPhone ?? '');

    // Unparseable numbers stay as typed so nothing the manager entered is lost.
    if (storedPhone !== null && storedPhone !== after.clientPhone) {
      await client.mutation({
        updateOrder: {
          __args: { id: payload.recordId, data: { clientPhone: storedPhone } },
          id: true,
        },
      });
    }
  }

  const statusChanged = updatedFields.includes('status');

  const installedAt =
    statusChanged &&
    isInstalled(after.status ?? null) &&
    (after.installedAt ?? null) === null
      ? todayInTashkent()
      : null;

  const readyAt = statusChanged
    ? readyAtOnStatusChange({
        status: after.status ?? null,
        previousStatus: before.status ?? null,
        readyAt: after.readyAt ?? null,
        today: todayInTashkent(),
      })
    : null;

  const measuredAt = statusChanged
    ? measuredAtOnStatusChange({
        status: after.status ?? null,
        measuredAt: after.measuredAt ?? null,
        now: new Date(),
      })
    : null;

  // One mutation, so INSTALLED does not fire the trigger twice.
  const stamps: Record<string, unknown> = {
    ...(installedAt !== null && { installedAt }),
    ...(readyAt !== null && { readyAt }),
    ...(measuredAt !== null && { measuredAt }),
  };

  if (Object.keys(stamps).length > 0) {
    await client.mutation({
      updateOrder: {
        __args: { id: payload.recordId, data: stamps },
        id: true,
      },
    });
  }

  await recalcOrder(client, payload.recordId, {
    entersWrittenOff:
      statusChanged &&
      isEnteringWrittenOff({
        status: after.status ?? null,
        previousStatus: before.status ?? null,
      }),
  });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderUpdated,
  name: 'on-order-updated',
  description:
    'Restores an emptied order name, normalizes the client phone, sets the installation date and recalculates the order',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'order.updated',
    updatedFields: [
      'name',
      'clientPhone',
      'status',
      'prepayment',
      'discountKind',
      'discountValue',
      'productionStartDate',
      'installationDeadline',
      'installedAt',
      'readyAt',
      'masterId',
      'masterBonus',
      'areaSquareMeters',
      'total',
      'costTotal',
    ],
  },
  handler,
});
