import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { assignOrderNumber } from 'src/recalc/assign-order-number';
import { linkClientByPhone } from 'src/recalc/link-client-by-phone';
import { recalcOrder } from 'src/recalc/recalc-order';

type CreatedOrder = {
  id: string;
  number: number | null;
  clientId: string | null;
  measurerId: string | null;
  clientName: string | null;
  clientPhone: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<CreatedOrder>>,
): Promise<void> => {
  const client = new CoreApiClient();
  const order = payload.properties.after;
  const data: Record<string, unknown> = {};

  // Imported orders arrive with a number; only new ones get the next one.
  if ((order.number ?? null) === null) {
    Object.assign(data, await assignOrderNumber(client));
  }

  if ((order.measurerId ?? null) === null && payload.workspaceMemberId) {
    data.measurerId = payload.workspaceMemberId;
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

  await recalcOrder(client, payload.recordId);
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderCreated,
  name: 'on-order-created',
  description:
    'Numbers a new order, links the client by phone and calculates totals',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'order.created' },
  handler,
});
