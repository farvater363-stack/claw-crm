import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { syncOrderClient } from 'src/clients/sync-order-client';
import { IDS } from 'src/constants/universal-identifiers';
import { measuredAtOnStatusChange } from 'src/pricing/dates';
import { assignOrderNumber } from 'src/recalc/assign-order-number';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { findWorkerIdByLogin } from 'src/recalc/find-worker-by-login';
import { linkClientByPhone } from 'src/recalc/link-client-by-phone';
import { recalcOrder } from 'src/recalc/recalc-order';
import { isEnteringWrittenOff } from 'src/warehouse/plan-order-materials';

type CreatedOrder = {
  id: string;
  number: number | null;
  clientId: string | null;
  measurerId: string | null;
  soldById: string | null;
  clientName: string | null;
  clientPhone: string | null;
  status: string | null;
  measuredAt: string | null;
  cancelReason: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<CreatedOrder>>,
): Promise<void> => {
  const client = createRecalcClient();
  const order = payload.properties.after;
  const data: Record<string, unknown> = {};

  // Imported orders arrive with a number; only new ones get the next one.
  if ((order.number ?? null) === null) {
    Object.assign(data, await assignOrderNumber(client));
  }

  if ((order.measurerId ?? null) === null && payload.workspaceMemberId) {
    data.measurerId = payload.workspaceMemberId;
  }

  // Whoever created the order sold it; an order made by somebody without a worker (a website lead) pays no percent.
  if ((order.soldById ?? null) === null && payload.workspaceMemberId) {
    const soldById = await findWorkerIdByLogin(
      client,
      payload.workspaceMemberId,
    );

    if (soldById !== null) {
      data.soldById = soldById;
    }
  }

  // The measurement form creates an order that is already measured.
  const measuredAt = measuredAtOnStatusChange({
    status: order.status ?? null,
    measuredAt: order.measuredAt ?? null,
    now: new Date(),
  });

  if (measuredAt !== null) {
    data.measuredAt = measuredAt;
  }

  if ((order.clientId ?? null) === null) {
    const clientId = await linkClientByPhone(client, {
      clientName: order.clientName ?? null,
      clientPhone: order.clientPhone ?? null,
    });

    if (clientId !== null) {
      data.clientId = clientId;
    }
  }

  if (Object.keys(data).length > 0) {
    await client.mutation({
      updateOrder: { __args: { id: payload.recordId, data }, id: true },
    });
  }

  await recalcOrder(client, payload.recordId, {
    entersWrittenOff: isEnteringWrittenOff({
      status: order.status ?? null,
      previousStatus: null,
    }),
  });

  await syncOrderClient(client, {
    before: null,
    after: {
      clientId: (data.clientId as string | undefined) ?? order.clientId ?? null,
      status: order.status ?? null,
      cancelReason: order.cancelReason ?? null,
    },
  });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderCreated,
  name: 'on-order-created',
  description:
    "Numbers a new order, links the client by phone, records who sold it, calculates totals and the client's next call",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.created' },
  handler,
});
