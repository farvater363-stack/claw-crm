import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { callSummary } from 'src/clients/call-summary';
import { callBackAfterCall } from 'src/clients/client-summary';
import { type CallResult } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { todayInTashkent } from 'src/pricing/dates';
import { createRecalcClient } from 'src/recalc/create-recalc-client';

type CreatedCall = {
  personId: string | null;
  result: string | null;
  note: string | null;
  nextCallAt: string | null;
};

// Every way a call is recorded moves the client's next call, not only the screen.
const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<CreatedCall>>,
): Promise<void> => {
  const call = payload.properties.after;

  if (!call.personId) return;

  const callBack = callBackAfterCall({
    result: (call.result ?? null) as CallResult | null,
    nextCallAt:
      call.nextCallAt === null || call.nextCallAt === undefined
        ? null
        : String(call.nextCallAt).slice(0, 10),
  });

  await createRecalcClient().mutation({
    updatePerson: {
      __args: {
        id: call.personId,
        data: {
          lastCallAt: todayInTashkent(),
          lastCallNote: callSummary({
            result: call.result ?? null,
            note: call.note ?? null,
          }),
          callBackAt: callBack.at,
          callBackReason: callBack.reason,
        },
      },
      id: true,
    },
  });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onClientCallCreated,
  name: 'on-client-call-created',
  description:
    "Records the outcome of a call on the client and sets the client's next call",
  timeoutSeconds: 30,
  databaseEventTriggerSettings: { eventName: 'clientCall.created' },
  handler,
});
