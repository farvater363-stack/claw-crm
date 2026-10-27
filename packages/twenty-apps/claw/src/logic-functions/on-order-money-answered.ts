import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { type Wallet } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { followRefundAnswer } from 'src/orders/paid-money-on-cancel';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { fromCurrency } from 'src/recalc/money';

type AnsweredOrder = {
  name: string | null;
  status: string | null;
  paidMoneyOnCancel: string | null;
  refundAmount: { amountMicros?: number | string | null } | null;
  refundWallet: string | null;
  refundEntryId: string | null;
};

// Here and not in the screens: a manager may answer, but only the app may
// write in «Деньги».
const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<AnsweredOrder>>,
): Promise<void> => {
  const { after } = payload.properties;

  await followRefundAnswer(createRecalcClient(), {
    id: payload.recordId,
    name: after.name ?? '',
    status: after.status ?? null,
    answer: after.paidMoneyOnCancel ?? null,
    refundAmount: fromCurrency(after.refundAmount ?? null),
    refundWallet: (after.refundWallet ?? null) as Wallet | null,
    refundEntryId: after.refundEntryId ?? null,
  });
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onOrderMoneyAnswered,
  name: 'on-order-money-answered',
  description:
    'Writes the refund of a cancelled order in «Деньги» when its money is answered as returned, and removes it otherwise',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'order.updated',
    updatedFields: ['paidMoneyOnCancel', 'refundAmount', 'refundWallet'],
  },
  handler,
});
