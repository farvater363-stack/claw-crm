import { type CoreApiClient } from 'twenty-client-sdk/core';

import { syncOrderAccruals } from 'src/payroll/sync-order-accruals';
import { planOrderRecalc } from 'src/pricing/plan-order-recalc';
import { applyRecalcPlan } from 'src/recalc/apply-recalc-plan';
import { loadRecalcInput } from 'src/recalc/load-recalc-input';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

export const recalcOrder = async (
  client: CoreApiClient,
  orderId: string,
  options: {
    refreshPriceItemIds?: string[];
    refreshPriceExtraServiceLineIds?: string[];
    entersWrittenOff?: boolean;
  } = {},
): Promise<void> => {
  const input = await loadRecalcInput(client, orderId, {
    refreshPriceItemIds: options.refreshPriceItemIds ?? [],
    refreshPriceExtraServiceLineIds:
      options.refreshPriceExtraServiceLineIds ?? [],
  });

  if (input === null) {
    return;
  }

  await applyRecalcPlan(client, orderId, planOrderRecalc(input));

  if (
    await syncOrderMaterials(client, orderId, {
      entersWrittenOff: options.entersWrittenOff,
    })
  ) {
    await recalcWarehouse(client);
  }

  // After the totals and the master's pay are stored: the lines are built from them.
  // ponytail: one more query per recalc; skip orders with no measurement and no lines if the nightly run nears the app's 500 requests a minute.
  await syncOrderAccruals(client, orderId);
};
