import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import {
  deadlineOnStartChange,
  installedAtOnStatusChange,
  measuredAtOnStatusChange,
  productionStartOnStatusChange,
  readyAtOnStatusChange,
  todayInTashkent,
} from 'src/pricing/dates';
import { toStoredUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import { INSTALLATION_DAYS_AFTER_START } from 'src/pricing/plan-order-recalc';
import { orderNameToRestore } from 'src/recalc/assign-order-number';
import { clientAfterPhoneChange } from 'src/recalc/link-client-by-phone';
import { fromCurrency } from 'src/recalc/money';
import { recalcOrder } from 'src/recalc/recalc-order';
import { type StoredFullName } from 'src/utils/full-name';
import { isEnteringWrittenOff } from 'src/warehouse/plan-order-materials';

type UpdatedOrder = {
  status: string | null;
  installedAt: string | null;
  readyAt: string | null;
  measuredAt: string | null;
  name: string | null;
  number: number | null;
  clientPhone: string | null;
  clientFullName: StoredFullName;
  clientId: string | null;
  cancelReason: string | null;
  productionStartDate: string | null;
  installationDeadline: string | null;
  total: { amountMicros?: number | string | null } | null;
};

// Fields that matter to the client alone; the order's own sums do not move.
const CLIENT_ONLY_FIELDS = ['clientId', 'cancelReason'];

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

    const movedClientId = await clientAfterPhoneChange(client, {
      clientId: after.clientId ?? null,
      clientFullName: after.clientFullName,
      previousPhone: before.clientPhone ?? null,
      phone: after.clientPhone ?? null,
    });

    if (movedClientId !== null) {
      await client.mutation({
        updateOrder: {
          __args: { id: payload.recordId, data: { clientId: movedClientId } },
          id: true,
        },
      });
    }
  }

  const statusChanged = updatedFields.includes('status');

  const installedAt = statusChanged
    ? installedAtOnStatusChange({
        status: after.status ?? null,
        previousStatus: before.status ?? null,
        installedAt: after.installedAt ?? null,
        installedAtTyped: updatedFields.includes('installedAt'),
        today: todayInTashkent(),
      })
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

  const productionStartDate = statusChanged
    ? productionStartOnStatusChange({
        status: after.status ?? null,
        productionStartDate: after.productionStartDate ?? null,
        today: todayInTashkent(),
      })
    : null;

  const installationDeadline = updatedFields.includes('productionStartDate')
    ? deadlineOnStartChange({
        previousStart: before.productionStartDate ?? null,
        start: after.productionStartDate ?? null,
        deadline: after.installationDeadline ?? null,
        deadlineTyped: updatedFields.includes('installationDeadline'),
        daysAfterStart: INSTALLATION_DAYS_AFTER_START,
      })
    : undefined;

  // One mutation, so INSTALLED does not fire the trigger twice.
  const stamps: Record<string, unknown> = {
    ...(productionStartDate !== null && { productionStartDate }),
    ...(installationDeadline !== undefined && { installationDeadline }),
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

  if (updatedFields.some((field) => !CLIENT_ONLY_FIELDS.includes(field))) {
    await recalcOrder(client, payload.recordId, {
      typedTotal: updatedFields.includes('total')
        ? fromCurrency(after.total ?? null)
        : undefined,
      entersWrittenOff:
        statusChanged &&
        isEnteringWrittenOff({
          status: after.status ?? null,
          previousStatus: before.status ?? null,
        }),
    });
  }

  await syncOrderClient(client, {
    before: {
      clientId: before.clientId ?? null,
      status: before.status ?? null,
      cancelReason: before.cancelReason ?? null,
    },
    after: {
      clientId: after.clientId ?? null,
      status: after.status ?? null,
      cancelReason: after.cancelReason ?? null,
    },
  });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderUpdated,
  name: 'on-order-updated',
  description:
    'Restores an emptied order name, normalizes the client phone, sets the installation date, recalculates the order and its client',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'order.updated',
    updatedFields: [
      'name',
      'clientPhone',
      'status',
      'discountKind',
      'discountValue',
      'productionStartDate',
      'installationDeadline',
      'installedAt',
      'readyAt',
      'masterId',
      'masterBonus',
      'installerId',
      'soldById',
      'measurerId',
      'measuredAt',
      'areaSquareMeters',
      'subtotal',
      'total',
      'costTotal',
      // Recalcs of one order run unlocked, so a late one can write sums computed
      // before a payment existed. Watching them makes that write recalc again.
      'prepaid',
      'paid',
      'balance',
      'clientId',
      'cancelReason',
    ],
  },
  handler,
});
