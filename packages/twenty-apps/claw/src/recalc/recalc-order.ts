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
  const refresh = {
    refreshPriceItemIds: options.refreshPriceItemIds ?? [],
    refreshPriceExtraServiceLineIds:
      options.refreshPriceExtraServiceLineIds ?? [],
  };
  const input = await loadRecalcInput(client, orderId, refresh);

  if (input === null) {
    return;
  }

  await applyRecalcPlan(client, orderId, planOrderRecalc(input));

  // Straight after the totals and the master's pay are stored, which is all the lines are built from:
  // nothing runs this again for an installed order, so a failure in the stock steps below must not leave it without pay lines.
  // ponytail: one more query per recalc; skip orders with no measurement and no lines if the nightly run nears the app's 500 requests a minute.
  if (await syncOrderAccruals(client, orderId)) {
    // The order's cost counts its pay lines, and those have just changed.
    const withNewPay = await loadRecalcInput(client, orderId, refresh);

    if (withNewPay !== null) {
      await applyRecalcPlan(client, orderId, planOrderRecalc(withNewPay));
    }
  }

  if (
    await syncOrderMaterials(client, orderId, {
      entersWrittenOff: options.entersWrittenOff,
    })
  ) {
    await recalcWarehouse(client);
  }
};
