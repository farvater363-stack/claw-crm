import { type CoreApiClient } from 'twenty-client-sdk/core';

import { syncContractState } from 'src/contract/sync-contract-state';
import { syncOrderAccruals } from 'src/payroll/sync-order-accruals';
import {
  isEmptyRecalcPlan,
  planOrderRecalc,
} from 'src/pricing/plan-order-recalc';
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
    linesRemoved?: boolean;
    typedTotal?: number | null;
    recostCustomItems?: boolean;
    // The event is only the recalc's own sums coming back; the run that wrote
    // them has done the pay lines, contract and materials already.
    stopIfUnchanged?: boolean;
  } = {},
): Promise<void> => {
  const refresh = {
    refreshPriceItemIds: options.refreshPriceItemIds ?? [],
    refreshPriceExtraServiceLineIds:
      options.refreshPriceExtraServiceLineIds ?? [],
    linesRemoved: options.linesRemoved,
    typedTotal: options.typedTotal,
    recostCustomItems: options.recostCustomItems,
  };
  const input = await loadRecalcInput(client, orderId, refresh);

  if (input === null) {
    return;
  }

  const plan = planOrderRecalc(input);

  // Only an order with lines derives all of its sums; one without keeps a
  // typed area that the pay lines are read from. A late run of the same order
  // that wrote stale pay lines is not caught by this either way.
  if (
    options.stopIfUnchanged &&
    isEmptyRecalcPlan(plan) &&
    input.items.length + input.extraServiceLines.length > 0
  ) {
    return;
  }

  await applyRecalcPlan(client, orderId, plan);

  // Straight after the totals and the master's pay are stored, which is all the lines are built from:
  // nothing runs this again for an installed order, so a failure in the stock steps below must not leave it without pay lines.
  // ponytail: one more query per recalc; skip orders with no measurement and no lines if the nightly run nears the app's 500 requests a minute.
  if (await syncOrderAccruals(client, orderId)) {
    // The order's cost counts its pay lines, and those have just changed.
    // The typed total is already stored as the sum; adding the discount again
    // would move it.
    const withNewPay = await loadRecalcInput(client, orderId, {
      ...refresh,
      typedTotal: undefined,
    });

    if (withNewPay !== null) {
      await applyRecalcPlan(client, orderId, planOrderRecalc(withNewPay));
    }
  }

  // The signed terms count the total, so this runs once the totals are stored.
  // A failure here must not hold back the stock write-off below.
  try {
    await syncContractState(client, orderId);
  } catch (error) {
    console.error(`recalc: contract state of order ${orderId} failed`, error);
  }

  if (
    await syncOrderMaterials(client, orderId, {
      entersWrittenOff: options.entersWrittenOff,
      catalog: input.demandCatalog,
    })
  ) {
    await recalcWarehouse(client);
  }
};
