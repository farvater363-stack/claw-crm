import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type RecalcPlan } from 'src/pricing/plan-order-recalc';
import { toCurrency } from 'src/recalc/money';

const CURRENCY_FIELDS = new Set([
  'subtotal',
  'discount',
  'total',
  'prepayment',
  'balance',
  'costTotal',
  'margin',
  'masterBonus',
  'masterPayCalculated',
  'masterPenalty',
  'masterPayTotal',
  'pricePerSquareMeter',
  'costPerSquareMeter',
  'lineTotal',
  'lineCost',
  'price',
  'cost',
]);

const toRecordData = (update: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(update).map(([key, value]) => [
      key,
      CURRENCY_FIELDS.has(key) ? toCurrency(value as number | null) : value,
    ]),
  );

export const applyRecalcPlan = async (
  client: CoreApiClient,
  orderId: string,
  plan: RecalcPlan,
): Promise<void> => {
  for (const { id, update } of plan.itemUpdates) {
    await client.mutation({
      updateOrderItem: { __args: { id, data: toRecordData(update) }, id: true },
    });
  }

  for (const { id, update } of plan.extraServiceLineUpdates) {
    await client.mutation({
      updateOrderExtraService: {
        __args: { id, data: toRecordData(update) },
        id: true,
      },
    });
  }

  if (Object.keys(plan.orderUpdate).length > 0) {
    await client.mutation({
      updateOrder: {
        __args: { id: orderId, data: toRecordData(plan.orderUpdate) },
        id: true,
      },
    });
  }
};
