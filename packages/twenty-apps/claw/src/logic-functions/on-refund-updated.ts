import {
  defineLogicFunction,
  type DatabaseEventPayload,
  type ObjectRecordUpdateEvent,
} from 'twenty-sdk/define';

import { type Wallet } from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { followRefundEntry } from 'src/orders/paid-money-on-cancel';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { fromCurrency } from 'src/recalc/money';
import { recalcOrder } from 'src/recalc/recalc-order';

type MoneyEntryRecord = {
  kind: string | null;
  orderId: string | null;
  amount: { amountMicros?: number | string | null } | null;
  wallet: string | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordUpdateEvent<MoneyEntryRecord>>,
): Promise<void> => {
  const { before, after } = payload.properties;
  const client = createRecalcClient();
  const orderIds = new Set(
    [before, after]
      .filter((side) => side.kind === 'REFUND' && side.orderId)
      .map((side) => side.orderId as string),
  );

  for (const orderId of orderIds) {
    await recalcOrder(client, orderId);
  }

  if (after.kind === 'REFUND' && after.orderId) {
    await followRefundEntry(client, {
      id: payload.recordId,
      orderId: after.orderId,
      amount: fromCurrency(after.amount),
      wallet: (after.wallet ?? null) as Wallet | null,
    });
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.onRefundUpdated,
  name: 'on-refund-updated',
  description:
    'Recalculates the order of a refund changed in «Деньги» and carries the new sum into its cancel answer',
  timeoutSeconds: 30,
  databaseEventTriggerSettings: {
    eventName: 'moneyEntry.updated',
    // `deletedAt` is in: an upsert that brings a deleted refund back arrives
    // as an update, not as a restore.
    // `date` is in: a refund before the workshop start counts off «Предоплата».
    updatedFields: ['amount', 'wallet', 'date', 'kind', 'orderId', 'deletedAt'],
  },
  handler,
});
