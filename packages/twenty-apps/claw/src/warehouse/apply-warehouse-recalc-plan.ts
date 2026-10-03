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
    const { lastPurchasePrice, ...rest } = update;
    const data =
      lastPurchasePrice === undefined
        ? rest
        : { ...rest, lastPurchasePrice: toCurrency(lastPurchasePrice) };

    await client.mutation({
      updateMaterial: { __args: { id, data }, id: true },
    });
  }
};
