import { type CoreApiClient } from 'twenty-client-sdk/core';

import { toCurrency } from 'src/recalc/money';
import { type WarehouseRecalcPlan } from 'src/warehouse/plan-warehouse-recalc';

export const applyWarehouseRecalcPlan = async (
  client: CoreApiClient,
  plan: WarehouseRecalcPlan,
): Promise<void> => {
  for (const { id, update } of plan.movementUpdates) {
    await client.mutation({
      updateStockMovement: { __args: { id, data: update }, id: true },
    });
  }

  for (const { id, update } of plan.normUpdates) {
    await client.mutation({
      updateMaterialNorm: { __args: { id, data: update }, id: true },
    });
  }

  for (const { id, update } of plan.materialUpdates) {
    const { lastPurchasePrice, averagePrice, ...rest } = update;
    const data = {
      ...rest,
      ...(lastPurchasePrice !== undefined && {
        lastPurchasePrice: toCurrency(lastPurchasePrice),
      }),
      ...(averagePrice !== undefined && {
        averagePrice: toCurrency(averagePrice),
      }),
    };

    await client.mutation({
      updateMaterial: { __args: { id, data }, id: true },
    });
  }

  for (const { id, update } of plan.lineUpdates) {
    await client.mutation({
      updateOrderMaterial: { __args: { id, data: update }, id: true },
    });
  }

  for (const { id, update } of plan.orderUpdates) {
    await client.mutation({
      updateOrder: { __args: { id, data: update }, id: true },
    });
  }
};
